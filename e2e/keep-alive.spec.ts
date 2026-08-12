import { test, expect } from "./fixtures";
import { openOptionsPage } from "./utils";
import type { CDPSession } from "@playwright/test";

const KEEP_ALIVE_LABEL = "Keep Background and Scheduled Scripts Alive";
const SERVICE_WORKER_URL = "/service_worker.js";
const HEARTBEAT_VALIDATION_WINDOW_MS = 31_000;

type CdpTargetMessage = {
  sessionId: string;
  message: string;
};

type CdpCommandResponse = {
  id: number;
  result?: { result?: { value?: number } };
  error?: { message?: string };
};

const isServiceWorkerAlive = async (cdp: CDPSession) => {
  const { targetInfos } = await cdp.send("Target.getTargets");
  return targetInfos.some((target) => target.type === "service_worker" && target.url.endsWith(SERVICE_WORKER_URL));
};

const sendTargetCommand = async (
  cdp: CDPSession,
  sessionId: string,
  id: number,
  method: string,
  params: Record<string, unknown> = {}
) => {
  const response = new Promise<CdpCommandResponse>((resolve, reject) => {
    const listener = (event: CdpTargetMessage) => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message) as CdpCommandResponse;
      if (message.id !== id) return;
      cdp.off("Target.receivedMessageFromTarget", listener);
      if (message.error) {
        reject(new Error(message.error.message ?? `CDP command failed: ${method}`));
        return;
      }
      resolve(message);
    };
    cdp.on("Target.receivedMessageFromTarget", listener);
  });

  await cdp.send("Target.sendMessageToTarget", {
    sessionId,
    message: JSON.stringify({ id, method, params }),
  });
  return response;
};

test.describe("Chrome MV3 service worker keep-alive", () => {
  test("offscreen runtime heartbeat keeps the service worker active", async ({ context, extensionId }) => {
    const optionsPage = await openOptionsPage(context, extensionId);
    const cdp = await context.newCDPSession(optionsPage);

    try {
      await optionsPage.goto(`chrome-extension://${extensionId}/src/options.html#/settings`);
      const label = optionsPage.getByText(KEEP_ALIVE_LABEL, { exact: true });
      await label.scrollIntoViewIfNeeded();

      const keepAliveSwitch = label.locator("xpath=../..").getByRole("switch");
      await expect(keepAliveSwitch).toBeVisible();
      await expect(keepAliveSwitch).toHaveAttribute("aria-checked", "false");

      await expect
        .poll(
          async () => {
            return isServiceWorkerAlive(cdp);
          },
          { timeout: 15_000 }
        )
        .toBe(true);

      await keepAliveSwitch.click();
      await expect(keepAliveSwitch).toHaveAttribute("aria-checked", "true");

      const startedAt = Date.now();
      await expect
        .poll(
          async () => {
            const serviceWorkerAlive = await isServiceWorkerAlive(cdp);
            return Date.now() - startedAt >= HEARTBEAT_VALIDATION_WINDOW_MS && serviceWorkerAlive;
          },
          { timeout: HEARTBEAT_VALIDATION_WINDOW_MS + 10_000, interval: 1_000 }
        )
        .toBe(true);
    } finally {
      await optionsPage.close();
    }
  });

  test("disabling the setting allows the service worker to become idle", async ({ context, extensionId }) => {
    const optionsPage = await openOptionsPage(context, extensionId);
    const cdp = await context.newCDPSession(optionsPage);
    let offscreenSessionId: string | undefined;
    let nextCommandId = 1;

    try {
      await optionsPage.goto(`chrome-extension://${extensionId}/src/options.html#/settings`);
      const label = optionsPage.getByText(KEEP_ALIVE_LABEL, { exact: true });
      await label.scrollIntoViewIfNeeded();

      const keepAliveSwitch = label.locator("xpath=../..").getByRole("switch");
      await expect(keepAliveSwitch).toBeVisible();
      await expect(keepAliveSwitch).toHaveAttribute("aria-checked", "false");

      await expect
        .poll(
          async () => {
            const { targetInfos } = await cdp.send("Target.getTargets");
            return targetInfos.some((target) => target.url.endsWith("/src/offscreen.html"));
          },
          { timeout: 15_000 }
        )
        .toBe(true);

      const { targetInfos } = await cdp.send("Target.getTargets");
      const offscreenTarget = targetInfos.find((target) => target.url.endsWith("/src/offscreen.html"));
      expect(offscreenTarget).toBeDefined();
      ({ sessionId: offscreenSessionId } = await cdp.send("Target.attachToTarget", {
        targetId: offscreenTarget!.targetId,
        flatten: false,
      }));
      await sendTargetCommand(cdp, offscreenSessionId, nextCommandId++, "Runtime.enable");
      await sendTargetCommand(cdp, offscreenSessionId, nextCommandId++, "Runtime.evaluate", {
        expression: `(() => {
          globalThis.__scriptcatKeepAliveHeartbeatCount = 0;
          const originalConnect = chrome.runtime.connect.bind(chrome.runtime);
          chrome.runtime.connect = (connectInfo) => {
            const port = originalConnect(connectInfo);
            if (connectInfo?.name !== "scriptcat-keep-alive") return port;
            const originalPostMessage = port.postMessage.bind(port);
            port.postMessage = (message) => {
              globalThis.__scriptcatKeepAliveHeartbeatCount += 1;
              return originalPostMessage(message);
            };
            return port;
          };
        })()`,
      });

      await keepAliveSwitch.click();
      await expect(keepAliveSwitch).toHaveAttribute("aria-checked", "true");
      const heartbeatCount = () =>
        sendTargetCommand(cdp, offscreenSessionId!, nextCommandId++, "Runtime.evaluate", {
          expression: "globalThis.__scriptcatKeepAliveHeartbeatCount",
          returnByValue: true,
        }).then((message) => message.result?.result?.value ?? 0);
      await expect.poll(heartbeatCount, { timeout: 15_000 }).toBeGreaterThan(0);

      await keepAliveSwitch.click();
      await expect(keepAliveSwitch).toHaveAttribute("aria-checked", "false");

      const countAfterDisable = await heartbeatCount();
      const stoppedAt = Date.now();
      await expect
        .poll(
          async () => {
            return (
              Date.now() - stoppedAt >= HEARTBEAT_VALIDATION_WINDOW_MS && (await heartbeatCount()) === countAfterDisable
            );
          },
          { timeout: HEARTBEAT_VALIDATION_WINDOW_MS + 10_000, interval: 1_000 }
        )
        .toBe(true);
    } finally {
      if (offscreenSessionId) {
        await cdp.send("Target.detachFromTarget", { sessionId: offscreenSessionId });
      }
      if (!optionsPage.isClosed()) await optionsPage.close();
    }
  });
});

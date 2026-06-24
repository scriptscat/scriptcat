import type { Page } from "@playwright/test";
import { testWithUserScripts as test, expect } from "./fixtures";
import { installScriptByCode, openOptionsPage } from "./utils";

/**
 * 后台脚本（offscreen/sandbox）执行路径回归 (#1457 offscreen 重构)
 *
 * #1457 把 offscreen 管理重构为 BackgroundEnvManagerBase + Chrome(OffscreenManager) /
 * Firefox(EventPageOffscreenManager) 两条分支。Chrome MV3 仍走 chrome.offscreen.createDocument。
 * 该重构有回归风险：后台脚本依赖 SW → Offscreen → Sandbox 链路。
 *
 * 这里验证 Chrome 路径仍然正常：
 *  - 新安装的 @background 脚本可通过 UI 启用
 *  - 脚本在后台 sandbox 中执行到完成状态
 *  - 后台 sandbox 具备 DOM/window；如果不存在，脚本同步 throw，runStatus 会变为 error
 *
 * 注意：不要把这个路径回归绑定到 GM value / GM.xmlHttpRequest 等额外异步 side effect。
 * 本测试只关心 offscreen/sandbox 执行链路本身；GM API 已由 GM API e2e 和单测覆盖。
 */

const SCRIPT_NAME = "E2E Background Offscreen Smoke";

const backgroundScript = `// ==UserScript==
// @name         ${SCRIPT_NAME}
// @namespace    https://e2e.test
// @version      1.0.0
// @description  background offscreen e2e
// @author       E2E
// @background
// ==/UserScript==

if (typeof document !== "object") {
  throw new Error("background sandbox document is unavailable");
}
if (typeof window !== "object") {
  throw new Error("background sandbox window is unavailable");
}
"background-offscreen-ok";
`;

type BackgroundScriptState = {
  uuid?: string;
  status?: number;
  runStatus?: string;
  error?: unknown;
  metadata?: unknown;
};

async function readBackgroundScriptState(page: Page): Promise<BackgroundScriptState | null> {
  return page.evaluate((scriptName) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (all) => {
        for (const [key, value] of Object.entries(all)) {
          if (!key.startsWith("script:")) continue;
          const script = value as any;
          if (script?.name === scriptName) {
            resolve({
              uuid: script.uuid,
              status: script.status,
              runStatus: script.runStatus,
              error: script.error,
              metadata: script.metadata,
            });
            return;
          }
        }
        resolve(null);
      });
    });
  }, SCRIPT_NAME);
}

async function waitForBackgroundComplete(page: Page): Promise<BackgroundScriptState | null> {
  const matched = await expect
    .poll(() => readBackgroundScriptState(page), {
      timeout: 20_000,
      intervals: [100, 250, 500, 1_000],
    })
    .toMatchObject({
      status: 1,
      runStatus: "complete",
    })
    .then(() => true)
    .catch(() => false);
  return matched ? readBackgroundScriptState(page) : null;
}

async function setBackgroundScriptEnabled(page: Page, enabled: boolean): Promise<void> {
  const scriptSwitch = page.locator(".arco-switch").first();
  await expect(scriptSwitch).toBeVisible({ timeout: 10_000 });
  if ((await scriptSwitch.getAttribute("aria-checked")) === String(enabled)) return;

  await scriptSwitch.click();
  await expect(scriptSwitch).toHaveAttribute("aria-checked", String(enabled), { timeout: 10_000 });
}

async function readBackgroundDiagnostics(page: Page): Promise<any> {
  return page.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (all) => {
        const scripts = Object.fromEntries(
          Object.entries(all).filter(([key]) => key.startsWith("script:") || key.startsWith("code:"))
        );
        resolve({ scripts });
      });
    });
  });
}

test.describe("Background script offscreen path (#1457)", () => {
  test("@background 脚本在 Chrome offscreen 路径下执行完成并具备 DOM 环境", async ({ context, extensionId }) => {
    await installScriptByCode(context, extensionId, backgroundScript);

    const page = await openOptionsPage(context, extensionId);
    try {
      await setBackgroundScriptEnabled(page, true);

      let state = await waitForBackgroundComplete(page);
      if (state?.runStatus !== "complete") {
        // 若启用广播在后台环境初始化期间丢失，用真实 UI 关/开重发一次启用事件。
        await setBackgroundScriptEnabled(page, false);
        await setBackgroundScriptEnabled(page, true);
        state = await waitForBackgroundComplete(page);
      }

      const complete = state?.status === 1 && state.runStatus === "complete";
      const diagnostics = complete ? null : await readBackgroundDiagnostics(page);
      expect(state, `未找到后台脚本记录，诊断: ${JSON.stringify(diagnostics)}`).not.toBeNull();
      expect(state!.error, `后台脚本执行错误: ${JSON.stringify(state!.error)}`).toBeFalsy();
      expect(complete, `后台脚本未进入 complete 状态，诊断: ${JSON.stringify(diagnostics)}`).toBe(true);
    } finally {
      await page.close();
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageSend } from "@Packages/message/types";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import type { TClientPageLoadInfo, TScriptInfo } from "@App/app/repo/scripts";
import type { Server } from "@Packages/message/server";
import { RuntimeClient } from "../service_worker/client";
import ScriptingRuntime, { serializeDocumentResponse } from "./scripting";

const makeSender = () => ({
  sendMessage: vi.fn().mockResolvedValue({ code: 0, data: undefined }),
  connect: vi.fn(),
});

const makeScript = (uuid: string): TScriptInfo =>
  ({
    uuid,
    metadata: { grant: ["GM_getValue"] },
    resource: {},
    value: {},
    flag: `${uuid}-flag`,
    code: "",
    executionHandle: `${uuid}-handle`,
    executionRunFlag: `${uuid}-run`,
  }) as unknown as TScriptInfo;

const makeRuntime = (senderToExt = makeSender(), senderToInject = makeSender()) => {
  const handlers = new Map<string, (data: unknown) => unknown>();
  const server = { on: vi.fn((action: string, handler: (data: unknown) => unknown) => handlers.set(action, handler)) };
  const runtime = new ScriptingRuntime(
    { on: vi.fn() } as unknown as Server,
    server as unknown as Server,
    senderToExt as unknown as MessageSend,
    makeSender() as unknown as CustomEventMessage,
    senderToInject as unknown as MessageSend
  );
  runtime.init();
  return { runtime, handlers, senderToExt, senderToInject };
};

describe("ScriptingRuntime MAIN transport", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not expose PAGE GM RPC before fallback selection", async () => {
    const envInfo = { userAgentData: {}, sandboxMode: "raw", isIncognito: false } as const;
    vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [makeScript("main")],
      contentScriptList: [],
      envInfo,
      mainTransportToken: "transport-token",
      mainTransportFallbackRetryAfterMs: 10000,
      userScriptInjectBootstrapToken: "transport-token",
    } as TClientPageLoadInfo);
    const { runtime, handlers, senderToInject } = makeRuntime();
    runtime.pageLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(handlers.has("pageLoadFallback")).toBe(false);
    expect(handlers.get("runtime/gmApi")).toBeDefined();
    expect(senderToInject.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: "inject/pageLoad" }));
  });

  it("activates fallback only after SW resolution and acknowledges each receipt", async () => {
    const envInfo = { userAgentData: {}, sandboxMode: "raw", isIncognito: false } as const;
    const script = makeScript("main");
    vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [script],
      contentScriptList: [],
      envInfo,
      mainTransportToken: "transport-token",
      mainTransportFallbackRetryAfterMs: 0,
      userScriptInjectBootstrapToken: "transport-token",
    } as TClientPageLoadInfo);
    vi.spyOn(RuntimeClient.prototype, "resolveMainTransport").mockResolvedValue({
      mode: "fallback",
      phase: "activating",
      transportToken: "transport-token",
      scripts: [script],
      envInfo,
    });
    const advance = vi
      .spyOn(RuntimeClient.prototype, "advanceMainFallback")
      .mockResolvedValueOnce({
        mode: "fallback",
        phase: "catching-up",
        transportToken: "transport-token",
        scripts: [script],
        envInfo,
        batch: { id: 1, valueUpdates: [], emitEvents: [] },
      })
      .mockResolvedValueOnce({
        mode: "fallback",
        phase: "ready",
        transportToken: "transport-token",
        scripts: [script],
        envInfo,
      });
    const senderToInject = makeSender();
    senderToInject.sendMessage.mockImplementation(async (message: { action: string }) =>
      message.action === "inject/fallbackBatch"
        ? { code: 0, data: { applied: true, batchId: 1 } }
        : { code: 0, data: undefined }
    );
    const { runtime } = makeRuntime(makeSender(), senderToInject);
    runtime.pageLoad();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(senderToInject.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: "inject/pageLoad" }));
    expect(senderToInject.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "inject/fallbackBatch" })
    );
    expect(advance).toHaveBeenCalledWith({ transportToken: "transport-token", ackBatchId: 1 });
  });

  it("serializes CAT_fetchDocument responses instead of returning a live document reference", () => {
    const document = new DOMParser().parseFromString("<html><body><main>ok</main></body></html>", "text/html");
    expect(serializeDocumentResponse(document, "text/html")).toEqual({
      text: expect.stringContaining("<main>ok</main>"),
      contentType: "text/html",
    });
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";
import type { MessageSend } from "@Packages/message/types";
import type { TClientPageLoadInfo, TScriptInfo } from "@App/app/repo/scripts";
import type { IGetSender, Server } from "@Packages/message/server";
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
  }) as unknown as TScriptInfo;

describe("ScriptingRuntime page bootstrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the combined page list so USER_SCRIPT content receives its bootstrap", async () => {
    const injectScript = {
      ...makeScript("inject-script"),
      name: "Inject script",
      metadata: { grant: ["GM_getValue", "GM_setValue"] },
      code: "document.documentElement.dataset.ran = 'yes'",
      value: { stored: "existing-value" },
      config: { enabled: true },
      userConfig: { profile: "custom" },
      userConfigStr: '{"profile":"custom"}',
      resource: { text: { content: "resource-data", contentType: "text/plain" } },
      requireCssResource: { style: { content: ".target { color: red; }", contentType: "text/css" } },
      executionHandle: "inject-execution-handle",
      executionRunFlag: "inject-run-flag",
    } as unknown as TScriptInfo;
    const envInfo = { userAgentData: {}, sandboxMode: "raw", isIncognito: false } as const;
    const pageLoad = vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [injectScript],
      contentScriptList: [makeScript("content-script")],
      envInfo,
      userScriptBootstrapToken: "bootstrap-token",
      userScriptInjectBootstrapToken: "inject-bootstrap-token",
    } as TClientPageLoadInfo);
    const senderToExt = makeSender();
    const senderToContent = makeSender();
    const senderToInject = makeSender();
    const handlers = new Map<string, (data: unknown) => unknown>();
    const server = {
      on: vi.fn((action: string, handler: (data: unknown) => unknown) => handlers.set(action, handler)),
    };
    const extServer = { on: vi.fn() };
    const storageLocal = chrome.storage.local as unknown as {
      onChanged?: { addListener: (listener: (changes: unknown) => void) => void };
    };
    const originalOnChanged = storageLocal.onChanged;
    storageLocal.onChanged = { addListener: vi.fn() };
    const runtime = new ScriptingRuntime(
      extServer as unknown as Server,
      server as unknown as Server,
      senderToExt as unknown as MessageSend,
      senderToContent as any,
      senderToInject as any
    );

    try {
      runtime.init();
      runtime.pageLoad();
      await Promise.resolve();
      await Promise.resolve();

      expect(pageLoad).toHaveBeenCalledWith("it");
      expect(senderToContent.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "content/pageLoad",
          data: expect.objectContaining({
            bootstrapToken: "bootstrap-token",
            extensionOrigin: {
              protocol: "chrome-extension:",
              hostname: chrome.runtime.id,
              port: "",
            },
          }),
        })
      );
      expect(senderToInject.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "inject/bootstrap",
          data: { bootstrapToken: "inject-bootstrap-token" },
        })
      );
      expect(senderToInject.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: "inject/pageLoad" })
      );

      handlers.get("pageLoadFallback")?.({});
      await Promise.resolve();
      const fallbackPageLoad = senderToInject.sendMessage.mock.calls.find(
        ([message]) => message.action === "inject/pageLoad"
      )?.[0];
      expect(fallbackPageLoad?.data).toEqual({
        scripts: [{ ...injectScript, executionEnvTag: "it" }],
        envInfo,
      });
    } finally {
      storageLocal.onChanged = originalOnChanged;
    }
  });

  it("P1-2: fallback PageRpcRegistry grants context-menu GM_registerMenuCommand and still denies GM_setValue", async () => {
    const contextMenuScript = {
      ...makeScript("context-menu-script"),
      name: "Context menu script",
      metadata: { grant: ["none"], "run-at": ["context-menu"] },
      executionHandle: undefined,
      executionRunFlag: undefined,
    } as unknown as TScriptInfo;
    const envInfo = { userAgentData: {}, sandboxMode: "raw", isIncognito: false } as const;
    vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [contextMenuScript],
      contentScriptList: [],
      envInfo,
      userScriptBootstrapToken: undefined,
      userScriptInjectBootstrapToken: "inject-bootstrap-token",
    } as TClientPageLoadInfo);
    const senderToExt = makeSender();
    const senderToContent = makeSender();
    const senderToInject = makeSender();
    const handlers = new Map<string, (data: unknown, sender: IGetSender) => unknown>();
    const server = {
      on: vi.fn((action: string, handler: (data: unknown, sender: IGetSender) => unknown) =>
        handlers.set(action, handler)
      ),
    };
    const extServer = { on: vi.fn() };
    const storageLocal = chrome.storage.local as unknown as {
      onChanged?: { addListener: (listener: (changes: unknown) => void) => void };
    };
    const originalOnChanged = storageLocal.onChanged;
    storageLocal.onChanged = { addListener: vi.fn() };
    const runtime = new ScriptingRuntime(
      extServer as unknown as Server,
      server as unknown as Server,
      senderToExt as unknown as MessageSend,
      senderToContent as any,
      senderToInject as any
    );

    try {
      runtime.init();
      runtime.pageLoad();
      await Promise.resolve();
      await Promise.resolve();

      // 触发 fallback pageLoad 取得 registry 实际签发的 executionHandle。
      handlers.get("pageLoadFallback")?.({}, undefined as unknown as IGetSender);
      await Promise.resolve();
      const fallbackPageLoad = senderToInject.sendMessage.mock.calls.find(
        ([message]) => message.action === "inject/pageLoad"
      )?.[0];
      const executionHandle = fallbackPageLoad?.data.scripts[0].executionHandle;
      expect(executionHandle).toEqual(expect.any(String));

      const gmApiHandler = handlers.get("runtime/gmApi")!;
      const noopSender = { getConnect: () => undefined } as unknown as IGetSender;

      // 修正前：GM_registerMenuCommand 会被 fallback registry 以 raw metadata 拒绝（RED）。
      await gmApiHandler(
        {
          version: 2,
          requestId: "request-1",
          sequence: 1,
          handle: executionHandle,
          api: "GM_registerMenuCommand",
          params: [],
        },
        noopSender
      );
      // broker 转发给 SW 前才补上 canonical executionHandle；页面原始 packet 里没有这个字段。
      expect(senderToExt.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "serviceWorker/runtime/gmApi",
          data: expect.objectContaining({ handle: executionHandle, executionHandle }),
        })
      );

      // 同一 binding 不能借由 context-menu 隐式授权取得其他特权 API。
      expect(() =>
        gmApiHandler(
          {
            version: 2,
            requestId: "request-2",
            sequence: 2,
            handle: executionHandle,
            api: "GM_setValue",
            params: ["a", 1],
          },
          noopSender
        )
      ).toThrow("API is not granted to this execution");
    } finally {
      storageLocal.onChanged = originalOnChanged;
    }
  });

  it("serializes CAT_fetchDocument responses instead of returning a live document reference", () => {
    const document = new DOMParser().parseFromString("<html><body><main>ok</main></body></html>", "text/html");
    expect(serializeDocumentResponse(document, "text/html")).toEqual({
      text: expect.stringContaining("<main>ok</main>"),
      contentType: "text/html",
    });
  });
});

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
          action: "inject/pageLoad",
          data: { scripts: [injectScript], envInfo },
        })
      );
    } finally {
      storageLocal.onChanged = originalOnChanged;
    }
  });

  it("P1-2: PageRpcRegistry grants context-menu GM_registerMenuCommand and still denies GM_setValue", async () => {
    const contextMenuScript = {
      ...makeScript("context-menu-script"),
      name: "Context menu script",
      metadata: { grant: ["none"], "run-at": ["context-menu"] },
      // v2 执行句柄必须由 service worker 签发；这里模拟 SW 已签发的 canonical 句柄。
      executionHandle: "context-menu-handle",
      executionRunFlag: "context-menu-run-flag",
    } as unknown as TScriptInfo;
    const envInfo = { userAgentData: {}, sandboxMode: "raw", isIncognito: false } as const;
    vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [contextMenuScript],
      contentScriptList: [],
      envInfo,
      userScriptBootstrapToken: undefined,
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

      const pageLoadMessage = senderToInject.sendMessage.mock.calls.find(
        ([message]) => message.action === "inject/pageLoad"
      )?.[0];
      const executionHandle = pageLoadMessage?.data.scripts[0].executionHandle;
      expect(executionHandle).toBe("context-menu-handle");

      const gmApiHandler = handlers.get("runtime/gmApi")!;
      const noopSender = { getConnect: () => undefined } as unknown as IGetSender;

      // 修正前：GM_registerMenuCommand 会被 fallback registry 以 raw metadata 拒绝（RED）。
      await gmApiHandler(
        {
          version: 2,
          sequence: 1,
          handle: executionHandle,
          api: "GM_registerMenuCommand",
          params: [],
        },
        noopSender
      );
      // wire 身份只有 handle：不再重复携带 executionHandle，canonical uuid/runFlag 由 SW 解析。
      expect(senderToExt.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "serviceWorker/runtime/gmApi",
          data: { version: 2, sequence: 1, handle: executionHandle, api: "GM_registerMenuCommand", params: [] },
        })
      );

      // 同一 binding 不能借由 context-menu 隐式授权取得其他特权 API。
      expect(() =>
        gmApiHandler(
          {
            version: 2,
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

  it("drops a script missing its authoritative execution handle and still delivers its siblings", async () => {
    // v2 执行句柄必须由 service worker 签发；content 不再为缺失句柄的脚本伪造替代句柄，
    // 该脚本应被丢弃，其余脚本仍正常送达，pageLoad 本身不应失败。
    const missingHandleScript = {
      ...makeScript("missing-handle-script"),
      executionHandle: undefined,
      executionRunFlag: undefined,
    } as unknown as TScriptInfo;
    const boundScript = {
      ...makeScript("bound-script"),
      executionHandle: "bound-handle",
      executionRunFlag: "bound-run-flag",
    } as unknown as TScriptInfo;
    const envInfo = { userAgentData: {}, sandboxMode: "raw", isIncognito: false } as const;
    vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [missingHandleScript, boundScript],
      contentScriptList: [],
      envInfo,
      userScriptBootstrapToken: undefined,
    } as TClientPageLoadInfo);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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

      const pageLoadMessage = senderToInject.sendMessage.mock.calls.find(
        ([message]) => message.action === "inject/pageLoad"
      )?.[0];

      expect(pageLoadMessage?.data.scripts).toEqual([boundScript]);
      expect(warn).toHaveBeenCalledTimes(1);
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

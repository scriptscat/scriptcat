import { describe, expect, it, vi, afterEach } from "vitest";
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

const makeScript = (uuid: string, grants = ["GM_getValue"]): TScriptInfo =>
  ({
    uuid,
    metadata: { grant: grants },
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
    const pageLoad = vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [makeScript("inject-script")],
      contentScriptList: [makeScript("content-script")],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
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
    const storageLocal = chrome.storage.local as unknown as {
      onChanged?: { addListener: (listener: (changes: unknown) => void) => void };
    };
    const originalOnChanged = storageLocal.onChanged;
    storageLocal.onChanged = { addListener: vi.fn() };
    const runtime = new ScriptingRuntime(
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
      expect(senderToInject.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "inject/pageLoadFallback",
          data: expect.objectContaining({ scripts: [] }),
        })
      );
    } finally {
      storageLocal.onChanged = originalOnChanged;
    }
  });

  it("forwards the empty native reconciliation bootstrap to the inject world", async () => {
    vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [],
      contentScriptList: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      userScriptInjectBootstrapToken: "reconcile-token",
    } as TClientPageLoadInfo);
    const storageLocal = chrome.storage.local as unknown as {
      onChanged?: { addListener: (listener: (changes: unknown) => void) => void };
    };
    const originalOnChanged = storageLocal.onChanged;
    storageLocal.onChanged = { addListener: vi.fn() };
    const senderToInject = makeSender();
    const runtime = new ScriptingRuntime(
      {
        on: vi.fn(),
      } as unknown as Server,
      makeSender() as unknown as MessageSend,
      makeSender() as unknown as CustomEventMessage,
      senderToInject as unknown as MessageSend
    );

    try {
      runtime.init();
      runtime.pageLoad();
      await Promise.resolve();
      await Promise.resolve();

      expect(senderToInject.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "inject/bootstrap",
          data: { bootstrapToken: "reconcile-token" },
        })
      );
    } finally {
      storageLocal.onChanged = originalOnChanged;
    }
  });

  it("keeps MAIN privileged grants and values off the page bridge fallback", async () => {
    const script = {
      ...makeScript("inject-script", ["none"]),
      value: { privateValue: "secret" },
      config: { privateConfig: "secret" },
      userConfig: { privateUserConfig: "secret" },
      userConfigStr: "private config",
      resource: { privateResource: { content: "secret", contentType: "text/plain" } },
      requireCssResource: { privateCss: { content: "secret", contentType: "text/css" } },
      executionHandle: "private-handle",
      executionEnvTag: "it",
      executionRunFlag: "private-run-flag",
    } as unknown as TScriptInfo;
    vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [script],
      contentScriptList: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      userScriptInjectBootstrapToken: "inject-bootstrap-token",
    } as TClientPageLoadInfo);
    const storageLocal = chrome.storage.local as unknown as {
      onChanged?: { addListener: (listener: (changes: unknown) => void) => void };
    };
    const originalOnChanged = storageLocal.onChanged;
    storageLocal.onChanged = { addListener: vi.fn() };
    const senderToInject = makeSender();
    const handlers = new Map<string, (data: unknown) => unknown>();
    const runtime = new ScriptingRuntime(
      {
        on: vi.fn((action: string, handler: (data: unknown) => unknown) => handlers.set(action, handler)),
      } as unknown as Server,
      makeSender() as unknown as MessageSend,
      makeSender() as any,
      senderToInject as any
    );

    try {
      runtime.init();
      runtime.pageLoad();
      await Promise.resolve();
      await Promise.resolve();
      handlers.get("pageLoadFallback")?.({});
      await Promise.resolve();

      const fallback = senderToInject.sendMessage.mock.calls.find(
        ([message]) => (message as { action?: string }).action === "inject/pageLoadFallback"
      )?.[0] as { data?: { scripts?: Array<Record<string, unknown>> } } | undefined;
      expect(fallback?.data?.scripts).toHaveLength(1);
      const [fallbackScript] = fallback!.data!.scripts!;
      expect(fallbackScript).not.toHaveProperty("executionHandle");
      expect(fallbackScript).not.toHaveProperty("executionEnvTag");
      expect(fallbackScript).not.toHaveProperty("executionRunFlag");
      expect(fallbackScript.value).toEqual({});
      expect(fallbackScript.config).toBeUndefined();
      expect(fallbackScript.userConfig).toBeUndefined();
      expect(fallbackScript.userConfigStr).toBe("");
      expect(fallbackScript.resource).toEqual({});
      expect(fallbackScript.requireCssResource).toEqual({});
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

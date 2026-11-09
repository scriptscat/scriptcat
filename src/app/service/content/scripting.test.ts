import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import ScriptingRuntime from "./scripting";
import type { ValueUpdateDataEncoded } from "./types";

type Handler = (data: any) => any;

const createServer = () => {
  const handlers = new Map<string, Handler>();
  return {
    server: { on: (name: string, fn: Handler) => handlers.set(name, fn) } as unknown as Server,
    handlers,
  };
};

const createPageSender = () => {
  const sendMessage = vi.fn().mockResolvedValue({ code: 0, data: undefined });
  return { sender: { sendMessage } as unknown as CustomEventMessage, sendMessage };
};

const valueUpdate = (storageName: string): ValueUpdateDataEncoded => ({
  id: "id-1",
  entries: [["k", "v", undefined] as any],
  uuid: "uuid-1",
  storageName,
  sender: { runFlag: "", tabId: 1 },
  valueUpdated: true,
});

const actionsOf = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map(([msg]) => msg.action);

describe("ScriptingRuntime 值更新投递", () => {
  let storageListeners: Array<(changes: Record<string, chrome.storage.StorageChange>) => void>;
  let originalOnChanged: unknown;

  beforeEach(() => {
    storageListeners = [];
    originalOnChanged = (chrome.storage.local as any).onChanged;
    (chrome.storage.local as any).onChanged = {
      addListener: (fn: (typeof storageListeners)[number]) => storageListeners.push(fn),
    };
  });

  afterEach(() => {
    (chrome.storage.local as any).onChanged = originalOnChanged;
  });

  const setup = (pageLoadData?: unknown) => {
    const ext = createServer();
    const page = createServer();
    const toContent = createPageSender();
    const toInject = createPageSender();
    const senderToExt = {
      sendMessage: vi.fn().mockResolvedValue({ code: 0, data: pageLoadData ?? { ok: false } }),
    } as unknown as MessageSend;
    const runtime = new ScriptingRuntime(ext.server, page.server, senderToExt, toContent.sender, toInject.sender);
    runtime.init();
    return { runtime, ext, toContent, toInject };
  };

  // 每个页面的每个 frame 都有 scripting.js；若它监听 storage.local，任何一次 local 写入
  // （包括整包 value:*）的新旧值都会被序列化投递到所有 frame，见 #1834。
  it("chrome.storage.local 的变化不会被转发给页面", async () => {
    const { toContent, toInject } = setup();

    for (const fn of storageListeners) {
      fn({
        valueUpdateDelivery: { newValue: { rId: "1", sendData: valueUpdate("s1") } },
        "value:s1": { newValue: { data: { k: "v" } }, oldValue: { data: {} } },
      });
    }
    await Promise.resolve();

    expect(storageListeners).toHaveLength(0);
    expect(toContent.sendMessage).not.toHaveBeenCalled();
    expect(toInject.sendMessage).not.toHaveBeenCalled();
  });

  it("pageLoad 之后，runtime/valueUpdate 只转发给运行了该 storageName 的一侧", async () => {
    const { runtime, ext, toContent, toInject } = setup({
      ok: true,
      injectScriptList: [{ uuid: "a", metadata: { storagename: ["page-store"] } }],
      contentScriptList: [{ uuid: "b", metadata: { storagename: ["content-store"] } }],
      envInfo: {},
    });
    runtime.pageLoad();
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/pageLoad"));
    toContent.sendMessage.mockClear();
    toInject.sendMessage.mockClear();

    await ext.handlers.get("runtime/valueUpdate")!(valueUpdate("page-store"));
    expect(actionsOf(toInject.sendMessage)).toEqual(["inject/runtime/valueUpdate"]);
    expect(toContent.sendMessage).not.toHaveBeenCalled();

    toInject.sendMessage.mockClear();
    await ext.handlers.get("runtime/valueUpdate")!(valueUpdate("content-store"));
    expect(actionsOf(toContent.sendMessage)).toEqual(["content/runtime/valueUpdate"]);
    expect(toInject.sendMessage).not.toHaveBeenCalled();

    toContent.sendMessage.mockClear();
    await ext.handlers.get("runtime/valueUpdate")!(valueUpdate("other-store"));
    expect(toContent.sendMessage).not.toHaveBeenCalled();
    expect(toInject.sendMessage).not.toHaveBeenCalled();
  });

  it("pageLoad 尚未返回时，runtime/valueUpdate 同时转发给 page 与 content", async () => {
    const { ext, toContent, toInject } = setup();

    await ext.handlers.get("runtime/valueUpdate")!(valueUpdate("any-store"));

    expect(actionsOf(toContent.sendMessage)).toEqual(["content/runtime/valueUpdate"]);
    expect(actionsOf(toInject.sendMessage)).toEqual(["inject/runtime/valueUpdate"]);
  });
});

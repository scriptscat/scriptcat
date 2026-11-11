import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server } from "@Packages/message/server";
import type { MessageConnect, MessageSend, TMessage } from "@Packages/message/types";
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
    let portMessage: (message: TMessage) => void = () => undefined;
    const portSend = vi.fn();
    const onPortMessage = vi.fn((fn: (message: TMessage) => void) => (portMessage = fn));
    const port = {
      sendMessage: portSend,
      onMessage: onPortMessage,
      onDisconnect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as MessageConnect;
    const senderToExt = {
      sendMessage: vi.fn().mockResolvedValue({ code: 0, data: pageLoadData ?? { ok: false } }),
      connect: vi.fn().mockResolvedValue(port),
    } as unknown as MessageSend;
    const runtime = new ScriptingRuntime(ext.server, page.server, senderToExt, toContent.sender, toInject.sender);
    runtime.init();
    return {
      runtime,
      ext,
      toContent,
      toInject,
      portSend,
      onPortMessage,
      senderToExt,
      receive: (message: TMessage) => portMessage(message),
    };
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

  it("Port 只转发给当前 frame 运行的脚本世界，且先订阅再启动脚本", async () => {
    const { runtime, toContent, toInject, portSend, onPortMessage, receive } = setup({
      ok: true,
      injectScriptList: [
        { uuid: "a", metadata: { storagename: ["page-store"] } },
        { uuid: "c", metadata: { storagename: ["shared"] } },
      ],
      contentScriptList: [
        { uuid: "b", metadata: { storagename: ["content-store"] } },
        { uuid: "d", metadata: { storagename: ["shared"] } },
        { uuid: "e", metadata: { storagename: ["__proto__"] } },
      ],
      envInfo: {},
    });
    runtime.pageLoad();
    await vi.waitFor(() => expect(onPortMessage).toHaveBeenCalledOnce());
    receive({ code: 0, data: { ready: true } });
    await vi.waitFor(() =>
      expect(portSend).toHaveBeenCalledWith({
        action: "runtime/subscribeValueUpdates",
        data: {
          names: ["page-store", "shared", "content-store", "__proto__"],
          versions: expect.objectContaining({
            "page-store": { epoch: "", revision: 0 },
            shared: { epoch: "", revision: 0 },
          }),
        },
      })
    );
    expect(toContent.sendMessage).not.toHaveBeenCalled();
    expect(toInject.sendMessage).not.toHaveBeenCalled();

    receive({ action: "runtime/valueSubscriptionsReady" });
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/pageLoad"));
    toContent.sendMessage.mockClear();
    toInject.sendMessage.mockClear();

    receive({ action: "runtime/valueUpdate", data: valueUpdate("shared") });
    await Promise.resolve();
    expect(actionsOf(toContent.sendMessage)).toEqual(["content/runtime/valueUpdate"]);
    expect(actionsOf(toInject.sendMessage)).toEqual(["inject/runtime/valueUpdate"]);
    toContent.sendMessage.mockClear();
    toInject.sendMessage.mockClear();

    receive({ action: "runtime/valueUpdate", data: valueUpdate("__proto__") });
    await Promise.resolve();
    expect(actionsOf(toContent.sendMessage)).toEqual(["content/runtime/valueUpdate"]);
    expect(toInject.sendMessage).not.toHaveBeenCalled();
    toContent.sendMessage.mockClear();

    receive({ action: "runtime/valueUpdate", data: valueUpdate("page-store") });
    await Promise.resolve();
    expect(actionsOf(toInject.sendMessage)).toEqual(["inject/runtime/valueUpdate"]);
    expect(toContent.sendMessage).not.toHaveBeenCalled();

    toInject.sendMessage.mockClear();
    receive({ action: "runtime/valueUpdate", data: valueUpdate("content-store") });
    await Promise.resolve();
    expect(actionsOf(toContent.sendMessage)).toEqual(["content/runtime/valueUpdate"]);
    expect(toInject.sendMessage).not.toHaveBeenCalled();

    toContent.sendMessage.mockClear();
    receive({ action: "runtime/valueUpdate", data: valueUpdate("other-store") });
    await Promise.resolve();
    expect(toContent.sendMessage).not.toHaveBeenCalled();
    expect(toInject.sendMessage).not.toHaveBeenCalled();
  });

  it("初始 pageLoad 短暂失败后恢复，且仅下发一次脚本初始化", async () => {
    const { runtime, senderToExt, toContent, toInject } = setup({ ok: false });
    const send = vi.mocked(senderToExt.sendMessage);
    send.mockRejectedValueOnce(new Error("Service Worker is starting"));
    runtime.pageLoad();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(toContent.sendMessage).not.toHaveBeenCalled();
    expect(toInject.sendMessage).not.toHaveBeenCalled();
  });

  it("扩展 context 失效时不重试初始 pageLoad", async () => {
    vi.useFakeTimers();
    try {
      const { runtime, senderToExt } = setup();
      const send = vi.mocked(senderToExt.sendMessage);
      send.mockRejectedValue(new Error("Extension context invalidated"));
      runtime.pageLoad();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1200);
      expect(send).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pageLoad 没有运行脚本的 frame 不会订阅，释放 Port", async () => {
    const { runtime, toContent, toInject, portSend } = setup();
    runtime.pageLoad();
    await Promise.resolve();
    await Promise.resolve();
    expect(portSend).not.toHaveBeenCalled();
    expect(toContent.sendMessage).not.toHaveBeenCalled();
    expect(toInject.sendMessage).not.toHaveBeenCalled();
  });
});

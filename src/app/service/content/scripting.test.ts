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
          requestId: 1,
          versions: expect.objectContaining({
            "page-store": { epoch: "", revision: 0 },
            shared: { epoch: "", revision: 0 },
          }),
        },
      })
    );
    expect(toContent.sendMessage).not.toHaveBeenCalled();
    expect(toInject.sendMessage).not.toHaveBeenCalled();

    receive({ action: "runtime/valueSubscriptionsReady", data: { requestId: 1 } });
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

  it("同一 storageName 的脚本在 pageLoad 读取到不同 revision 时统一为最新快照", async () => {
    const { runtime, receive, onPortMessage, toInject } = setup({
      ok: true,
      injectScriptList: [
        { uuid: "older", metadata: { storagename: ["shared"] }, value: { x: 1 },
          valueRevision: 1, valueEpoch: "g" },
        { uuid: "newer", metadata: { storagename: ["shared"] }, value: { x: 2 },
          valueRevision: 2, valueEpoch: "g" },
      ],
      contentScriptList: [],
      envInfo: {},
    });
    runtime.pageLoad();
    await vi.waitFor(() => expect(onPortMessage).toHaveBeenCalledOnce());
    receive({ code: 0, data: { ready: true } });
    receive({ action: "runtime/valueSubscriptionsReady", data: { requestId: 1 } });
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/pageLoad"));
    const payload = toInject.sendMessage.mock.calls.find(([message]) => message.action === "inject/pageLoad")?.[0];
    expect(payload.data.scripts.map((script: { value: { x: number }; valueRevision: number }) =>
      [script.value.x, script.valueRevision]
    )).toEqual([[2, 2], [2, 2]]);
  });

  it("注入前收到较新的 snapshot 时保留用户配置的默认值", async () => {
    const { runtime, receive, onPortMessage, toInject } = setup({
      ok: true,
      injectScriptList: [{
        uuid: "config", metadata: { storagename: ["settings"] },
        value: { "general.theme": "light" }, valueRevision: 1, valueEpoch: "e",
        config: { general: { theme: { default: "light" } } },
      }],
      contentScriptList: [],
      envInfo: {},
    });
    runtime.pageLoad();
    await vi.waitFor(() => expect(onPortMessage).toHaveBeenCalledOnce());
    receive({ code: 0, data: { ready: true } });
    receive({ action: "runtime/valueSubscriptionsReady", data: {
      requestId: 1,
      snapshots: [{ storageName: "settings", revision: 2, epoch: "e", values: { x: 2 } }],
    } });
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/pageLoad"));
    const script = toInject.sendMessage.mock.calls.find(([msg]) => msg.action === "inject/pageLoad")?.[0].data
      .scripts[0];
    expect(script.value).toMatchObject({ x: 2, "general.theme": "light" });
  });

  it("Port snapshot 与后续 updates 按 revision 收敛，丢失中间事件时刷新权威状态", async () => {
    const { runtime, receive, onPortMessage, toInject, portSend } = setup({
      ok: true,
      contentScriptList: [],
      injectScriptList: [{
        uuid: "a", metadata: { storagename: ["shared"] }, value: { k: 1 },
        valueRevision: 1, valueEpoch: "epoch-1",
      }],
      envInfo: {},
    });
    runtime.pageLoad();
    await vi.waitFor(() => expect(onPortMessage).toHaveBeenCalledOnce());
    receive({ code: 0, data: { ready: true } });
    await vi.waitFor(() => expect(portSend).toHaveBeenCalledOnce());
    receive({ action: "runtime/valueSubscriptionsReady", data: {
      requestId: 1,
      snapshots: [{ storageName: "shared", revision: 2, epoch: "epoch-1", values: { k: 2 } }],
    } });
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/pageLoad"));
    const started = toInject.sendMessage.mock.calls.find(([msg]) => msg.action === "inject/pageLoad")?.[0];
    expect(started?.data.scripts[0].value.k).toBe(2);
    toInject.sendMessage.mockClear();
    const update = (rev: number, k: number) => ({
      id: `revision-${rev}`, uuid: "a", storageName: "shared",
      entries: [["k", k, k - 1] as any], sender: { runFlag: "remote", tabId: 2 },
      valueUpdated: true, revision: rev, epoch: "epoch-1",
    });
    receive({ action: "runtime/valueUpdate", data: update(3, 3) });
    receive({ action: "runtime/valueUpdate", data: update(2, 2) });
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/runtime/valueUpdate"));
    expect(actionsOf(toInject.sendMessage).filter((action) => action === "inject/runtime/valueUpdate")).toHaveLength(1);
    receive({ action: "runtime/valueUpdate", data: update(5, 5) });
    expect(portSend).toHaveBeenCalledTimes(2); // The version gap requests a fresh subscription snapshot.
    receive({ action: "runtime/valueSubscriptionsReady", data: {
      requestId: 2,
      snapshots: [{ storageName: "shared", revision: 5, epoch: "epoch-1", values: { k: 5 } }],
    } });
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/runtime/valueSnapshot"));
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import ScriptingRuntime from "./scripting";
import type { ValueUpdateDataEncoded } from "./types";

type Handler = (data: any) => any;

const createServer = () => {
  const handlers = new Map<string, Handler>();
  const notifies = new Map<string, Handler>();
  return {
    server: {
      on: (name: string, fn: Handler) => handlers.set(name, fn),
      onNotify: (name: string, fn: Handler) => notifies.set(name, fn),
    } as unknown as Server,
    handlers,
    notifies,
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

const setup = (pageLoadData?: unknown) => {
  const ext = createServer();
  const page = createServer();
  const toContent = createPageSender();
  const toInject = createPageSender();
  const toExt = vi.fn().mockResolvedValue({ code: 0, data: pageLoadData ?? { ok: false } });
  const senderToExt = { sendMessage: toExt } as unknown as MessageSend;
  const runtime = new ScriptingRuntime(ext.server, page.server, senderToExt, toContent.sender, toInject.sender);
  runtime.init();
  const valueUpdates = (list: ValueUpdateDataEncoded[]) => ext.notifies.get("runtime/valueUpdates")!(list);
  return { runtime, ext, toContent, toInject, toExt, valueUpdates };
};

const loadedPage = {
  ok: true,
  injectScriptList: [{ uuid: "a", metadata: { storagename: ["page-store"] } }],
  contentScriptList: [{ uuid: "b", metadata: { storagename: ["content-store"] } }],
  envInfo: {},
};

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

  it("pageLoad 之后，批量更新逐条按 storageName 只转发给运行它的一侧", async () => {
    const { runtime, toContent, toInject, valueUpdates } = setup(loadedPage);
    runtime.pageLoad();
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/pageLoad"));
    toContent.sendMessage.mockClear();
    toInject.sendMessage.mockClear();

    valueUpdates([valueUpdate("page-store"), valueUpdate("other-store"), valueUpdate("content-store")]);

    expect(toInject.sendMessage.mock.calls.map(([msg]) => [msg.action, msg.data.storageName])).toEqual([
      ["inject/runtime/valueUpdate", "page-store"],
    ]);
    expect(toContent.sendMessage.mock.calls.map(([msg]) => [msg.action, msg.data.storageName])).toEqual([
      ["content/runtime/valueUpdate", "content-store"],
    ]);
  });

  it("pageLoad 尚未返回时，更新同时转发给 page 与 content", () => {
    const { toContent, toInject, valueUpdates } = setup();

    valueUpdates([valueUpdate("any-store")]);

    expect(actionsOf(toContent.sendMessage)).toEqual(["content/runtime/valueUpdate"]);
    expect(actionsOf(toInject.sendMessage)).toEqual(["inject/runtime/valueUpdate"]);
  });
});

describe("ScriptingRuntime bfcache 还原上报", () => {
  const pageShowCalls = (toExt: ReturnType<typeof vi.fn>) =>
    toExt.mock.calls.filter(([msg]) => msg.action.endsWith("/pageShow")).map(([msg]) => msg.data);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 离开页面时，新页面的 pageLoad 已清掉本页的值更新投递登记；还原后要带上仍在运行的 storageName 重新登记
  it.each([
    ["顶层 frame", true],
    ["子 frame", false],
  ])("%s 运行着脚本时，pageShow 带上它运行的 storageName", async (_label, isTop) => {
    if (!isTop) vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    const { runtime, toExt, toInject } = setup(loadedPage);
    runtime.pageLoad();
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/pageLoad"));

    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));

    expect(pageShowCalls(toExt)).toEqual([{ storageNames: ["page-store", "content-store"] }]);
  });

  it("子 frame 没有运行脚本时不上报；顶层 frame 仍要上报（Popup 据此判断本页扩展触及得到）", async () => {
    vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    const sub = setup({ ok: false });
    sub.runtime.pageLoad();
    vi.restoreAllMocks();
    const top = setup({ ok: false });
    top.runtime.pageLoad();
    await vi.waitFor(() => expect(top.toExt).toHaveBeenCalled());

    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));

    expect(pageShowCalls(sub.toExt)).toEqual([]);
    expect(pageShowCalls(top.toExt)).toEqual([{ storageNames: [] }]);
  });

  it("普通的 pageshow（非 bfcache 还原）不上报", async () => {
    const { runtime, toExt, toInject } = setup(loadedPage);
    runtime.pageLoad();
    await vi.waitFor(() => expect(actionsOf(toInject.sendMessage)).toContain("inject/pageLoad"));

    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));

    expect(pageShowCalls(toExt)).toEqual([]);
  });
});

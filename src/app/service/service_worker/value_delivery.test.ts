import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheInstance } from "@App/app/cache";
import type { ValueUpdateDataEncoded, ValueUpdateSender } from "../content/types";
import { ValueUpdateDelivery } from "./value_delivery";

type SendCall = { tabId: number; options?: chrome.tabs.MessageSendOptions; storageNames: string[] };

const update = (storageName: string, sender: ValueUpdateSender = { runFlag: "", tabId: -1 }, id = storageName) =>
  ({
    id,
    entries: [],
    uuid: `uuid-${storageName}`,
    storageName,
    sender,
    valueUpdated: true,
  }) as ValueUpdateDataEncoded;

const doc = (frameId: number) => `doc-${frameId}`;
const target = (tabId: number, frameId: number) => ({ tabId, frameId, documentId: doc(frameId) });

let calls: SendCall[];
let deliver: (tabId: number, options?: chrome.tabs.MessageSendOptions) => Promise<unknown>;

beforeEach(async () => {
  await cacheInstance.clear();
  calls = [];
  deliver = () => Promise.resolve(undefined);
  vi.spyOn(chrome.tabs, "sendMessage").mockImplementation(((
    tabId: number,
    msg: { action: string; data: ValueUpdateDataEncoded[] },
    options?: chrome.tabs.MessageSendOptions
  ) => {
    expect(msg.action).toBe("scripting/runtime/valueUpdates");
    calls.push({ tabId, options, storageNames: msg.data.map((d) => d.storageName) });
    return deliver(tabId, options);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("ValueUpdateDelivery 投递目标", () => {
  it("只定向投递给运行了该 storageName 的 document", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);
    delivery.register(target(1, 5), []);
    delivery.register(target(1, 6), []);
    delivery.register(target(2, 0), ["s2"]);

    await delivery.push(update("s1"));

    expect(calls).toEqual([{ tabId: 1, options: { frameId: 0, documentId: "doc-0" }, storageNames: ["s1"] }]);
  });

  it("发起写入的 document 尚未登记时也会收到，保证 GM.setValue 的回执", async () => {
    const delivery = new ValueUpdateDelivery();

    await delivery.push(update("s1", { runFlag: "f", tabId: 3, frameId: 2, documentId: "early-doc" }));

    expect(calls).toEqual([{ tabId: 3, options: { frameId: 2, documentId: "early-doc" }, storageNames: ["s1"] }]);
  });

  it("没有任何目标、发起方也不是标签页时不发送", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["other"]);

    await delivery.push(update("s1", { runFlag: "user", tabId: -2 }));

    expect(calls).toEqual([]);
  });

  it("缺少 documentId 时退回按 frameId 定向", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register({ tabId: 1, frameId: 4 }, ["s1"]);

    await delivery.push(update("s1"));

    expect(calls).toEqual([{ tabId: 1, options: { frameId: 4 }, storageNames: ["s1"] }]);
  });
});

describe("ValueUpdateDelivery 整页与定向的选择", () => {
  // 单次消息的固定成本约为每多一个 frame 的两倍（Chrome 156 实测），
  // 运行该脚本的 frame 超过约三分之一时，整个标签页发一次比逐个定向便宜
  const tabWith = (frameCount: number, runningCount: number) => {
    const delivery = new ValueUpdateDelivery();
    for (let frameId = 0; frameId < frameCount; frameId++) {
      delivery.register(target(1, frameId), frameId < runningCount ? ["s1"] : []);
    }
    return delivery;
  };

  it("10 个 frame 中 4 个运行时逐个定向", async () => {
    const delivery = tabWith(10, 4);

    await delivery.push(update("s1"));

    expect(calls.map((c) => c.options?.frameId)).toEqual([0, 1, 2, 3]);
  });

  it("10 个 frame 中 5 个运行时整个标签页发一次", async () => {
    const delivery = tabWith(10, 5);

    await delivery.push(update("s1"));

    expect(calls).toEqual([{ tabId: 1, options: undefined, storageNames: ["s1"] }]);
  });

  it("定向时每个 document 只收到自己运行的 storageName", async () => {
    const delivery = new ValueUpdateDelivery();
    for (let frameId = 0; frameId < 8; frameId++) {
      delivery.register(target(1, frameId), frameId === 0 ? ["s1"] : frameId === 1 ? ["s2"] : []);
    }
    const first = deferred();
    deliver = () => first.promise;
    await delivery.push(update("s0-tab-busy", { runFlag: "", tabId: 1, frameId: 7, documentId: doc(7) }));
    deliver = () => Promise.resolve(undefined);
    await delivery.push(update("s1"));
    await delivery.push(update("s2"));
    first.resolve();

    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls.slice(1)).toEqual([
      { tabId: 1, options: { frameId: 0, documentId: "doc-0" }, storageNames: ["s1"] },
      { tabId: 1, options: { frameId: 1, documentId: "doc-1" }, storageNames: ["s2"] },
    ]);
  });
});

describe("ValueUpdateDelivery 合并与并发", () => {
  it("同一标签页有消息在途时，后续更新按顺序合并成一条", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);
    const first = deferred();
    deliver = () => first.promise;

    await delivery.push(update("s1", undefined, "a"));
    await delivery.push(update("s1", undefined, "b"));
    await delivery.push(update("s1", undefined, "c"));
    expect(calls).toHaveLength(1);

    deliver = () => Promise.resolve(undefined);
    first.resolve();

    await vi.waitFor(() => expect(calls).toHaveLength(2));
    const sent = vi
      .mocked(chrome.tabs.sendMessage)
      .mock.calls.map(([, msg]) => (msg as { data: ValueUpdateDataEncoded[] }).data.map((d) => d.id));
    expect(sent).toEqual([["a"], ["b", "c"]]);
  });

  it("一个标签页在途不会阻塞其他标签页", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);
    delivery.register(target(2, 0), ["s1"]);
    const tab1 = deferred();
    deliver = (tabId) => (tabId === 1 ? tab1.promise : Promise.resolve(undefined));

    await delivery.push(update("s1", undefined, "a"));
    await delivery.push(update("s1", undefined, "b"));

    await vi.waitFor(() => expect(calls.map((c) => c.tabId)).toEqual([1, 2, 2]));
  });

  it("投递失败的 document 会被移出，不阻塞后续更新", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);
    delivery.register(target(1, 9), ["s1"]);
    for (let frameId = 1; frameId < 8; frameId++) delivery.register(target(1, frameId), []);
    deliver = (_, options) =>
      options?.frameId === 9 ? Promise.reject(new Error("No frame with id 9")) : Promise.resolve(undefined);

    await delivery.push(update("s1", undefined, "a"));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    await delivery.push(update("s1", undefined, "b"));

    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].options).toEqual({ frameId: 0, documentId: "doc-0" });
  });
});

// 扩展消息上限 64 MiB；超限时 Chrome 的 tabs.sendMessage 同步抛出，而不是返回被拒绝的 Promise（Chrome 156 实测）。
// 每条更新都带新旧值，合并后的批次可能超限，而其中每一条单独发送并不超限
describe("ValueUpdateDelivery 消息超过上限", () => {
  const oversize = () => {
    throw new Error("Message exceeded maximum allowed size of 64MiB.");
  };

  it("合并后的批次超限时逐条重发，队列不会卡住，document 也不被移出", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);
    const first = deferred();
    deliver = () => first.promise;
    await delivery.push(update("s1", undefined, "a"));
    await delivery.push(update("s1", undefined, "b"));
    await delivery.push(update("s1", undefined, "c"));
    let batches = 0;
    deliver = () => (++batches === 1 ? oversize() : Promise.resolve(undefined));

    first.resolve();
    await vi.waitFor(() => expect(calls).toHaveLength(4));
    await delivery.push(update("s1", undefined, "d"));

    await vi.waitFor(() => expect(calls).toHaveLength(5));
    const sent = vi
      .mocked(chrome.tabs.sendMessage)
      .mock.calls.map(([, msg]) => (msg as { data: ValueUpdateDataEncoded[] }).data.map((d) => d.id));
    expect(sent).toEqual([["a"], ["b", "c"], ["b"], ["c"], ["d"]]);
  });

  it("单条更新本身超限时跳过这一条，后续更新照常投递给同一个 document", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);
    vi.mocked(chrome.tabs.sendMessage).mockImplementationOnce(((tabId: number, _msg: never, options: never) => {
      calls.push({ tabId, options, storageNames: ["s1"] });
      return oversize();
    }) as never);

    await delivery.push(update("s1", undefined, "huge"));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await delivery.push(update("s1", undefined, "small"));

    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].options).toEqual({ frameId: 0, documentId: "doc-0" });
  });
});

describe("ValueUpdateDelivery 页面生命周期", () => {
  it("顶层 frame 重新载入会清掉该标签页旧页面的 document，之后登记的保留", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);
    delivery.register(target(1, 3), ["s1"]);

    delivery.resetTab(1);
    delivery.register(target(1, 8), ["s1"]);

    await delivery.push(update("s1"));
    expect(calls).toEqual([{ tabId: 1, options: { frameId: 8, documentId: "doc-8" }, storageNames: ["s1"] }]);
  });

  it("关闭标签页后不再投递", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);

    delivery.removeTab(1);

    await delivery.push(update("s1"));
    expect(calls).toEqual([]);
  });

  it.each([
    ["关闭", () => chrome.tabs.remove(1)],
    // 标签页被丢弃后重新激活等情况下，浏览器用新 tabId 替换旧的，旧 tabId 不会再触发 onRemoved
    [
      "被替换",
      () => (chrome.tabs as unknown as { hook: { emit: (...a: unknown[]) => void } }).hook.emit("replace", 9, 1),
    ],
  ])("浏览器通知标签页%s后不再向它投递", async (_label, trigger) => {
    const delivery = new ValueUpdateDelivery();
    delivery.init();
    delivery.register(target(1, 0), ["s1"]);
    delivery.register(target(2, 0), ["s1"]);

    trigger();

    await delivery.push(update("s1"));
    expect(calls.map((c) => c.tabId)).toEqual([2]);
  });

  it("bfcache 还原时重新登记的 document 能收到更新", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);
    // 跳到不运行脚本的页面
    delivery.resetTab(1);
    delivery.register({ tabId: 1, frameId: 0, documentId: "other-page" }, []);
    // 后退：bfcache 还原原文档，pageShow 带上它仍在运行的 storageName
    delivery.register(target(1, 0), ["s1"]);

    await delivery.push(update("s1"));
    expect(calls).toEqual([{ tabId: 1, options: { frameId: 0, documentId: "doc-0" }, storageNames: ["s1"] }]);
  });
});

describe("ValueUpdateDelivery Service Worker 重启", () => {
  it("新实例从 storage.session 恢复投递目标", async () => {
    const before = new ValueUpdateDelivery();
    before.register(target(1, 0), ["s1"]);
    before.register(target(1, 4), []);
    await before.push(update("warm-up"));

    const after = new ValueUpdateDelivery();
    await after.push(update("s1"));

    expect(calls).toEqual([{ tabId: 1, options: { frameId: 0, documentId: "doc-0" }, storageNames: ["s1"] }]);
  });

  it("恢复前已重新载入的标签页不会混入旧页面的 document，其他 frame 的登记会合并", async () => {
    const before = new ValueUpdateDelivery();
    before.register(target(1, 0), ["s1"]);
    before.register(target(2, 0), ["s1"]);
    await before.push(update("warm-up"));

    const after = new ValueUpdateDelivery();
    after.resetTab(1);
    after.register(target(2, 7), ["s1"]);
    // 标签页 2 的 frame 足够多，才能从定向投递里看出恢复出的 frame 0 与新登记的 frame 7 都在
    for (let frameId = 1; frameId < 6; frameId++) after.register(target(2, frameId), []);
    await after.push(update("s1"));

    expect(calls.map((c) => [c.tabId, c.options?.frameId])).toEqual([
      [2, 7],
      [2, 0],
    ]);
  });

  // 广告等 iframe 反复载入时，没有脚本的 frame 只用于「整页还是定向」的计数，不值得每次都重写一遍持久化记录
  it("只持久化运行脚本的 frame，没有脚本的 frame 登记不写 storage.session", async () => {
    const delivery = new ValueUpdateDelivery();
    delivery.register(target(1, 0), ["s1"]);
    await delivery.push(update("warm-up"));
    const setSpy = vi.spyOn(chrome.storage.session, "set");

    for (let frameId = 1; frameId <= 3; frameId++) delivery.register(target(1, frameId), []);
    await delivery.push(update("warm-up"));

    expect(setSpy).not.toHaveBeenCalled();
    expect(await chrome.storage.session.get(null)).toEqual({
      "valueUpdateTargets:1": { 0: { documentId: "doc-0", storageNames: ["s1"] } },
    });
  });

  it("关闭的标签页也从 storage.session 移除", async () => {
    const before = new ValueUpdateDelivery();
    before.register(target(1, 0), ["s1"]);
    before.removeTab(1);
    await before.push(update("warm-up"));

    const after = new ValueUpdateDelivery();
    await after.push(update("s1"));

    expect(calls).toEqual([]);
  });
});

/* eslint-disable chrome-error/require-last-error-check */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/**
 *
 * 测试方法说明：
 *  - 我们模拟 Chrome 扩展的 alarms/storage/runtime 接口，控制其行为并观察调用；
 *  - 使用 vi.useFakeTimers() + vi.setSystemTime() 锁定时间，便于验证“延迟触发/补偿执行(isFlushed)”；
 *  - 每个用例都以 buildChromeMock() 创建隔离的 mock，避免跨用例状态污染；
 *  - freshImport() 每次重新导入模块，确保模块级别的状态（例如回调登记表）在每个测试中都是“干净”的；
 *  - 通过 chrome.alarms.onAlarm.__trigger(...) 主动触发 onAlarm 事件，模拟浏览器实际调度；
 *  - 通过 storage.local.get/set/remove 记录/清理“待处理(pending)”信息，以模拟掉电/重启后的补偿执行逻辑。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importTarget = "./alarm" as const;

/**
 * 重新导入模块，使模块内的单例或闭包状态被重置。
 * 为什么需要？
 *  - alarm.ts 很可能在模块级保存“回调登记表/监控标记”等状态；
 *  - 测试之间必须相互独立，否则前一个用例的注册会影响后续用例，导致误判。
 */
async function freshImport() {
  vi.resetModules();
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  return (await import(importTarget)) as typeof import("./alarm");
}

/**
 * 构造最小可用的 Chrome API Mock：alarms / storage / runtime。
 * 关键点：
 *  - 允许我们注入 get/create 的返回值与 side-effect；
 *  - onAlarm.addListener 保存回调函数，并提供 __trigger() 手动触发；
 *  - storage.local 使用 Promise 风格便于 await；
 *  - runtime.lastError 用于模拟扩展 API 的错误通道（API 调用后读取）。
 */
type OnAlarmListener = (alarm: any) => void;
function buildChromeMock() {
  let onAlarmListener: OnAlarmListener | null = null;

  const chromeMock: any = {
    alarms: {
      /**
       * chrome.alarms.get(name, cb)
       * - 我们会在用例里 mockImplementation 注入具体返回：
       *   - cb(undefined) 表示不存在；
       *   - cb({ name, periodInMinutes }) 表示已存在；
       */
      get: vi.fn(),
      /**
       * chrome.alarms.create(name, info, cb?)
       * - 我们会在用例里检查是否被调用，以及调用参数是否正确；
       * - 也可以设置 runtime.lastError 来模拟创建时的“配额错误”等情况。
       */
      create: vi.fn(),
      onAlarm: {
        /**
         * 注册 onAlarm 监听器。我们把监听器保存到闭包变量 onAlarmListener 中，
         * 稍后通过 __trigger() 主动触发它，模拟浏览器调度。
         */
        addListener: vi.fn((listener: OnAlarmListener) => {
          onAlarmListener = listener;
        }),
        /**
         * 手动触发 alarm 事件：
         *  - 传入形如 { name, periodInMinutes, scheduledTime } 的对象；
         *  - scheduledTime 用于判断是否“补偿执行”(isFlushed)。
         */
        __trigger(alarm: any) {
          onAlarmListener?.(alarm);
        },
      },
    },
    storage: {
      local: {
        // 读取/写入/删除“待处理(pending)”记录，用于 SW 重启补偿等场景
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
    runtime: { lastError: null },
  };

  (globalThis as any).chrome = chromeMock;
  return chromeMock;
}

let savedChrome: any;

beforeEach(() => {
  savedChrome = (global as any).chrome;
  // 伪造时间：保持所有用例处在固定“当前时间”，便于判断延迟/补偿
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
});

afterEach(() => {
  (global as any).chrome = savedChrome;
  savedChrome = undefined;
});

// ====================== mightCreatePeriodicAlarm ======================
/**
 * 目标：
 *  - 当 alarm 不存在时应创建；
 *  - 当存在且周期一致时不重新创建（复用）；
 *  - 当存在但周期不同应重建；
 *  - get() 产生 lastError 也不影响后续创建；
 *  - create() 产生 lastError 仅记录，不抛错（行为仍然 resolve）。
 *
 * 方法：
 *  - 通过 mock 的 get/create 行为与 runtime.lastError 状态，观察 mightCreatePeriodicAlarm 的返回值和副作用。
 */

describe("mightCreatePeriodicAlarm", () => {
  it("当不存在同名 alarm 时：应创建", async () => {
    const chrome = buildChromeMock();
    // 模拟 get 返回 undefined 表示“没有现存的 alarm”
    chrome.alarms.get.mockImplementation((_n: string, cb: Function) => cb(undefined));
    // 模拟 create 正常调用（可选回调被安全调用）
    chrome.alarms.create.mockImplementation((_n: string, _i: any, cb?: Function) => cb?.());

    const { mightCreatePeriodicAlarm } = await freshImport();
    const result = await mightCreatePeriodicAlarm("DataSync", { periodInMinutes: 10 });

    expect(result).toEqual({ justCreated: true });
    expect(chrome.alarms.create).toHaveBeenCalledWith("DataSync", { periodInMinutes: 10 }, expect.any(Function));
  });

  it("当已存在且周期一致：应复用（不创建）", async () => {
    const chrome = buildChromeMock();
    chrome.alarms.get.mockImplementation((_n: string, cb: Function) => cb({ name: "DataSync", periodInMinutes: 10 }));

    const { mightCreatePeriodicAlarm } = await freshImport();
    const result = await mightCreatePeriodicAlarm("DataSync", { periodInMinutes: 10 });

    expect(result).toEqual({ justCreated: false });
    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });

  it("当已存在但周期不同：应重建", async () => {
    const chrome = buildChromeMock();
    chrome.alarms.get.mockImplementation((_n: string, cb: Function) => cb({ name: "DataSync", periodInMinutes: 5 }));
    chrome.alarms.create.mockImplementation((_n: string, _i: any, cb?: Function) => cb?.());

    const { mightCreatePeriodicAlarm } = await freshImport();
    const result = await mightCreatePeriodicAlarm("DataSync", { periodInMinutes: 10 });

    expect(result).toEqual({ justCreated: true });
    expect(chrome.alarms.create).toHaveBeenCalled();
  });

  it("忽略 get() 的 runtime.lastError，仍应继续创建", async () => {
    const chrome = buildChromeMock();
    // get() 产生 lastError，但我们仍按“未找到”处理
    chrome.alarms.get.mockImplementation((_n: string, cb: Function) => {
      chrome.runtime.lastError = new Error("Some get error");
      cb(undefined);
    });
    // create() 正常
    chrome.alarms.create.mockImplementation((_n: string, _i: any, cb?: Function) => {
      chrome.runtime.lastError = null;
      cb?.();
    });

    const { mightCreatePeriodicAlarm } = await freshImport();
    const result = await mightCreatePeriodicAlarm("ErrAlarm", { periodInMinutes: 1 });

    expect(result).toEqual({ justCreated: true });
    expect(chrome.alarms.create).toHaveBeenCalled();
  });

  it("记录 create() 的 runtime.lastError，但仍 resolve", async () => {
    const chrome = buildChromeMock();
    chrome.alarms.get.mockImplementation((_n: string, cb: Function) => cb(undefined));
    // create() 设置 lastError，代表“配额不足”等，但行为不抛错
    chrome.alarms.create.mockImplementation((_n: string, _i: any, cb?: Function) => {
      chrome.runtime.lastError = new Error("quota exceeded");
      cb?.();
    });

    const { mightCreatePeriodicAlarm } = await freshImport();
    const result = await mightCreatePeriodicAlarm("Quota", { periodInMinutes: 2 });

    expect(result).toEqual({ justCreated: true });
  });
});

// =========== setPeriodicAlarmCallback + monitorPeriodicAlarm ===========
/**
 * 目标：
 *  - 注册回调后，onAlarm 触发应调用对应回调；
 *  - 根据 scheduledTime 与当前时间判断是否补偿执行(isFlushed)；
 *  - 回调失败也要清理 pending；
 *  - monitorPeriodicAlarm 只能启动一次；
 *  - SW 重启后若发现“未变化的 pending”则执行补偿；若有变化则不补偿；
 *  - onAlarm 期间若出现 runtime.lastError，应中止处理。
 *
 * 方法：
 *  - 通过 setPeriodicAlarmCallback(name, cb) 注册；
 *  - 调用 monitorPeriodicAlarm() 启动监听（内部可能有 100ms 延迟与 3s 补偿轮询）；
 *  - __trigger(...) 触发 onAlarm；
 *  - 使用 fake timers 推进时间，等待内部 setTimeout；
 *  - 通过 storage.local 的调用轨迹确认“写入 pending / 清理 pending”。
 */

describe("setPeriodicAlarmCallback + monitorPeriodicAlarm", () => {
  it("准时触发：应调用回调且 isFlushed=false，并完成 pending 记录/清理", async () => {
    const chrome = buildChromeMock();
    const now = Date.now();
    const { setPeriodicAlarmCallback, monitorPeriodicAlarm } = await freshImport();

    const cb = vi.fn().mockResolvedValue(undefined);
    setPeriodicAlarmCallback("A1", cb);
    chrome.storage.local.get.mockResolvedValue({}); // 初始无 pending

    const monitorPromise = monitorPeriodicAlarm(); // 启动监听

    // 触发“准时”的 alarm：scheduledTime == now
    chrome.alarms.onAlarm.__trigger({ name: "A1", periodInMinutes: 1, scheduledTime: now });

    // monitor 内部会延迟 ~100ms 再执行回调；推进时间触发执行
    await vi.advanceTimersByTimeAsync(120);
    await monitorPromise;

    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0][0];
    expect(arg.alarm.name).toBe("A1");
    expect(arg.isFlushed).toBe(false);
    expect(typeof arg.triggeredAt).toBe("number");

    // 验证 pending 生命周期：回调前 set，完成后 remove
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "AlarmPending:A1": expect.objectContaining({ alarm: expect.any(Object) }),
    });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("AlarmPending:A1");
  });

  it("延迟≥65s：应判定为补偿执行 isFlushed=true", async () => {
    const chrome = buildChromeMock();
    const base = Date.now();
    const { setPeriodicAlarmCallback, monitorPeriodicAlarm } = await freshImport();

    const cb = vi.fn().mockResolvedValue(undefined);
    setPeriodicAlarmCallback("Late", cb);
    chrome.storage.local.get.mockResolvedValue({});

    const monitorPromise = monitorPeriodicAlarm();

    // 模拟“延迟 70s 后才触发”的 alarm：scheduledTime 比现在早 70s
    chrome.alarms.onAlarm.__trigger({ name: "Late", periodInMinutes: 2, scheduledTime: base - 70_000 });

    await vi.advanceTimersByTimeAsync(120);
    await monitorPromise;

    const arg = cb.mock.calls[0][0];
    expect(arg.isFlushed).toBe(true);
  });

  it("回调抛错也必须清理 pending（保证下次不误判）", async () => {
    const chrome = buildChromeMock();
    const { setPeriodicAlarmCallback, monitorPeriodicAlarm } = await freshImport();

    const cb = vi.fn().mockRejectedValue(new Error("Callback failed"));
    setPeriodicAlarmCallback("Err", cb);
    chrome.storage.local.get.mockResolvedValue({});

    const monitorPromise = monitorPeriodicAlarm();

    chrome.alarms.onAlarm.__trigger({ name: "Err", periodInMinutes: 1, scheduledTime: Date.now() });

    await vi.advanceTimersByTimeAsync(120);
    await monitorPromise;

    expect(cb).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("AlarmPending:Err");
  });

  it("同一进程内 monitor 只能启动一次（第二次应抛错）", async () => {
    buildChromeMock();
    const { monitorPeriodicAlarm } = await freshImport();

    await monitorPeriodicAlarm();
    await expect(monitorPeriodicAlarm()).rejects.toThrow(/cannot be called twice/i);
  });

  it("SW 重启后：发现未变化的 pending -> 进行补偿执行", async () => {
    const chrome = buildChromeMock();
    const { setPeriodicAlarmCallback, monitorPeriodicAlarm } = await freshImport();

    const cb = vi.fn().mockResolvedValue(undefined);
    setPeriodicAlarmCallback("Comp", cb);

    const now = Date.now();
    // 第一次扫描发现一个旧的 pending；3 秒后再次扫描，内容未变化 -> 说明回调上次未完成，应执行补偿
    const pending = {
      ["AlarmPending:Comp"]: {
        alarm: { name: "Comp", periodInMinutes: 1, scheduledTime: now - 90_000 },
        isFlushed: true,
        triggeredAt: now - 10_000,
      },
    };

    chrome.storage.local.get.mockResolvedValueOnce(pending).mockResolvedValueOnce({ ...pending });

    const monitorPromise = monitorPeriodicAlarm();

    // monitor 内部约 3s 后再检查一次，推进时间触发补偿逻辑
    await vi.advanceTimersByTimeAsync(3050);

    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0][0];
    // 补偿应更新触发时间为“现在”，避免重复补偿
    expect(arg.triggeredAt).toBeGreaterThanOrEqual(now);

    // 仍然遵循 pending 生命周期：set -> remove
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "AlarmPending:Comp": expect.objectContaining({ alarm: expect.any(Object) }),
    });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("AlarmPending:Comp");

    await monitorPromise;
  });

  it("SW 重启后：若 pending 在两次扫描间发生变化 -> 认为已处理/处理中，不做补偿", async () => {
    const chrome = buildChromeMock();
    const { setPeriodicAlarmCallback, monitorPeriodicAlarm } = await freshImport();

    const cb = vi.fn().mockResolvedValue(undefined);
    setPeriodicAlarmCallback("NoComp", cb);

    const first = {
      ["AlarmPending:NoComp"]: {
        alarm: { name: "NoComp", periodInMinutes: 1, scheduledTime: Date.now() - 70_000 },
        isFlushed: true,
        triggeredAt: 1000,
      },
    };
    const second = {
      ["AlarmPending:NoComp"]: { ...first["AlarmPending:NoComp"], triggeredAt: 2000 }, // 触发时间发生变化
    };

    chrome.storage.local.get.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const monitorPromise = monitorPeriodicAlarm();
    await vi.advanceTimersByTimeAsync(3020);

    expect(cb).not.toHaveBeenCalled();
    await monitorPromise;
  });

  it("onAlarm 期间若出现 runtime.lastError：本次事件应被忽略（不写入、不清理、不调用回调）", async () => {
    const chrome = buildChromeMock();
    const { setPeriodicAlarmCallback, monitorPeriodicAlarm } = await freshImport();

    const cb = vi.fn().mockResolvedValue(undefined);
    setPeriodicAlarmCallback("E", cb);
    chrome.storage.local.get.mockResolvedValue({});

    const monitorPromise = monitorPeriodicAlarm();

    // 模拟 onAlarm 回调执行前 runtime.lastError 非空，代表框架层错误 -> 应该直接返回
    chrome.runtime.lastError = new Error("onAlarm error");
    chrome.alarms.onAlarm.__trigger({ name: "E", periodInMinutes: 1, scheduledTime: Date.now() });
    chrome.runtime.lastError = null; // 复位

    await vi.advanceTimersByTimeAsync(200);
    await monitorPromise;

    expect(cb).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
});

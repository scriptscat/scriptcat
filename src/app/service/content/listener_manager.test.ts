// listener_manager.test.ts
// ListenerManager 现在是固定为 GMTypes.ValueChangeListener 五参数签名的监听器管理器。
import { describe, it, expect, vi } from "vitest";
import { ListenerManager } from "./listener_manager";

describe.concurrent("ListenerManager（监听器管理器）", () => {
  it.concurrent("添加并执行单个监听器", () => {
    const lm = new ListenerManager();
    const spy = vi.fn();

    const id = lm.add("alpha", spy);
    expect(id).toBeGreaterThan(0);

    lm.execute("alpha", 1, "new", false, 7);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("alpha", 1, "new", false, 7);
  });

  it.concurrent("为同一个 key 执行多个监听器，执行顺序应与添加顺序一致", () => {
    const lm = new ListenerManager();
    const spy1 = vi.fn();
    const spy2 = vi.fn();

    lm.add("beta", spy1);
    lm.add("beta", spy2);

    lm.execute("beta", "old", "new", true, undefined);

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
    // 验证调用顺序
    expect(spy1.mock.invocationCallOrder[0]).toBeLessThan(spy2.mock.invocationCallOrder[0]);
  });

  it.concurrent("不会执行注册在其他 key 下的监听器", () => {
    const lm = new ListenerManager();
    const spyA = vi.fn();
    const spyB = vi.fn();

    lm.add("gamma", spyA);
    lm.add("delta", spyB);

    lm.execute("gamma", 1, "A", false, 1);
    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).not.toHaveBeenCalled();
  });

  it.concurrent("remove() 删除已存在的监听器 id 后返回 true，并防止后续被执行", () => {
    const lm = new ListenerManager();
    const spyA = vi.fn();
    const spyB = vi.fn();

    const idA = lm.add("k", spyA);
    lm.add("k", spyB);

    const removed = lm.remove(idA);
    expect(removed).toBe(true);

    lm.execute("k", 9, "z", false, undefined);
    expect(spyA).not.toHaveBeenCalled();
    expect(spyB).toHaveBeenCalledTimes(1);
  });

  it.concurrent("remove() 可以接受字符串类型的 id 并通过数字转换删除", () => {
    const lm = new ListenerManager();
    const spy = vi.fn();
    const id = lm.add("key", spy);

    const removed = lm.remove(String(id));
    expect(removed).toBe(true);

    lm.execute("key", 5, "after", false, undefined);
    expect(spy).not.toHaveBeenCalled();
  });

  it.concurrent("remove() 对无效或不存在的 id 返回 false", () => {
    const lm = new ListenerManager();
    expect(lm.remove(0)).toBe(false);
    expect(lm.remove(-1)).toBe(false);
    expect(lm.remove("")).toBe(false);
    expect(lm.remove("999")).toBe(false);
  });

  it.concurrent("对不存在监听器的 key 执行 execute() 不会抛出错误（无操作）", () => {
    const lm = new ListenerManager();
    expect(() => lm.execute("missing", 42, "nope", false, undefined)).not.toThrow();
  });

  it.concurrent("id 在多次添加监听器时应递增", () => {
    const lm = new ListenerManager();
    const id1 = lm.add("a", vi.fn());
    const id2 = lm.add("a", vi.fn());
    const id3 = lm.add("b", vi.fn());

    expect(id2).toBeGreaterThan(id1);
    expect(id3).toBeGreaterThan(id2);
  });

  it.concurrent("当删除某个 key 下最后一个监听器后，再执行该 key 时不应触发任何监听", () => {
    const lm = new ListenerManager();
    const spy = vi.fn();

    const id = lm.add("solo", spy);
    expect(lm.remove(id)).toBe(true);

    lm.execute("solo", 100, "gone", false, undefined);
    expect(spy).not.toHaveBeenCalled();
  });

  it.concurrent("clear()", () => {
    const lm = new ListenerManager();
    const spyA = vi.fn();
    const spyB = vi.fn();
    const spyC = vi.fn();
    const spyD = vi.fn();

    lm.add("k", spyA);
    lm.add("k", spyB);
    lm.add("z", spyC);
    lm.add("k", spyD);

    lm.clear();

    lm.execute("k", 9, "z", false, undefined);
    lm.execute("z", 1, "z", false, undefined);
    expect(spyA).not.toHaveBeenCalled();
    expect(spyB).not.toHaveBeenCalled();
    expect(spyC).not.toHaveBeenCalled();
    expect(spyD).not.toHaveBeenCalled();
  });

  it.concurrent("监听器可以在被触发时移除自身，不影响其余监听器执行", () => {
    const lm = new ListenerManager();
    const order: string[] = [];
    let selfId = 0;
    const spySelf = vi.fn(() => {
      order.push("self");
      lm.remove(selfId);
    });
    const spyOther = vi.fn(() => order.push("other"));

    selfId = lm.add("k", spySelf);
    lm.add("k", spyOther);

    lm.execute("k", 1, 2, false, undefined);
    expect(order).toEqual(["self", "other"]);

    lm.execute("k", 1, 2, false, undefined);
    expect(spySelf).toHaveBeenCalledTimes(1);
    expect(spyOther).toHaveBeenCalledTimes(2);
  });

  it.concurrent("一个监听器可以在执行期间移除同一 key 下尚未轮到的另一个监听器", () => {
    const lm = new ListenerManager();
    let idB = 0;
    const spyB = vi.fn();
    const spyA = vi.fn(() => lm.remove(idB));

    lm.add("k", spyA);
    idB = lm.add("k", spyB);

    lm.execute("k", 1, 2, false, undefined);

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).not.toHaveBeenCalled();
  });

  it.concurrent("执行期间新增的监听器不会影响本次已在进行的分发抛错", () => {
    const lm = new ListenerManager();
    const spyLate = vi.fn();
    const spyFirst = vi.fn(() => {
      lm.add("k", spyLate);
    });

    lm.add("k", spyFirst);

    expect(() => lm.execute("k", 1, 2, false, undefined)).not.toThrow();
    expect(spyFirst).toHaveBeenCalledTimes(1);
  });

  it.concurrent("不受继承的数字 Array.prototype setter 影响（add 不再使用数组下标赋值）", () => {
    // 旧实现用 this.listeners[this.listeners.length] = ... 赋值，页面可在 Array.prototype
    // 上预先放置继承的数字 setter 来截获新监听器；固定为 Native.Map 存储后不应再受影响。
    const lm = new ListenerManager();
    let intercepted: unknown;
    Object.defineProperty(Array.prototype, "0", {
      configurable: true,
      set(value: unknown) {
        intercepted = value;
      },
      get() {
        return undefined;
      },
    });
    const spy = vi.fn();
    try {
      lm.add("alpha", spy);
    } finally {
      delete (Array.prototype as unknown as Record<string, unknown>)["0"];
    }

    expect(intercepted).toBeUndefined();
    lm.execute("alpha", 1, 2, false, undefined);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.concurrent("不受劫持的 Array.prototype[Symbol.iterator] 影响（execute 不再展开参数数组）", () => {
    const lm = new ListenerManager();
    const received: unknown[] = [];
    lm.add("alpha", (key: string, oldValue: unknown, newValue: unknown, remote: boolean, tabid?: number) => {
      received.push(key, oldValue, newValue, remote, tabid);
    });

    const originalIterator = Array.prototype[Symbol.iterator];
    let hostileIteratorInvoked = false;
    let threw = false;
    try {
      Array.prototype[Symbol.iterator] = () => {
        hostileIteratorInvoked = true;
        throw new Error("hostile iterator invoked");
      };
      try {
        lm.execute("alpha", 1, "x", true, 9);
      } catch {
        threw = true;
      }
    } finally {
      Array.prototype[Symbol.iterator] = originalIterator;
    }

    expect(hostileIteratorInvoked).toBe(false);
    expect(threw).toBe(false);
    expect(received).toEqual(["alpha", 1, "x", true, 9]);
  });
});

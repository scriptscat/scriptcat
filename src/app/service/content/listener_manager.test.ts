// listener_manager.test.ts
// 根据需要调整导入路径，确保能正确导入 ListenerManager 类。
import { describe, it, expect, vi } from "vitest";
import { ListenerManager } from "./listener_manager";

// 定义监听函数类型
type Handler = (key: string, n: number, s: string) => void;

describe.concurrent("ListenerManager（监听器管理器）", () => {
  it.concurrent("添加并执行单个监听器", () => {
    const lm = new ListenerManager<Handler>();
    const spy = vi.fn<Handler>();

    const id = lm.add("alpha", spy);
    expect(id).toBeGreaterThan(0);

    lm.execute("alpha", 123, "hi");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("alpha", 123, "hi");
  });

  it.concurrent("为同一个 key 执行多个监听器，执行顺序应与添加顺序一致", () => {
    const lm = new ListenerManager<Handler>();
    const spy1 = vi.fn<Handler>();
    const spy2 = vi.fn<Handler>();

    lm.add("beta", spy1);
    lm.add("beta", spy2);

    lm.execute("beta", 7, "x");

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
    // 验证调用顺序
    expect(spy1.mock.invocationCallOrder[0]).toBeLessThan(spy2.mock.invocationCallOrder[0]);
  });

  it.concurrent("不会执行注册在其他 key 下的监听器", () => {
    const lm = new ListenerManager<Handler>();
    const spyA = vi.fn<Handler>();
    const spyB = vi.fn<Handler>();

    lm.add("gamma", spyA);
    lm.add("delta", spyB);

    lm.execute("gamma", 1, "A");
    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).not.toHaveBeenCalled();
  });

  it.concurrent("remove() 删除已存在的监听器 id 后返回 true，并防止后续被执行", () => {
    const lm = new ListenerManager<Handler>();
    const spyA = vi.fn<Handler>();
    const spyB = vi.fn<Handler>();

    const idA = lm.add("k", spyA);
    lm.add("k", spyB);

    const removed = lm.remove(idA);
    expect(removed).toBe(true);

    lm.execute("k", 9, "z");
    expect(spyA).not.toHaveBeenCalled();
    expect(spyB).toHaveBeenCalledTimes(1);
  });

  it.concurrent("remove() 可以接受字符串类型的 id 并通过数字转换删除", () => {
    const lm = new ListenerManager<Handler>();
    const spy = vi.fn<Handler>();
    const id = lm.add("key", spy);

    const removed = lm.remove(String(id));
    expect(removed).toBe(true);

    lm.execute("key", 5, "after");
    expect(spy).not.toHaveBeenCalled();
  });

  it.concurrent("remove() 对无效或不存在的 id 返回 false", () => {
    const lm = new ListenerManager<Handler>();
    expect(lm.remove(0)).toBe(false);
    expect(lm.remove(-1)).toBe(false);
    expect(lm.remove("")).toBe(false);
    expect(lm.remove("999")).toBe(false);
  });

  it.concurrent("对不存在监听器的 key 执行 execute() 不会抛出错误（无操作）", () => {
    const lm = new ListenerManager<Handler>();
    expect(() => lm.execute("missing", 42, "nope")).not.toThrow();
  });

  it.concurrent("id 在多次添加监听器时应递增", () => {
    const lm = new ListenerManager<Handler>();
    const id1 = lm.add("a", vi.fn<Handler>());
    const id2 = lm.add("a", vi.fn<Handler>());
    const id3 = lm.add("b", vi.fn<Handler>());

    expect(id2).toBeGreaterThan(id1);
    expect(id3).toBeGreaterThan(id2);
  });

  it.concurrent("当删除某个 key 下最后一个监听器后，再执行该 key 时不应触发任何监听", () => {
    const lm = new ListenerManager<Handler>();
    const spy = vi.fn<Handler>();

    const id = lm.add("solo", spy);
    expect(lm.remove(id)).toBe(true);

    lm.execute("solo", 100, "gone");
    expect(spy).not.toHaveBeenCalled();
  });
});

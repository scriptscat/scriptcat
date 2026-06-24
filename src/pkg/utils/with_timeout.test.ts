import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout } from "./with_timeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("正常返回值：promise 先于超时完成时返回结果", async () => {
    const promise = Promise.resolve(42);
    const result = await withTimeout(promise, 1000);
    expect(result).toBe(42);
  });

  it("正常返回值：promise 先于超时完成时 timer 被清理（不会触发 unhandled rejection）", async () => {
    const promise = Promise.resolve("hello");
    const result = await withTimeout(promise, 5000);
    expect(result).toBe("hello");
    // 推进时间，确认 timer 已清理，不会有任何副作用
    vi.advanceTimersByTime(10000);
    // 若 timer 未清理，此时会触发 reject；因为 Promise 已 settle，会变成 unhandled rejection
    // 测试通过说明 timer 被正确清理
  });

  it("超时触发默认错误：超时后抛出默认错误消息", async () => {
    const neverResolve = new Promise<never>(() => {});
    const resultPromise = withTimeout(neverResolve, 1000);
    vi.advanceTimersByTime(1000);
    await expect(resultPromise).rejects.toThrow("operation timed out");
  });

  it("超时触发自定义错误：errorCode 透传", async () => {
    const neverResolve = new Promise<never>(() => {});
    const customError = Object.assign(new Error("custom timeout error"), { errorCode: "tool_timeout" });
    const resultPromise = withTimeout(neverResolve, 500, () => customError);
    vi.advanceTimersByTime(500);
    await expect(resultPromise).rejects.toMatchObject({
      message: "custom timeout error",
      errorCode: "tool_timeout",
    });
  });

  it("resolve 后 timer 被清理：不会产生未处理的 rejection", async () => {
    // 收集未处理 rejection
    const unhandledRejections: unknown[] = [];
    const handler = (reason: unknown) => unhandledRejections.push(reason);
    process.on("unhandledRejection", handler);

    try {
      const promise = Promise.resolve("done");
      await withTimeout(promise, 2000);
      // 推进时间超过超时，若 timer 未清理会触发 rejection
      vi.advanceTimersByTime(5000);
      // 让所有微任务执行完
      await Promise.resolve();
      await Promise.resolve();
      expect(unhandledRejections).toHaveLength(0);
    } finally {
      process.removeListener("unhandledRejection", handler);
    }
  });
});

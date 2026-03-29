import { describe, expect, it, vi } from "vitest";
import { Semaphore, withTimeoutNotify } from "./concurrency-control";

describe("Semaphore", () => {
  it.concurrent("limit 小于 1 时抛出错误", () => {
    expect(() => new Semaphore(0)).toThrow("limit must be >= 1");
    expect(() => new Semaphore(-1)).toThrow("limit must be >= 1");
  });

  it.concurrent("未达到限制时 acquire 立即返回", async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    // 两次 acquire 都不应阻塞
    sem.release();
    sem.release();
  });

  it.concurrent("达到限制时 acquire 阻塞，release 后恢复", async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    await sem.acquire();
    order.push(1);

    const blocked = sem.acquire().then(() => {
      order.push(3);
    });

    // 等一个 microtask，确认 blocked 还没执行
    await Promise.resolve();
    order.push(2);

    sem.release();
    await blocked;

    expect(order).toEqual([1, 2, 3]);
    sem.release();
  });

  it.concurrent("并发数不超过限制", async () => {
    const limit = 3;
    const sem = new Semaphore(limit);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      await sem.acquire();
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      // 模拟异步操作
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      sem.release();
    };

    await Promise.all(Array.from({ length: 10 }, () => task()));

    expect(maxConcurrent).toBe(limit);
  });

  it.concurrent("按 FIFO 顺序唤醒等待者", async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    await sem.acquire();

    const p1 = sem.acquire().then(() => {
      order.push(1);
      sem.release();
    });
    const p2 = sem.acquire().then(() => {
      order.push(2);
      sem.release();
    });
    const p3 = sem.acquire().then(() => {
      order.push(3);
      sem.release();
    });

    sem.release();
    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it.concurrent("double release 输出警告", () => {
    const sem = new Semaphore(1);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    sem.release();
    expect(warnSpy).toHaveBeenCalledWith("Semaphore double release detected");

    warnSpy.mockRestore();
  });
});

describe("withTimeoutNotify", () => {
  it.concurrent("promise 在超时前完成时，回调收到 done=true", async () => {
    const promise = Promise.resolve("ok");
    const calls: Array<{ done: boolean; timeouted: boolean }> = [];

    const res = await withTimeoutNotify(promise, 1000, (r) => {
      calls.push({ done: r.done, timeouted: r.timeouted });
    });

    expect(res.result).toBe("ok");
    expect(res.done).toBe(true);
    expect(res.timeouted).toBe(false);
    expect(res.err).toBeUndefined();
    // 只调用一次（done），不触发 timeout
    expect(calls).toEqual([{ done: true, timeouted: false }]);
  });

  it.concurrent("promise 在超时前失败时，回调收到 err", async () => {
    const error = new Error("fail");
    const promise = Promise.reject(error);
    const calls: Array<{ done: boolean; err: Error | undefined }> = [];

    const res = await withTimeoutNotify(promise, 1000, (r) => {
      calls.push({ done: r.done, err: r.err });
    });

    expect(res.err).toBe(error);
    expect(res.done).toBe(true);
    expect(res.result).toBeUndefined();
    expect(calls).toEqual([{ done: true, err: error }]);
  });

  it.concurrent("超时后回调被调用，promise 完成后再次调用", async () => {
    vi.useFakeTimers();
    let resolvePromise: (v: string) => void;
    const promise = new Promise<string>((r) => {
      resolvePromise = r;
    });
    const calls: Array<{ done: boolean; timeouted: boolean }> = [];

    const resultPromise = withTimeoutNotify(promise, 100, (r) => {
      calls.push({ done: r.done, timeouted: r.timeouted });
    });

    // 触发超时
    vi.advanceTimersByTime(100);
    expect(calls).toEqual([{ done: false, timeouted: true }]);

    // promise 完成
    resolvePromise!("late");
    const res = await resultPromise;

    expect(res.result).toBe("late");
    expect(res.done).toBe(true);
    expect(res.timeouted).toBe(true);
    // 回调被调用两次：timeout + done
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ done: true, timeouted: true });

    vi.useRealTimers();
  });

  it.concurrent("超时后 promise 失败，回调也被调用两次", async () => {
    vi.useFakeTimers();
    let rejectPromise: (e: Error) => void;
    const promise = new Promise<string>((_, reject) => {
      rejectPromise = reject;
    });
    const calls: Array<{ timeouted: boolean; err: Error | undefined }> = [];

    const resultPromise = withTimeoutNotify(promise, 50, (r) => {
      calls.push({ timeouted: r.timeouted, err: r.err });
    });

    vi.advanceTimersByTime(50);
    expect(calls).toHaveLength(1);

    const error = new Error("network error");
    rejectPromise!(error);
    const res = await resultPromise;

    expect(res.err).toBe(error);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ timeouted: true, err: error });

    vi.useRealTimers();
  });
});

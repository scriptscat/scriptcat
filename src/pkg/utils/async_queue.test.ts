// async_queue.test.ts
import { describe, it, expect } from "vitest";
import { stackAsyncTask } from "./async_queue";

/**
 * 工具：生成随机 key（保证高唯一性，避免并行互撞）
 */
const generateKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * 工具：可控延时的异步函数（真实时钟）
 */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 小缓冲，避免各平台/CI 定时器抖动
const EPS = 10;

// 小工具：deferred/gate 与 nextTick（以微任务换档，避免依赖 ms）
const deferred = <T = void>() => {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e?: any) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

const nextTick = () => Promise.resolve().then(() => {});

describe.concurrent("stackAsyncTask（按键名排队的异步序列队列）", () => {
  it.concurrent("同一 key 下任务应按入队顺序串行执行", async () => {
    const key = generateKey("k-serial");
    const order: number[] = [];

    const t1 = stackAsyncTask(key, async () => {
      order.push(1); // t≈0ms
      await sleep(50);
      return "a";
    });

    const t2 = stackAsyncTask(key, async () => {
      order.push(2); // 预期 t≈50ms
      await sleep(50);
      return "b";
    });

    await sleep(20 + EPS); // t≈20ms
    expect(order).toEqual([1]);

    await sleep(60 + EPS); // t≈80ms
    expect(order).toEqual([1, 2]);

    await sleep(60 + EPS); // t≈140ms
    expect(order).toEqual([1, 2]);

    await expect(t1).resolves.toBe("a");
    await expect(t2).resolves.toBe("b");
  });

  it.concurrent("不同 key 下任务应并行执行，互不阻塞", async () => {
    const k1 = generateKey("k-par-1");
    const k2 = generateKey("k-par-2");
    const done: string[] = [];

    const p1 = stackAsyncTask(k1, async () => {
      await sleep(100);
      done.push("k1-1"); // t≈100ms
      return 1;
    });

    const p2 = stackAsyncTask(k2, async () => {
      await sleep(50);
      done.push("k2-1"); // t≈50ms
      return 2;
    });

    await sleep(30 + EPS); // t≈30ms
    expect(done).toEqual([]);

    await sleep(40 + EPS); // t≈70ms
    expect(done).toEqual(["k2-1"]);

    await sleep(50 + EPS); // t≈120ms
    expect(done).toEqual(["k2-1", "k1-1"]);

    await expect(p1).resolves.toBe(1);
    await expect(p2).resolves.toBe(2);
  });

  it.concurrent("在执行过程中追加同 key 的任务，应排在队尾并自动衔接执行", async () => {
    const key1 = generateKey("k-append1");
    const key2 = generateKey("k-append2");
    const seq: string[] = [];

    // 三个可控「闸门」，用来精确控制 A/B/C 的完成时机
    const gateA = deferred();
    const gateB = deferred();
    const gateC = deferred();

    // A：先开始，等待 gateA 才结束
    const p1 = stackAsyncTask(key1, async () => {
      seq.push("A:start");
      await gateA.promise;
      seq.push("A:end");
      return "A";
    });

    // 将 B/C 追加到微任务，保证「A 已开始」后再入队
    (async () => {
      await nextTick();
      stackAsyncTask(key2, async () => {
        seq.push("B:start");
        await gateB.promise;
        seq.push("B:end");
        return "B";
      });
    })();

    (async () => {
      await nextTick();
      stackAsyncTask(key1, async () => {
        // 必须排在 A 后面执行
        seq.push("C:start");
        await gateC.promise;
        seq.push("C:end");
        return "C";
      });
    })();

    expect(seq).toEqual(["A:start"]);

    // 让微任务跑完，期待 A、B 已开始，但 C 尚未开始（因同 key 需等 A 结束）
    await nextTick();
    expect(seq).toEqual(["A:start", "B:start"]);

    // 放行 A，C 应自动衔接开始
    gateA.resolve();
    await nextTick();
    expect(seq).toEqual(["A:start", "B:start", "A:end", "C:start"]);

    // 放行 B，B 可在 C 执行中结束（不同 key 并行）
    gateB.resolve();
    await nextTick();
    expect(seq).toEqual(["A:start", "B:start", "A:end", "C:start", "B:end"]);

    // 最后放行 C 结束
    gateC.resolve();
    await nextTick();
    expect(seq).toEqual(["A:start", "B:start", "A:end", "C:start", "B:end", "C:end"]);

    await expect(p1).resolves.toBe("A");
  });

  it.concurrent("应将任务返回值传递给对应的 Promise", async () => {
    const key = generateKey("k-return");

    type Ret = { ok: boolean; n: number };
    const p = stackAsyncTask<Ret>(key, async () => {
      await sleep(50);
      return { ok: true, n: 7 }; // t≈50ms
    });

    await sleep(70 + EPS); // t≈70ms
    await expect(p).resolves.toEqual({ ok: true, n: 7 });
  });

  it.concurrent("当首个任务入队时应自动启动队列（无需手动触发）", async () => {
    const key = generateKey("k-autostart");
    let counter = 0;

    const p = stackAsyncTask(key, async () => {
      await sleep(50);
      counter++; // t≈50ms
      return "X";
    });

    sleep(100).then(() => {
      // t≈100ms
      stackAsyncTask(key, async () => {
        counter += 2; // 入队即加
        await sleep(50);
        counter += 4; // t≈150ms
        return "X";
      });
    });

    // 尚未推进时间前，应该尚未变更
    expect(counter).toBe(0);

    await sleep(70 + EPS); // t≈70ms
    expect(counter).toBe(1);

    await sleep(50 + EPS); // t≈120ms
    expect(counter).toBe(3);

    await sleep(50 + EPS); // t≈170ms
    expect(counter).toBe(7);

    // 再丢一个任务验证自动启动
    stackAsyncTask(key, async () => {
      counter = 0;
    });
    expect(counter).toBe(0);

    await expect(p).resolves.toBe("X");
  });

  it.concurrent("当任务抛出异常时，应正确拒绝 Promise 并继续执行队列", async () => {
    const key = generateKey("k-error");
    const order: number[] = [];

    const p1 = stackAsyncTask(key, async () => {
      order.push(1); // t≈0ms
      await sleep(50);
      throw new Error("任务失败");
    });

    const p1Assert = expect(p1).rejects.toThrow("任务失败");

    const p2 = stackAsyncTask(key, async () => {
      order.push(2);
      await sleep(50);
      return "success";
    });

    const p2Assert = expect(p2).resolves.toBe("success");

    await sleep(30 + EPS); // t≈30ms
    expect(order).toEqual([1]);

    await sleep(40 + EPS); // t≈70ms
    await p1Assert;
    expect(order).toEqual([1, 2]);

    await sleep(70 + EPS); // t≈140ms
    await p2Assert;
  });

  it.concurrent("应处理无效 key（如 null 或空字符串）", async () => {
    const p1 = stackAsyncTask("", async () => {
      await sleep(50);
      return "empty";
    });
    const p2 = stackAsyncTask(null as any, async () => {
      await sleep(50);
      return "null";
    });

    await sleep(70 + EPS); // t≈70ms
    await expect(p1).resolves.toBe("empty");
    await expect(p2).resolves.toBe("null");
  });

  it.concurrent("应处理大量任务堆积", async () => {
    const key = generateKey("k-massive");
    const order: number[] = [];
    const len = 9000;
    const deferreds = Array.from({ length: len }, () => deferred());
    const tasks = Array.from({ length: len }, (_, i) =>
      stackAsyncTask(key, async () => {
        order.push(3 * i);
        await deferreds[i].promise;
        return 2 * i;
      })
    );
    expect(order).toEqual([0]);
    await sleep(30);
    for (let i = 0; i < len; i++) {
      deferreds[i].resolve();
    }
    await sleep(30);
    expect(order).toEqual(Array.from({ length: len }, (_, i) => 3 * i));
    await Promise.all(tasks.map((p, i) => expect(p).resolves.toBe(2 * i)));
  });

  it.concurrent("在真实异步环境中应正确执行（无假定时器）", async () => {
    const key = generateKey("k-real");
    const order: number[] = [];

    const p1 = stackAsyncTask(key, async () => {
      order.push(1);
      await sleep(50);
      return "a";
    });

    const p2 = stackAsyncTask(key, async () => {
      order.push(2);
      await sleep(50);
      return "b";
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
    expect(await p1).toBe("a");
    expect(await p2).toBe("b");
  });
});

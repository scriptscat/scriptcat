// async_queue.test.ts
import { describe, it, expect } from "vitest";
import { stackAsyncTask } from "./async_queue";

/* ==================== 工具函数 ==================== */

const generateKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** 手动控制的 Promise（用于阻塞） */
const deferred = <T = void>() => {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const nextTick = () => Promise.resolve();
/** 强制执行所有已入队微任务与 then 链 */
const flush = async () => {
  await nextTick();
  await nextTick();
  await nextTick();
};

/** 为 key 设置一个「永远阻塞」的任务，供手动放行 */
const setupBlockingTask = (key: any) => {
  const gate = deferred<void>();
  stackAsyncTask(key, async () => {
    await gate.promise; // 直到 gate.resolve()
  });
  return gate;
};

/* ==================== 测试套件 ==================== */

describe.concurrent("stackAsyncTask 测试", () => {
  /* ------------------- 1. 基础行为 ------------------- */
  it.concurrent("【1】串行、并行、同步函数、相同函数独立性 + 返回值透传", async () => {
    const k1 = generateKey("serial");
    const kPar1 = generateKey("par1");
    const kPar2 = generateKey("par2");
    const kSync = generateKey("sync");
    const kSameFn = generateKey("same-fn");

    const g1 = setupBlockingTask(k1);
    const gPar1 = setupBlockingTask(kPar1);
    const gPar2 = setupBlockingTask(kPar2);
    const gSync = setupBlockingTask(kSync);

    const order: number[] = [];
    const done: string[] = [];

    // 串行（同 key）
    const t1 = stackAsyncTask(k1, async () => {
      order.push(1);
      return "a";
    });
    const t2 = stackAsyncTask(k1, async () => {
      order.push(2);
      return "b";
    });

    // 并行（不同 key）
    const p1 = stackAsyncTask(kPar1, async () => {
      done.push("p1");
      return 1;
    });
    const p2 = stackAsyncTask(kPar2, async () => {
      done.push("p2");
      return 2;
    });

    // 同步函数（同 key）
    const s1 = stackAsyncTask(kSync, () => {
      order.push(100);
      return "x";
    });
    const s2 = stackAsyncTask(kSync, () => {
      order.push(200);
      return "y";
    });

    // 相同函数引用（同 key）
    let counter = 0;
    const task = async () => ++counter;
    const f1 = stackAsyncTask(kSameFn, task);
    const f2 = stackAsyncTask(kSameFn, task);

    await flush();
    expect(order).toEqual([]);
    expect(done).toEqual([]);
    expect(counter).toBe(2); // f2 已执行（无 gate）

    // 放行串行
    g1.resolve();
    await flush();
    expect(order).toEqual([1, 2]);

    // 放行并行（观察完成顺序）
    gPar2.resolve();
    await flush();
    expect(done).toEqual(["p2"]);
    gPar1.resolve();
    await flush();
    expect(done).toEqual(["p2", "p1"]);

    // 放行同步
    gSync.resolve();
    await flush();
    expect(order).toEqual([1, 2, 100, 200]);

    // 结果验证
    await expect(f1).resolves.toBe(1);
    await expect(f2).resolves.toBe(2);
    await expect(t1).resolves.toBe("a");
    await expect(t2).resolves.toBe("b");
    await expect(p1).resolves.toBe(1);
    await expect(p2).resolves.toBe(2);
    await expect(s1).resolves.toBe("x");
    await expect(s2).resolves.toBe("y");
  });

  /* ------------------- 2. 动态入队 + 内部入队 ------------------- */
  it.concurrent("【2】动态入队、内部入队、自动接续、不死锁 + 返回值可 await", async () => {
    const k1 = generateKey("dyn");
    const kInner = generateKey("inner");
    const gBlock = setupBlockingTask(k1);
    const gInner = setupBlockingTask(kInner);

    const seq1: string[] = [];
    const seq2: string[] = [];
    let pB: Promise<any>;

    // 动态追加（同 key C、不同 key B）
    const pA = stackAsyncTask(k1, async () => {
      seq1.push("A:start");
      await Promise.resolve().then(() => {
        stackAsyncTask(k1, async () => {
          seq1.push("C:start");
          return "C";
        });
        stackAsyncTask(generateKey("other"), async () => {
          seq1.push("B1");
        });
        flush().then(() => {
          stackAsyncTask(generateKey("other"), async () => {
            seq1.push("B2");
          });
        });
      });
      seq1.push("A:end");
      return "A";
    });

    await flush();
    expect(seq1).toEqual([]);

    gBlock.resolve();
    await flush();
    await flush();
    expect(seq1).toEqual(["A:start", "B1", "A:end", "C:start", "B2"]);

    // 内部入队（同 key）
    stackAsyncTask(kInner, async () => {
      seq2.push("X:start");
      pB = stackAsyncTask(kInner, async () => {
        seq2.push("Y:start");
        return "Y";
      });
      seq2.push("X:end");
    });

    await flush();
    expect(seq2).toEqual([]);

    gInner.resolve();
    await flush();
    expect(seq2).toEqual(["X:start", "X:end", "Y:start"]);

    await expect(pA).resolves.toBe("A");
    await expect(pB!).resolves.toBe("Y");
  });

  /* ------------------- 3. 错误处理 ------------------- */
  it.concurrent("【3】reject、throw、内部错误不中断 + 返回值 reject 正确", async () => {
    const k = generateKey("err");
    const g = setupBlockingTask(k);

    const logs: string[] = [];
    let pInner: Promise<any>;

    const p1 = stackAsyncTask(k, async () => {
      logs.push("E1");
      await Promise.reject("reject");
    });
    const p1Assert = expect(p1).rejects.toBe("reject");

    const p2 = stackAsyncTask(k, async () => {
      logs.push("E2");
      throw new Error("throw");
    });
    const p2Assert = expect(p2).rejects.toThrow("throw");

    const p3 = stackAsyncTask(k, async () => {
      logs.push("E3:start");
      pInner = stackAsyncTask(k, () => {
        throw new Error("inner");
      });
      logs.push("E3:throw");
      throw new Error("outer");
    });

    const p3Assert = expect(p3).rejects.toThrow("outer");

    const p4 = stackAsyncTask(k, async () => {
      logs.push("E4");
      return "ok";
    });

    await flush();
    expect(logs).toEqual([]);

    g.resolve();
    await flush();
    await flush();
    await flush();
    const pInnerAssert = expect(pInner!).rejects.toThrow("inner");
    expect(logs).toEqual(["E1", "E2", "E3:start", "E3:throw", "E4"]);

    await p1Assert;
    await p2Assert;
    await p3Assert;
    await pInnerAssert;
    await expect(p4).resolves.toBe("ok");
  });

  /* ------------------- 4. key 类型 + 裸 Promise ------------------- */
  it.concurrent("【4】支援 ''、null、Symbol key + 直接返回 Promise", async () => {
    const kStr = "";
    const kNull = null as any;
    const kSym = Symbol("sym");
    const gStr = setupBlockingTask(kStr);
    const gNull = setupBlockingTask(kNull);
    const gSym = setupBlockingTask(kSym);

    // 裸 Promise 透传
    const gate = deferred<string>();
    const pRaw = stackAsyncTask(generateKey("raw"), () => gate.promise);
    gate.resolve("raw");
    await expect(pRaw).resolves.toBe("raw");

    const order: string[] = [];
    stackAsyncTask(kStr, () => order.push("str"));
    stackAsyncTask(kNull, () => order.push("null"));
    // @ts-expect-error Symbol key
    stackAsyncTask(kSym, () => order.push("sym"));

    await flush();
    expect(order).toEqual([]);

    gStr.resolve();
    await flush();
    expect(order).toEqual(["str"]);

    gNull.resolve();
    await flush();
    expect(order).toEqual(["str", "null"]);

    gSym.resolve();
    await flush();
    expect(order).toEqual(["str", "null", "sym"]);
  });

  /* ------------------- 5. 压力 + 递回 ------------------- */
  it.concurrent("【5】大量任务、递回不死锁 + 返回值正确", async () => {
    const kMass = generateKey("mass");
    const kRecur = generateKey("recur");
    const gMass = setupBlockingTask(kMass);

    // 大量任务
    const N = 3000;
    const tasks = Array.from({ length: N }, (_, i) => stackAsyncTask(kMass, async () => i));

    await flush();
    gMass.resolve();
    await Promise.all(tasks.map((p, i) => expect(p).resolves.toBe(i)));

    // 递回
    const order: number[] = [];
    const final = deferred<number>();
    let count = 0;
    const run = async (): Promise<number> => {
      const id = ++count;
      order.push(id);
      if (id < 5) stackAsyncTask(kRecur, run);
      else order.push(await final.promise);
      return id;
    };

    const pRecur = stackAsyncTask(kRecur, run);
    await flush();
    expect(order).toEqual([1, 2, 3, 4, 5]);

    final.resolve(99);
    await flush();
    await expect(pRecur).resolves.toBe(1);
    expect(order).toEqual([1, 2, 3, 4, 5, 99]);
  });

  /* ------------------- 6. 综合嵌套链 + 竞争入队 ------------------- */
  it.concurrent("【6】嵌套链（跨 key）、竞争入队、顺序正确 + 返回值链", async () => {
    const k1 = generateKey("chain1");
    const k2 = generateKey("chain2");
    const g1 = setupBlockingTask(k1);
    const g2 = setupBlockingTask(k2);

    const logs: string[] = [];

    // 嵌套链：A → B（跨 key）
    const pRoot = stackAsyncTask(k1, async () => {
      logs.push("A");
      const pB = stackAsyncTask(k2, async () => {
        logs.push("B");
        return `B`;
      });
      const b = await pB;
      return `A(${b})`;
    });

    await flush();
    expect(logs).toEqual([]);

    g1.resolve();
    await flush();
    expect(logs).toEqual(["A"]);

    g2.resolve();
    await flush();
    expect(logs).toEqual(["A", "B"]);

    await expect(pRoot).resolves.toBe("A(B)");

    // 竞争入队（不同 key）
    const order: number[] = [];
    const promises = Array.from({ length: 5 }, (_, i) =>
      stackAsyncTask(generateKey(`race-${i}`), () => {
        order.push(i);
        return i;
      })
    );
    const results = await Promise.all(promises);
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  /* ------------------- 7. 跨 key 链接（正确 await 返回值） ------------------- */
  it.concurrent("【7】跨 key 链接：内部任务返回值可被外层 await（不 await stackAsyncTask）", async () => {
    const kOuter = generateKey("outer");
    const kInner = generateKey("inner");

    const pOuter = stackAsyncTask(kOuter, async () => {
      const pInner = stackAsyncTask(kInner, async () => {
        return "inner-data";
      });
      const data = await pInner; // 正确：await 返回值
      return `outer(${data})`;
    });

    setupBlockingTask(kOuter).resolve();
    setupBlockingTask(kInner).resolve();
    await flush();

    await expect(pOuter).resolves.toBe("outer(inner-data)");
  });
});

// async_queue.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearStack, stackAsyncTask } from "./async_queue";

/**
 * 工具：生成隨機 key
 */
const generateKey = (prefix: string) => `${prefix}-${Math.random()}`;

/**
 * 工具：可控延時的異步函數
 */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

beforeEach(() => {
  // 使用假定时器，便于精确推進時間線
  vi.useFakeTimers();
  // 清空 stacks
  clearStack();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("stackAsyncTask（按鍵名排队的异步序列队列）", () => {
  it("同一 key 下任務應按入隊順序串行執行", async () => {
    const key = generateKey("k-serial");
    const order: number[] = [];

    const t1 = stackAsyncTask(key, async () => {
      order.push(1); // t=0ms
      await sleep(50);
      return "a";
    });

    const t2 = stackAsyncTask(key, async () => {
      order.push(2); // t=50ms
      await sleep(50);
      return "b";
    });

    expect(order).toEqual([1]);
    await vi.advanceTimersByTimeAsync(20); // t=20ms
    expect(order).toEqual([1]);

    await vi.advanceTimersByTimeAsync(60); // t=80ms
    expect(order).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(60); // t=140ms
    expect(order).toEqual([1, 2]);

    await expect(t1).resolves.toBe("a");
    await expect(t2).resolves.toBe("b");
  });

  it("不同 key 下任務應並行執行，互不阻塞", async () => {
    const k1 = generateKey("k-par-1");
    const k2 = generateKey("k-par-2");
    const done: string[] = [];

    const p1 = stackAsyncTask(k1, async () => {
      await sleep(100);
      done.push("k1-1"); // t=100ms
      return 1;
    });

    const p2 = stackAsyncTask(k2, async () => {
      await sleep(50);
      done.push("k2-1"); // t=50ms
      return 2;
    });

    await vi.advanceTimersByTimeAsync(30); // t=30ms
    expect(done).toEqual([]);

    await vi.advanceTimersByTimeAsync(40); // t=70ms
    expect(done).toEqual(["k2-1"]);

    await vi.advanceTimersByTimeAsync(50); // t=120ms
    expect(done).toEqual(["k2-1", "k1-1"]);

    await expect(p1).resolves.toBe(1);
    await expect(p2).resolves.toBe(2);
  });

  it("在執行過程中追加同 key 的任務，應排在隊尾並自動銜接執行", async () => {
    const key1 = generateKey("k-append1");
    const key2 = generateKey("k-append2");
    const seq: string[] = [];

    const p1 = stackAsyncTask(key1, async () => {
      seq.push("A:start"); // t=0ms
      await sleep(50);
      seq.push("A:end"); // t=50ms
      return "A";
    });

    (async () => {
      await sleep(20); // t=20ms
      stackAsyncTask(key2, async () => {
        seq.push("B:start"); // t=20ms
        await sleep(50);
        seq.push("B:end"); // t=70ms
        return "B";
      });
    })();

    (async () => {
      await sleep(20); // t=20ms
      stackAsyncTask(key1, async () => {
        seq.push("C:start"); // t=50ms
        await sleep(50);
        seq.push("C:end"); // t=100ms
        return "B";
      });
    })();

    await vi.advanceTimersByTimeAsync(10); // t=10ms
    expect(seq).toEqual(["A:start"]);

    await vi.advanceTimersByTimeAsync(30); // t=40ms
    expect(seq).toEqual(["A:start", "B:start"]);

    await vi.advanceTimersByTimeAsync(20); // t=60ms：A 完成
    expect(seq).toEqual(["A:start", "B:start", "A:end", "C:start"]);
    await vi.advanceTimersByTimeAsync(20); // t=80ms：B 完成
    expect(seq).toEqual(["A:start", "B:start", "A:end", "C:start", "B:end"]);

    await vi.advanceTimersByTimeAsync(70); // t=150ms：C 完成
    expect(seq).toEqual(["A:start", "B:start", "A:end", "C:start", "B:end", "C:end"]);

    await expect(p1).resolves.toBe("A");
  });

  it("應將任務返回值傳遞給對應的 Promise", async () => {
    const key = generateKey("k-return");

    type Ret = { ok: boolean; n: number };
    const p = stackAsyncTask<Ret>(key, async () => {
      await sleep(50);
      return { ok: true, n: 7 }; // t=50ms
    });

    await vi.advanceTimersByTimeAsync(70); // t=70ms
    await expect(p).resolves.toEqual({ ok: true, n: 7 });
  });

  it("當首個任務入隊時應自動啟動隊列（無需手動觸發）", async () => {
    const key = generateKey("k-autostart");
    let counter = 0;
    const p = stackAsyncTask(key, async () => {
      await sleep(50);
      counter++; // t= 50ms
      return "X";
    });

    sleep(100).then(() => {
      // t= 100ms
      stackAsyncTask(key, async () => {
        counter += 2; // t= 100ms
        await sleep(50);
        counter += 4; // t= 150ms
        return "X";
      });
    });

    // 尚未推進時間前，異步尚未完成，但應已開始執行（started 應為 false，因為 sleep 前設置）
    expect(counter).toBe(0);

    await vi.advanceTimersByTimeAsync(70); // t=70ms
    expect(counter).toBe(1);

    await vi.advanceTimersByTimeAsync(50); // t=120ms
    expect(counter).toBe(3);

    await vi.advanceTimersByTimeAsync(50); // t=170ms
    expect(counter).toBe(7);

    // 自動啟動
    stackAsyncTask(key, async () => {
      counter = 0;
    });

    expect(counter).toBe(0);

    await expect(p).resolves.toBe("X");
  });

  it("當任務拋出異常時，應正確拒絕 Promise 並繼續執行隊列", async () => {
    const key = generateKey("k-error");
    const order: number[] = [];

    const p1 = stackAsyncTask(key, async () => {
      order.push(1); // t=0ms
      await sleep(50);
      throw new Error("任務失敗");
    });

    const p1Assert = expect(p1).rejects.toThrow("任務失敗");

    const p2 = stackAsyncTask(key, async () => {
      order.push(2);
      await sleep(50);
      return "success";
    });

    const p2Assert = expect(p2).resolves.toBe("success");

    await vi.advanceTimersByTimeAsync(30); // t=30ms
    expect(order).toEqual([1]);

    await vi.advanceTimersByTimeAsync(40); // t=70ms
    await p1Assert;
    expect(order).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(70); // t=140ms
    await p2Assert;
  });

  it("應處理無效 key（如 null 或空字符串）", async () => {
    const p1 = stackAsyncTask("", async () => {
      await sleep(50);
      return "empty";
    });
    const p2 = stackAsyncTask(null as any, async () => {
      await sleep(50);
      return "null";
    });

    await vi.advanceTimersByTimeAsync(70); // t=70ms
    await expect(p1).resolves.toBe("empty");
    await expect(p2).resolves.toBe("null");
  });

  it("應處理大量任務堆積", async () => {
    const key = generateKey("k-massive");
    const order: number[] = [];
    const tasks = Array.from({ length: 50 }, (_, i) =>
      stackAsyncTask(key, async () => {
        order.push(i);
        await sleep(50);
        return i;
      })
    );

    await vi.advanceTimersByTimeAsync(2520); // t=2520ms（累計）
    expect(order).toEqual(Array.from({ length: 50 }, (_, i) => i));
    await Promise.all(tasks.map((p, i) => expect(p).resolves.toBe(i)));
  });

  it("在真實異步環境中應正確執行（無假定时器）", async () => {
    vi.useRealTimers(); // 切換到真實計時器
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

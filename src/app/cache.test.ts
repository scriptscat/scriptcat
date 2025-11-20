import { describe, it, expect, beforeEach, vi } from "vitest";
import { cacheInstance } from "./cache";

describe("Cache", () => {
  beforeEach(async () => {
    // 每个测试前清空缓存
    await cacheInstance.clear();
  });

  describe("基本操作", () => {
    it("应该能够设置和获取不同类型的值", async () => {
      await cacheInstance.set("string", "hello");
      expect(await cacheInstance.get("string")).toBe("hello");

      await cacheInstance.set("number", 42);
      expect(await cacheInstance.get("number")).toBe(42);

      const obj = { name: "test", count: 1 };
      await cacheInstance.set("object", obj);
      expect(await cacheInstance.get("object")).toEqual(obj);

      expect(await cacheInstance.get("non-existent")).toBeUndefined();
    });

    it("应该能够批量设置值", async () => {
      await cacheInstance.batchSet({
        key1: "value1",
        key2: "value2",
        key3: "value3",
      });

      expect(await cacheInstance.get("key1")).toBe("value1");
      expect(await cacheInstance.get("key2")).toBe("value2");
      expect(await cacheInstance.get("key3")).toBe("value3");
    });
  });

  describe("has/del/clear/list 方法", () => {
    it("应该正确检查键是否存在", async () => {
      await cacheInstance.set("existing-key", "value");
      expect(await cacheInstance.has("existing-key")).toBe(true);
      expect(await cacheInstance.has("non-existing-key")).toBe(false);

      await cacheInstance.set("undefined-key", undefined);
      expect(await cacheInstance.has("undefined-key")).toBe(false);
    });

    it("应该能够删除键和清空缓存", async () => {
      await cacheInstance.batchSet({ key1: "v1", key2: "v2" });

      await cacheInstance.del("key1");
      expect(await cacheInstance.has("key1")).toBe(false);
      expect(await cacheInstance.has("key2")).toBe(true);

      await cacheInstance.clear();
      expect(await cacheInstance.has("key2")).toBe(false);
    });

    it("应该能够批量删除键", async () => {
      await cacheInstance.batchSet({ key1: "v1", key2: "v2", key3: "v3", key4: "v4" });

      await (cacheInstance as any).dels(["key1", "key2", "key3"]);
      expect(await cacheInstance.has("key1")).toBe(false);
      expect(await cacheInstance.has("key2")).toBe(false);
      expect(await cacheInstance.has("key3")).toBe(false);
      expect(await cacheInstance.has("key4")).toBe(true);
    });

    it("应该返回所有键的列表", async () => {
      await cacheInstance.batchSet({ key1: "v1", key2: "v2", key3: "v3" });
      const keys = await cacheInstance.list();
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toContain("key3");
    });
  });

  describe("getOrSet 方法", () => {
    it("应该懒加载和缓存值", async () => {
      const setFn = vi.fn(() => "computed-value");
      const value1 = await cacheInstance.getOrSet("new-key", setFn);
      expect(setFn).toHaveBeenCalledTimes(1);
      expect(value1).toBe("computed-value");

      const setFn2 = vi.fn(() => "new-value");
      const value2 = await cacheInstance.getOrSet("new-key", setFn2);
      expect(setFn2).not.toHaveBeenCalled();
      expect(value2).toBe("computed-value");
    });
  });

  describe("tx 方法（事务）", () => {
    it("应该能够读取、修改和删除值", async () => {
      // 设置值
      await cacheInstance.tx("tx-key", (val, tx) => {
        tx.set("new-value");
      });
      expect(await cacheInstance.get("tx-key")).toBe("new-value");

      // 基于现有值修改
      await cacheInstance.tx("tx-key", (val: string | undefined, tx) => {
        tx.set((val || "") + "-updated");
      });
      expect(await cacheInstance.get("tx-key")).toBe("new-value-updated");

      // 删除值
      await cacheInstance.tx("tx-key", (val, tx) => {
        tx.del();
      });
      expect(await cacheInstance.has("tx-key")).toBe(false);
    });
  });

  describe("incr 方法", () => {
    it("应该能够增加和减少数值", async () => {
      expect(await cacheInstance.incr("counter", 5)).toBe(5);
      expect(await cacheInstance.incr("counter", 3)).toBe(8);
      expect(await cacheInstance.incr("counter", -2)).toBe(6);
      expect(await cacheInstance.get("counter")).toBe(6);
    });
  });

  describe("并发操作", () => {
    it("同一个键的事务应该串行化执行", async () => {
      await cacheInstance.set("tx-counter", 0);
      const executionOrder: number[] = [];

      const promises = [
        cacheInstance.tx("tx-counter", async (val: number | undefined, tx) => {
          executionOrder.push(1);
          await new Promise((resolve) => setTimeout(resolve, 30));
          tx.set((val || 0) + 1);
          return 1;
        }),
        cacheInstance.tx("tx-counter", async (val: number | undefined, tx) => {
          executionOrder.push(2);
          await new Promise((resolve) => setTimeout(resolve, 20));
          tx.set((val || 0) + 1);
          return 2;
        }),
        cacheInstance.tx("tx-counter", async (val: number | undefined, tx) => {
          executionOrder.push(3);
          await new Promise((resolve) => setTimeout(resolve, 10));
          tx.set((val || 0) + 1);
          return 3;
        }),
      ];

      const results = await Promise.all(promises);

      // 验证事务按顺序执行，每个事务都返回正确的递增值
      expect(executionOrder).toEqual([1, 2, 3]);
      expect(results).toEqual([1, 2, 3]);
      expect(await cacheInstance.get("tx-counter")).toBe(3);
    });

    it("不同键的事务可以并发执行", async () => {
      const startTime = Date.now();

      await Promise.all([
        cacheInstance.tx("key-a", async (val, tx) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          tx.set("value-a");
        }),
        cacheInstance.tx("key-b", async (val, tx) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          tx.set("value-b");
        }),
        cacheInstance.tx("key-c", async (val, tx) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          tx.set("value-c");
        }),
      ]);

      const duration = Date.now() - startTime;

      // 如果并发执行，总时间应该接近单个操作的时间（约50ms）
      // 如果串行执行，总时间会接近 150ms
      expect(duration).toBeLessThan(100);
    });

    it("并发 incr 操作应该正确累加", async () => {
      await cacheInstance.set("incr-concurrent", 0);

      const promises = Array.from({ length: 10 }, () => cacheInstance.incr("incr-concurrent", 1));
      const results = await Promise.all(promises);

      // 每个操作都应该返回唯一的递增值
      const sortedResults = [...results].sort((a, b) => a - b);
      expect(sortedResults).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(await cacheInstance.get("incr-concurrent")).toBe(10);
    });
  });

  describe("边界情况", () => {
    it("应该能够处理特殊值", async () => {
      await cacheInstance.set("empty-value", "");
      expect(await cacheInstance.get("empty-value")).toBe("");

      await cacheInstance.set("null-value", null);
      expect(await cacheInstance.get("null-value")).toBe(null);

      await cacheInstance.set("overwrite", "original");
      await cacheInstance.set("overwrite", "updated");
      expect(await cacheInstance.get("overwrite")).toBe("updated");
    });
  });
});

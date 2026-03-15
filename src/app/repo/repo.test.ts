import { describe, it, expect, beforeEach } from "vitest";
import { Repo } from "./repo";

// 定义测试数据类型
interface TestItem {
  id: string;
  name: string;
  value: number;
}

// 创建一个具体的子类用于测试
class TestRepo extends Repo<TestItem> {
  constructor(prefix = "test") {
    super(prefix);
  }

  // 公开 _save 方法以便测试
  save(key: string, val: TestItem) {
    return this._save(key, val);
  }

  // 公开 joinKey 方法以便测试
  getJoinedKey(key: string) {
    return this.joinKey(key);
  }
}

describe("Repo", () => {
  let repo: TestRepo;

  beforeEach(async () => {
    // 清空 storage
    await chrome.storage.local.clear();
    repo = new TestRepo("test");
  });

  describe("joinKey", () => {
    it("应自动补全前缀冒号", () => {
      const r = new TestRepo("myprefix");
      expect(r.getJoinedKey("abc")).toBe("myprefix:abc");
    });

    it("已有冒号的前缀不应重复添加", () => {
      const r = new TestRepo("myprefix:");
      expect(r.getJoinedKey("abc")).toBe("myprefix:abc");
    });
  });

  describe("save 和 get", () => {
    it("应能保存并获取数据", async () => {
      const item: TestItem = { id: "1", name: "测试项", value: 42 };
      await repo.save("1", item);

      const result = await repo.get("1");
      expect(result).toEqual(item);
    });

    it("获取不存在的 key 应返回 undefined", async () => {
      const result = await repo.get("not-exist");
      expect(result).toBeUndefined();
    });

    it("应能覆盖已有数据", async () => {
      const item1: TestItem = { id: "1", name: "原始", value: 1 };
      const item2: TestItem = { id: "1", name: "更新", value: 2 };

      await repo.save("1", item1);
      await repo.save("1", item2);

      const result = await repo.get("1");
      expect(result).toEqual(item2);
    });
  });

  describe("gets", () => {
    it("应能批量获取多个数据", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      const item2: TestItem = { id: "2", name: "项2", value: 2 };
      await repo.save("1", item1);
      await repo.save("2", item2);

      const results = await repo.gets(["1", "2"]);
      expect(results).toEqual([item1, item2]);
    });

    it("不存在的 key 应返回 undefined", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      await repo.save("1", item1);

      const results = await repo.gets(["1", "not-exist"]);
      expect(results).toEqual([item1, undefined]);
    });

    it("空数组应返回空数组", async () => {
      const results = await repo.gets([]);
      expect(results).toEqual([]);
    });
  });

  describe("getRecord", () => {
    it("应以 Record 形式返回数据", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      const item2: TestItem = { id: "2", name: "项2", value: 2 };
      await repo.save("1", item1);
      await repo.save("2", item2);

      const record = await repo.getRecord(["1", "2"]);
      expect(record["test:1"]).toEqual(item1);
      expect(record["test:2"]).toEqual(item2);
    });
  });

  describe("find", () => {
    it("无过滤器时应返回所有匹配前缀的数据", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      const item2: TestItem = { id: "2", name: "项2", value: 2 };
      await repo.save("1", item1);
      await repo.save("2", item2);

      const results = await repo.find();
      expect(results).toHaveLength(2);
      expect(results).toEqual(expect.arrayContaining([item1, item2]));
    });

    it("应能通过过滤器筛选数据", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      const item2: TestItem = { id: "2", name: "项2", value: 10 };
      const item3: TestItem = { id: "3", name: "项3", value: 5 };
      await repo.save("1", item1);
      await repo.save("2", item2);
      await repo.save("3", item3);

      const results = await repo.find((_key, val) => val.value > 3);
      expect(results).toHaveLength(2);
      expect(results).toEqual(expect.arrayContaining([item2, item3]));
    });

    it("不同前缀的数据不应出现在结果中", async () => {
      const otherRepo = new TestRepo("other");
      const item1: TestItem = { id: "1", name: "test项", value: 1 };
      const item2: TestItem = { id: "1", name: "other项", value: 2 };
      await repo.save("1", item1);
      await otherRepo.save("1", item2);

      const results = await repo.find();
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(item1);
    });
  });

  describe("findOne", () => {
    it("应返回第一个匹配的数据", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      await repo.save("1", item1);

      const result = await repo.findOne();
      expect(result).toEqual(item1);
    });

    it("无数据时应返回 undefined", async () => {
      const result = await repo.findOne();
      expect(result).toBeUndefined();
    });

    it("应支持过滤条件", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      const item2: TestItem = { id: "2", name: "项2", value: 10 };
      await repo.save("1", item1);
      await repo.save("2", item2);

      const result = await repo.findOne((_key, val) => val.value > 5);
      expect(result).toEqual(item2);
    });
  });

  describe("all", () => {
    it("应返回所有数据", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      const item2: TestItem = { id: "2", name: "项2", value: 2 };
      await repo.save("1", item1);
      await repo.save("2", item2);

      const results = await repo.all();
      expect(results).toHaveLength(2);
      expect(results).toEqual(expect.arrayContaining([item1, item2]));
    });
  });

  describe("delete", () => {
    it("应能删除单个数据", async () => {
      const item: TestItem = { id: "1", name: "项1", value: 1 };
      await repo.save("1", item);

      await repo.delete("1");
      const result = await repo.get("1");
      expect(result).toBeUndefined();
    });

    it("删除不存在的 key 不应报错", async () => {
      await expect(repo.delete("not-exist")).resolves.toBeUndefined();
    });
  });

  describe("deletes", () => {
    it("应能批量删除多个数据", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      const item2: TestItem = { id: "2", name: "项2", value: 2 };
      const item3: TestItem = { id: "3", name: "项3", value: 3 };
      await repo.save("1", item1);
      await repo.save("2", item2);
      await repo.save("3", item3);

      await repo.deletes(["1", "3"]);

      const r1 = await repo.get("1");
      const r2 = await repo.get("2");
      const r3 = await repo.get("3");
      expect(r1).toBeUndefined();
      expect(r2).toEqual(item2);
      expect(r3).toBeUndefined();
    });
  });

  describe("update", () => {
    it("应能部分更新已有数据", async () => {
      const item: TestItem = { id: "1", name: "原始", value: 1 };
      await repo.save("1", item);

      const result = await repo.update("1", { name: "更新后" });
      expect(result).not.toBe(false);
      expect((result as TestItem).name).toBe("更新后");
      expect((result as TestItem).value).toBe(1);
    });

    it("更新不存在的数据应返回 false", async () => {
      const result = await repo.update("not-exist", { name: "更新" });
      expect(result).toBe(false);
    });

    it("更新后应能通过 get 获取最新数据", async () => {
      const item: TestItem = { id: "1", name: "原始", value: 1 };
      await repo.save("1", item);
      await repo.update("1", { value: 99 });

      const result = await repo.get("1");
      expect(result).toEqual({ id: "1", name: "原始", value: 99 });
    });
  });

  describe("updates", () => {
    it("应能通过 keys 数组批量更新数据", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      const item2: TestItem = { id: "2", name: "项2", value: 2 };
      await repo.save("1", item1);
      await repo.save("2", item2);

      const results = await repo.updates(["1", "2"], { value: 99 });
      expect(results).toHaveLength(2);
      expect((results[0] as TestItem).value).toBe(99);
      expect((results[0] as TestItem).name).toBe("项1");
      expect((results[1] as TestItem).value).toBe(99);
      expect((results[1] as TestItem).name).toBe("项2");
    });

    it("keys 数组中不存在的 key 应返回 false", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      await repo.save("1", item1);

      const results = await repo.updates(["1", "not-exist"], { value: 50 });
      expect(results[0]).not.toBe(false);
      expect((results[0] as TestItem).value).toBe(50);
      expect(results[1]).toBe(false);
    });

    it("应能通过 Record 形式批量更新不同的值", async () => {
      const item1: TestItem = { id: "1", name: "项1", value: 1 };
      const item2: TestItem = { id: "2", name: "项2", value: 2 };
      await repo.save("1", item1);
      await repo.save("2", item2);

      const results = await repo.updates({
        "1": { name: "更新1" },
        "2": { name: "更新2", value: 20 },
      });
      expect(Object.keys(results)).toHaveLength(2);
      expect((results["1"] as TestItem).name).toBe("更新1");
      expect((results["1"] as TestItem).value).toBe(1);
      expect((results["2"] as TestItem).name).toBe("更新2");
      expect((results["2"] as TestItem).value).toBe(20);
    });

    it("Record 形式中不存在的 key 应返回 false", async () => {
      const results = await repo.updates({
        "not-exist": { name: "更新" },
      });
      expect(results["not-exist"]).toBe(false);
    });
  });

  describe("缓存模式", () => {
    let cachedRepo: TestRepo;

    beforeEach(async () => {
      cachedRepo = new TestRepo("cached");
      cachedRepo.enableCache();
    });

    it("enableCache 后 useCache 应为 true", () => {
      expect(cachedRepo.useCache).toBe(true);
    });

    it("缓存模式下应能保存和获取数据", async () => {
      const item: TestItem = { id: "1", name: "缓存项", value: 100 };
      await cachedRepo.save("1", item);

      const result = await cachedRepo.get("1");
      expect(result).toEqual(item);
    });

    it("缓存模式下 get 返回的应是副本而非引用", async () => {
      const item: TestItem = { id: "1", name: "缓存项", value: 100 };
      await cachedRepo.save("1", item);

      const result1 = await cachedRepo.get("1");
      const result2 = await cachedRepo.get("1");
      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });

    it("缓存模式下应能删除数据", async () => {
      const item: TestItem = { id: "1", name: "缓存项", value: 100 };
      await cachedRepo.save("1", item);

      await cachedRepo.delete("1");
      const result = await cachedRepo.get("1");
      expect(result).toBeUndefined();
    });

    it("缓存模式下应能批量删除数据", async () => {
      const item1: TestItem = { id: "c1", name: "缓存项1", value: 1 };
      const item2: TestItem = { id: "c2", name: "缓存项2", value: 2 };
      await cachedRepo.save("c1", item1);
      await cachedRepo.save("c2", item2);

      await cachedRepo.deletes(["c1", "c2"]);

      const r1 = await cachedRepo.get("c1");
      const r2 = await cachedRepo.get("c2");
      expect(r1).toBeUndefined();
      expect(r2).toBeUndefined();
    });

    it("缓存模式下应能 find 数据", async () => {
      const item1: TestItem = { id: "c1", name: "缓存项1", value: 1 };
      const item2: TestItem = { id: "c2", name: "缓存项2", value: 10 };
      await cachedRepo.save("c1", item1);
      await cachedRepo.save("c2", item2);

      const results = await cachedRepo.find((_key, val) => val.value > 5);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(item2);
    });

    it("缓存模式下 find 返回的应是副本", async () => {
      const item: TestItem = { id: "c1", name: "缓存项", value: 1 };
      await cachedRepo.save("c1", item);

      const results1 = await cachedRepo.find();
      const results2 = await cachedRepo.find();
      // 找到该前缀的项进行比较
      const found1 = results1.find((r) => r.id === "c1");
      const found2 = results2.find((r) => r.id === "c1");
      expect(found1).toEqual(found2);
      expect(found1).not.toBe(found2);
    });

    it("缓存模式下应能 update 数据", async () => {
      const item: TestItem = { id: "c1", name: "原始", value: 1 };
      await cachedRepo.save("c1", item);

      const result = await cachedRepo.update("c1", { name: "更新后" });
      expect(result).not.toBe(false);
      expect((result as TestItem).name).toBe("更新后");

      const fetched = await cachedRepo.get("c1");
      expect(fetched?.name).toBe("更新后");
    });

    it("缓存模式下 update 不存在的数据应返回 false", async () => {
      const result = await cachedRepo.update("not-exist", { name: "更新" });
      expect(result).toBe(false);
    });

    it("缓存模式下应能通过 keys 数组批量 updates", async () => {
      const item1: TestItem = { id: "c1", name: "缓存项1", value: 1 };
      const item2: TestItem = { id: "c2", name: "缓存项2", value: 2 };
      await cachedRepo.save("c1", item1);
      await cachedRepo.save("c2", item2);

      const results = await cachedRepo.updates(["c1", "c2"], { value: 88 });
      expect(results).toHaveLength(2);
      expect((results[0] as TestItem).value).toBe(88);
      expect((results[1] as TestItem).value).toBe(88);

      const fetched = await cachedRepo.get("c1");
      expect(fetched?.value).toBe(88);
    });

    it("缓存模式下应能通过 Record 形式批量 updates", async () => {
      const item1: TestItem = { id: "c1", name: "缓存项1", value: 1 };
      const item2: TestItem = { id: "c2", name: "缓存项2", value: 2 };
      await cachedRepo.save("c1", item1);
      await cachedRepo.save("c2", item2);

      const results = await cachedRepo.updates({
        c1: { name: "新名1" },
        c2: { value: 20 },
      });
      expect(Object.keys(results)).toHaveLength(2);
      expect((results["c1"] as TestItem).name).toBe("新名1");
      expect((results["c1"] as TestItem).value).toBe(1);
      expect((results["c2"] as TestItem).value).toBe(20);
      expect((results["c2"] as TestItem).name).toBe("缓存项2");
    });

    it("缓存模式下 updates 不存在的 key 应返回 false", async () => {
      const results = await cachedRepo.updates(["not-exist"], { value: 1 });
      expect(results[0]).toBe(false);
    });

    it("缓存模式下应能批量获取数据", async () => {
      const item1: TestItem = { id: "c1", name: "缓存项1", value: 1 };
      const item2: TestItem = { id: "c2", name: "缓存项2", value: 2 };
      await cachedRepo.save("c1", item1);
      await cachedRepo.save("c2", item2);

      const results = await cachedRepo.gets(["c1", "c2"]);
      expect(results).toEqual([item1, item2]);
    });

    it("缓存模式下 gets 返回的应是副本", async () => {
      const item: TestItem = { id: "c1", name: "缓存项", value: 1 };
      await cachedRepo.save("c1", item);

      const results1 = await cachedRepo.gets(["c1"]);
      const results2 = await cachedRepo.gets(["c1"]);
      expect(results1[0]).toEqual(results2[0]);
      expect(results1[0]).not.toBe(results2[0]);
    });
  });
});

import { sleep } from "@App/pkg/utils/utils";
import { describe, expect, it } from "vitest";
import {
  getSessionRuleIds,
  LIMIT_SESSION_RULES,
  nextSessionRuleId,
  removeSessionRuleIdEntry,
} from "./dnr_id_controller";

describe("getSessionRuleIds", () => {
  it("从现有 chrome session rules 初始化", async () => {
    const ids = await getSessionRuleIds();
    expect(ids.size).lessThan(100);
    await nextSessionRuleId();
    expect(ids.size).greaterThanOrEqual(1);
    await nextSessionRuleId();
    expect(ids.size).greaterThanOrEqual(2);
  });
});

describe("nextSessionRuleId", () => {
  it("每次调用返回唯一递增的 id", async () => {
    const id1 = await nextSessionRuleId();
    const id2 = await nextSessionRuleId();
    const id3 = await nextSessionRuleId();

    expect(id2).toBeGreaterThan(id1);
    expect(id3).toBeGreaterThan(id2);
  });

  it("跳过已存在于 session rules 中的 id", async () => {
    const ids = await getSessionRuleIds();
    const next = await nextSessionRuleId();

    ids.add(next + 1);
    const skipped = await nextSessionRuleId();

    expect(skipped).toBeGreaterThan(next + 1);
  });
});

describe("removeSessionRuleIdEntry", () => {
  it("从追踪集合中移除指定 id", async () => {
    const ids = await getSessionRuleIds();
    const id = await nextSessionRuleId();

    ids.add(id);
    removeSessionRuleIdEntry(id);

    expect(ids.has(id)).toBe(false);
  });

  it("sessionRuleIds 未初始化时为 no-op", () => {
    expect(() => removeSessionRuleIdEntry(10404)).not.toThrow();
  });

  it("ruleId <= 10000 时抛错", () => {
    expect(() => removeSessionRuleIdEntry(10000)).toThrow();
    expect(() => removeSessionRuleIdEntry(1)).toThrow();
  });

  it("回退 SESSION_RULE_ID_BEGIN 使被移除的 id 下次被复用", async () => {
    const ids = await getSessionRuleIds();

    const id1 = await nextSessionRuleId();
    const id2 = await nextSessionRuleId();
    const id3 = await nextSessionRuleId();

    ids.add(id1);
    ids.add(id2);
    ids.add(id3);

    // 移除最新的 id，counter 回退并复用该 id
    removeSessionRuleIdEntry(id3);
    const reused = await nextSessionRuleId();
    expect(reused).toBe(id3);
  });

  it("移除的 id 在 counter 之前时仍会回退", async () => {
    const ids = await getSessionRuleIds();

    const id1 = await nextSessionRuleId();
    const id2 = await nextSessionRuleId();
    const id3 = await nextSessionRuleId();

    ids.add(id1);
    ids.add(id2);
    ids.add(id3);

    // 移除较早的 id，counter 回退到 id1 - 1，下次分配会得到 id1
    removeSessionRuleIdEntry(id1);
    const reused = await nextSessionRuleId();
    expect(reused).toBe(id1);
  });

  it("移除 counter 之后的 id 不回退 counter", async () => {
    const id1 = await nextSessionRuleId();
    const id2 = await nextSessionRuleId();
    const id3 = await nextSessionRuleId();
    const _id4 = await nextSessionRuleId();
    const id5 = await nextSessionRuleId();
    const id6 = await nextSessionRuleId();

    removeSessionRuleIdEntry(id1);
    removeSessionRuleIdEntry(id5);
    removeSessionRuleIdEntry(id3);
    // removeSessionRuleIdEntry(id4);
    removeSessionRuleIdEntry(id2);
    const nextBefore = await nextSessionRuleId(); // e.g. 10001
    removeSessionRuleIdEntry(id6);

    expect(await nextSessionRuleId()).toBe(nextBefore + 1); // counter 未变，正常递增
    expect(await nextSessionRuleId()).toBe(nextBefore + 2);
    // expect(await nextSessionRuleId()).toBe(nextBefore + 3);
    expect(await nextSessionRuleId()).toBe(nextBefore + 4);
    expect(await nextSessionRuleId()).toBe(nextBefore + 5);
  });
});

describe("nextSessionRuleId limit control", () => {
  it("达到上限时锁定，移除条目后解锁", async () => {
    const ids = await getSessionRuleIds();
    expect(ids.size).toBeLessThan(100);

    const added = [];
    for (let w = ids.size; w < LIMIT_SESSION_RULES; w++) {
      const j = await nextSessionRuleId();
      added.push(j);
      ids.add(j);
    }
    expect(ids.size).toBeGreaterThan(1000);

    const lockedPromise = nextSessionRuleId();

    const raceResult1 = await Promise.race([lockedPromise.then(() => "resolved"), sleep(5).then(() => "pending")]);
    expect(raceResult1).toBe("pending");

    // 使用固定索引而非随机，保证测试可重复
    const p1 = added[0];
    const p2 = added[6];
    removeSessionRuleIdEntry(p1);
    removeSessionRuleIdEntry(p2);

    const raceResult2 = await Promise.race([lockedPromise.then(() => "resolved"), sleep(5).then(() => "pending")]);
    expect(raceResult2).toBe("resolved");

    const id1 = await lockedPromise;
    const id2 = await nextSessionRuleId();
    expect(id1).toBe(p1);
    expect(id2).toBe(p2);

    for (const k of added) {
      removeSessionRuleIdEntry(k);
    }

    const res = await getSessionRuleIds();
    expect(res).toBe(ids);
    expect(res.size).toBeLessThan(100);
  });

  it("单次移除仅放行 1 个 waiter，其余继续等待", async () => {
    const ids = await getSessionRuleIds();
    expect(ids.size).toBeLessThan(100);

    const added = [];
    for (let w = ids.size; w < LIMIT_SESSION_RULES; w++) {
      const j = await nextSessionRuleId();
      added.push(j);
      ids.add(j);
    }
    expect(ids.size).toBeGreaterThan(1000);

    // 在已达上限时发起多个并发调用
    const p1 = nextSessionRuleId();
    const p2 = nextSessionRuleId();
    const p3 = nextSessionRuleId();

    const raceResult = await Promise.race([
      Promise.all([p1, p2, p3]).then(() => "resolved"),
      sleep(5).then(() => "pending"),
    ]);
    expect(raceResult).toBe("pending");

    // 单次释放 1 个 slot: 只应放行 1 个 waiter，剩余仍挂起
    removeSessionRuleIdEntry(added[0]);
    const firstResolved = await Promise.race([p1.then(() => "resolved"), sleep(50).then(() => "pending")]);
    expect(firstResolved).toBe("resolved");

    const remainingStillPending = await Promise.race([
      Promise.all([p2, p3]).then(() => "resolved"),
      sleep(5).then(() => "pending"),
    ]);
    expect(remainingStillPending).toBe("pending");

    // 继续释放 2 个 slot，剩余 waiter 才能继续完成
    removeSessionRuleIdEntry(added[1]);
    removeSessionRuleIdEntry(added[2]);
    const results = await Promise.race([Promise.all([p2, p3]).then((vals) => vals), sleep(50).then(() => null)]);
    expect(results).not.toBeNull();

    // 任何时候 size 都不应超过 LIMIT_SESSION_RULES
    expect(ids.size).toBeLessThanOrEqual(LIMIT_SESSION_RULES);

    for (const k of added) {
      if (ids.has(k)) removeSessionRuleIdEntry(k);
    }
    // p1/p2/p3 分配的 id 也要清理
    const allocated = [await p1, ...(results as number[])];
    for (const k of allocated) {
      if (ids.has(k)) removeSessionRuleIdEntry(k);
    }

    const res = await getSessionRuleIds();
    expect(res).toBe(ids);
    expect(res.size).toBeLessThan(100);
  });
});

import { sleep } from "@App/pkg/utils/utils";
import { describe, expect, it, vi } from "vitest";
import {
  getSessionRuleIds,
  LIMIT_SESSION_RULES,
  nextSessionRuleId,
  removeSessionRuleIdEntry,
} from "./dnr_id_controller";

describe("getSessionRuleIds", () => {
  it("initializes from existing chrome session rules", async () => {
    //@ts-ignore
    vi.mocked(chrome.declarativeNetRequest.getSessionRules).mockResolvedValueOnce([
      { id: 10901, priority: 1, action: { type: "block" }, condition: {} },
      { id: 10902, priority: 1, action: { type: "block" }, condition: {} },
    ]);

    const ids = await getSessionRuleIds();
    expect(ids).toContain(10901);
    expect(ids).toContain(10902);
  });
});

describe("nextSessionRuleId", () => {
  it("returns unique incrementing IDs on each call", async () => {
    const id1 = await nextSessionRuleId();
    const id2 = await nextSessionRuleId();
    const id3 = await nextSessionRuleId();

    expect(id2).toBeGreaterThan(id1);
    expect(id3).toBeGreaterThan(id2);
  });

  it("skips IDs that already exist in session rules", async () => {
    const ids = await getSessionRuleIds();
    const next = await nextSessionRuleId();

    ids.add(next + 1);
    const skipped = await nextSessionRuleId();

    expect(skipped).toBeGreaterThan(next + 1);
  });
});

describe("removeSessionRuleIdEntry", () => {
  it("removes the given ID from the tracked set", async () => {
    const ids = await getSessionRuleIds();
    const id = await nextSessionRuleId();

    ids.add(id);
    removeSessionRuleIdEntry(id);

    expect(ids.has(id)).toBe(false);
  });

  it("is a no-op when called before sessionRuleIds is initialized", () => {
    expect(() => removeSessionRuleIdEntry(10404)).not.toThrow();
  });

  it("throws when ruleId is <= 10000", () => {
    expect(() => removeSessionRuleIdEntry(10000)).toThrow();
    expect(() => removeSessionRuleIdEntry(1)).toThrow();
  });

  it("rewinds SESSION_RULE_ID_BEGIN so the removed id gets reused next", async () => {
    const ids = await getSessionRuleIds();

    const id1 = await nextSessionRuleId();
    const id2 = await nextSessionRuleId();
    const id3 = await nextSessionRuleId();

    ids.add(id1);
    ids.add(id2);
    ids.add(id3);

    // Remove the latest — counter should rewind and reuse it
    removeSessionRuleIdEntry(id3);
    const reused = await nextSessionRuleId();
    expect(reused).toBe(id3);
  });

  it("rewinds SESSION_RULE_ID_BEGIN when removed id is behind the counter", async () => {
    const ids = await getSessionRuleIds();

    const id1 = await nextSessionRuleId();
    const id2 = await nextSessionRuleId();
    const id3 = await nextSessionRuleId();

    ids.add(id1);
    ids.add(id2);
    ids.add(id3);

    // Remove an older id — counter rewinds to id1 - 1, so id1 gets reused
    removeSessionRuleIdEntry(id1);
    const reused = await nextSessionRuleId();
    expect(reused).toBe(id1);
  });

  it("does not rewind SESSION_RULE_ID_BEGIN when removed id was pre-existing (ahead of counter)", async () => {
    //@ts-ignore
    vi.mocked(chrome.declarativeNetRequest.getSessionRules).mockResolvedValueOnce([
      { id: 11122, priority: 1, action: { type: "block" }, condition: {} },
    ]);

    const ids = await getSessionRuleIds();
    const nextBefore = await nextSessionRuleId(); // e.g. 10001

    ids.add(11122); // ensure it's tracked
    removeSessionRuleIdEntry(11122); // 11122 > SESSION_RULE_ID_BEGIN + 1, no rewind

    const nextAfter = await nextSessionRuleId();
    expect(nextAfter).toBe(nextBefore + 1); // counter unchanged, just increments normally
  });
});

describe("nextSessionRuleId limit control", () => {
  it("locks when session rules reach the limit and unlocks when an entry is removed", async () => {
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

    const m1 = Math.floor(Math.random() * (added.length - 9));
    const p1 = added[m1];
    const p2 = added[m1 + 6];
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

  it("only one lock is created even with concurrent nextSessionRuleId calls", async () => {
    const ids = await getSessionRuleIds();
    expect(ids.size).toBeLessThan(100);

    const added = [];
    for (let w = ids.size; w < LIMIT_SESSION_RULES; w++) {
      const j = await nextSessionRuleId();
      added.push(j);
      ids.add(j);
    }
    expect(ids.size).toBeGreaterThan(1000);

    // Fire multiple concurrent calls while locked
    const p1 = nextSessionRuleId();
    const p2 = nextSessionRuleId();
    const p3 = nextSessionRuleId();

    const raceResult = await Promise.race([
      Promise.all([p1, p2, p3]).then(() => "resolved"),
      sleep(5).then(() => "pending"),
    ]);
    expect(raceResult).toBe("pending");

    // Single removal should unlock all waiters sequentially
    const toRemove = [...ids].find((id) => id > 10000)!;
    removeSessionRuleIdEntry(toRemove);

    // All three should eventually resolve
    const results = await Promise.race([Promise.all([p1, p2, p3]).then((ids) => ids), sleep(50).then(() => null)]);
    expect(results).not.toBeNull();

    for (const k of added) {
      removeSessionRuleIdEntry(k);
    }

    const res = await getSessionRuleIds();
    expect(res).toBe(ids);
    expect(res.size).toBeLessThan(100);
  });
});

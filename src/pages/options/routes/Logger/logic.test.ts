// can be tested with vitest-environment node
import { describe, it, expect } from "vitest";
import type { Logger } from "@App/app/repo/logger";
import type { LogLevel } from "@App/app/logger/core";
import {
  aggregateLabels,
  buildMonthGrid,
  countLevels,
  filterLogs,
  levelBucket,
  presetRange,
  REFRESH_INTERVAL_MS,
} from "./logic";

// 构造日志的便捷工厂
function log(partial: Partial<Logger> & { level: LogLevel }): Logger {
  return {
    id: partial.id ?? 1,
    level: partial.level,
    message: partial.message ?? "",
    label: partial.label ?? {},
    createtime: partial.createtime ?? 0,
  };
}

describe("日志级别归类 levelBucket", () => {
  it("error/warn/info/debug 各自归入同名桶", () => {
    expect(levelBucket("error")).toBe("error");
    expect(levelBucket("warn")).toBe("warn");
    expect(levelBucket("info")).toBe("info");
    expect(levelBucket("debug")).toBe("debug");
  });

  it("trace 与 none 归入 debug 桶", () => {
    expect(levelBucket("trace")).toBe("debug");
    expect(levelBucket("none")).toBe("debug");
  });
});

describe("标签聚合 aggregateLabels", () => {
  it("收集每个标签键出现过的字符串与数字取值", () => {
    const labels = aggregateLabels([
      log({ level: "info", label: { component: "GM_log", line: 42 } }),
      log({ level: "info", label: { component: "GM_xhr", line: 7 } }),
    ]);
    expect(Object.keys(labels).sort()).toEqual(["component", "line"]);
    expect(labels.component).toEqual({ GM_log: true, GM_xhr: true });
    expect(labels.line).toEqual({ "42": true, "7": true });
  });

  it("忽略数组/对象/布尔等非字符串数字取值", () => {
    const labels = aggregateLabels([
      log({ level: "info", label: { tags: ["a", "b"], ok: true, meta: { x: 1 }, name: "s" } }),
    ]);
    expect(labels.name).toEqual({ s: true });
    expect(labels.tags).toBeUndefined();
    expect(labels.ok).toBeUndefined();
    expect(labels.meta).toBeUndefined();
  });
});

describe("级别计数 countLevels", () => {
  it("按桶统计，trace 计入 debug", () => {
    const counts = countLevels([
      log({ level: "error" }),
      log({ level: "error" }),
      log({ level: "warn" }),
      log({ level: "info" }),
      log({ level: "debug" }),
      log({ level: "trace" }),
    ]);
    expect(counts).toEqual({ error: 2, warn: 1, info: 1, debug: 2 });
  });
});

describe("日志过滤 filterLogs", () => {
  const logs = [
    log({ id: 1, level: "error", message: "fetch failed 404", label: { component: "GM_xhr", line: 42 } }),
    log({ id: 2, level: "warn", message: "retry timeout", label: { component: "GM_log", line: 7 } }),
    log({ id: 3, level: "info", message: "script started", label: { component: "GM_log" } }),
  ];

  it("= 仅保留标签值相等的日志（数字与字符串按文本比较）", () => {
    expect(filterLogs(logs, { queries: [{ key: "line", condition: "=", value: "42" }] }).map((l) => l.id)).toEqual([1]);
  });

  it("!= 排除标签值相等的日志", () => {
    expect(
      filterLogs(logs, { queries: [{ key: "component", condition: "!=", value: "GM_log" }] }).map((l) => l.id)
    ).toEqual([1]);
  });

  it("=~ 保留包含子串的字符串标签值", () => {
    expect(
      filterLogs(logs, { queries: [{ key: "component", condition: "=~", value: "xhr" }] }).map((l) => l.id)
    ).toEqual([1]);
  });

  it("!~ 排除包含子串的字符串标签值（修正 v1.4 中与 =~ 等价的缺陷）", () => {
    expect(
      filterLogs(logs, { queries: [{ key: "component", condition: "!~", value: "log" }] }).map((l) => l.id)
    ).toEqual([1]);
  });

  it("空 key 的查询条件被忽略", () => {
    expect(filterLogs(logs, { queries: [{ key: "", condition: "=", value: "x" }] }).map((l) => l.id)).toEqual([
      1, 2, 3,
    ]);
  });

  it("多个条件之间为 与(AND) 关系", () => {
    expect(
      filterLogs(logs, {
        queries: [
          { key: "component", condition: "=", value: "GM_log" },
          { key: "line", condition: "=", value: "7" },
        ],
      }).map((l) => l.id)
    ).toEqual([2]);
  });

  it("messageRegex 按正则过滤消息正文", () => {
    expect(filterLogs(logs, { messageRegex: /timeout|started/ }).map((l) => l.id)).toEqual([2, 3]);
  });

  it("activeLevels 仅保留所选级别桶；为 null 时不限制", () => {
    expect(filterLogs(logs, { activeLevels: new Set(["error", "warn"]) }).map((l) => l.id)).toEqual([1, 2]);
    expect(filterLogs(logs, { activeLevels: null }).map((l) => l.id)).toEqual([1, 2, 3]);
  });
});

describe("时间预设 presetRange", () => {
  it("24h 预设返回 [now-24h, now]", () => {
    const now = 1_700_000_000_000;
    expect(presetRange("24h", now)).toEqual({ start: now - 24 * 3600 * 1000, end: now });
  });

  it("7d 预设返回 [now-7d, now]", () => {
    const now = 1_700_000_000_000;
    expect(presetRange("7d", now)).toEqual({ start: now - 7 * 86400 * 1000, end: now });
  });
});

describe("自动刷新间隔 REFRESH_INTERVAL_MS", () => {
  it("off 表示关闭(0)，其余为对应毫秒数", () => {
    expect(REFRESH_INTERVAL_MS.off).toBe(0);
    expect(REFRESH_INTERVAL_MS["5s"]).toBe(5_000);
    expect(REFRESH_INTERVAL_MS["10s"]).toBe(10_000);
    expect(REFRESH_INTERVAL_MS["30s"]).toBe(30_000);
    expect(REFRESH_INTERVAL_MS["1m"]).toBe(60_000);
    expect(REFRESH_INTERVAL_MS["5m"]).toBe(300_000);
  });
});

describe("月历网格 buildMonthGrid", () => {
  // 2026 年 6 月：6 月 1 日为周一，网格以周日开头
  const grid = buildMonthGrid(2026, 5);

  it("每一行恰好 7 天，且首列均为周日", () => {
    for (const week of grid) {
      expect(week).toHaveLength(7);
      expect(week[0].date.getDay()).toBe(0);
    }
  });

  it("首格为上月 5 月 31 日(周日)并标记为非本月，次格为本月 1 日", () => {
    expect(grid[0][0].day).toBe(31);
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid[0][1].day).toBe(1);
    expect(grid[0][1].inMonth).toBe(true);
  });

  it("本月 16 日位于第 3 行周二且属于本月", () => {
    const cell = grid[2][2];
    expect(cell.day).toBe(16);
    expect(cell.inMonth).toBe(true);
    expect(cell.date.getMonth()).toBe(5);
  });

  it("覆盖本月全部 30 天，末尾补齐为下月日期并标记为非本月", () => {
    const last = grid[grid.length - 1][6];
    expect(last.inMonth).toBe(false);
    const inMonthDays = grid
      .flat()
      .filter((c) => c.inMonth)
      .map((c) => c.day);
    expect(inMonthDays).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});

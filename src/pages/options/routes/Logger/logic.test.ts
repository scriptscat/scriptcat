import { describe, expect, it } from "vitest";
import {
  REFRESH_INTERVAL_MS,
  aggregateLabels,
  buildMonthGrid,
  countLevels,
  filterLogs,
  levelBucket,
  presetRange,
  type CalendarCell,
  type LevelBucket,
  type LogQuery,
  type TimePreset,
} from "./logic";

// 测试中只关心这些工具函数实际读取的字段，因此用最小日志结构并在调用处断言为 any。
type TestLog = {
  id?: number;
  level: string;
  message: string;
  label: Record<string, unknown>;
  createtime?: number;
};

const makeLog = (overrides: Partial<TestLog> & { level?: string } = {}): TestLog => ({
  id: 1,
  level: "info",
  message: "默认日志消息",
  label: {},
  createtime: 0,
  ...overrides,
});

const flattenGrid = (grid: CalendarCell[][]): CalendarCell[] => grid.flat();

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

describe("日志级别归类 (levelBucket)", () => {
  it.each([
    ["error", "error"],
    ["warn", "warn"],
    ["info", "info"],
    ["debug", "debug"],
    ["trace", "debug"],
    ["none", "debug"],
    ["unknown", "debug"],
  ] as const)("将 %s 归入 %s 桶", (level, expected) => {
    expect(levelBucket(level as any)).toBe(expected);
  });
});

describe("标签聚合 (aggregateLabels)", () => {
  it("只聚合字符串和数字标签值，并忽略数组/对象/布尔/null/undefined", () => {
    const logs = [
      makeLog({
        label: {
          app: "api",
          component: "GM_log",
          status: 200,
          line: 42,
          ok: true,
          meta: { env: "prod" },
          tags: ["a", "b"],
        },
      }),
      makeLog({ label: { app: "web", component: "GM_xhr", status: 500, line: 7, empty: null, missing: undefined } }),
    ];

    expect(aggregateLabels(logs as any)).toEqual({
      app: { api: true, web: true },
      component: { GM_log: true, GM_xhr: true },
      status: { "200": true, "500": true },
      line: { "42": true, "7": true },
    });
  });

  it("会去重相同标签值，且数字和字符串按同一文本键合并", () => {
    const logs = [
      makeLog({ label: { service: "billing", code: 200 } }),
      makeLog({ label: { service: "billing", code: 200 } }),
      makeLog({ label: { service: "billing", code: "200" } }),
    ];

    expect(aggregateLabels(logs as any)).toEqual({
      service: { billing: true },
      code: { "200": true },
    });
  });

  it("空日志列表返回空对象", () => {
    expect(aggregateLabels([])).toEqual({});
  });
});

describe("级别计数 (countLevels)", () => {
  it("按展示级别桶统计日志数量，trace/none 计入 debug", () => {
    const logs = [
      makeLog({ level: "error" }),
      makeLog({ level: "error" }),
      makeLog({ level: "warn" }),
      makeLog({ level: "info" }),
      makeLog({ level: "debug" }),
      makeLog({ level: "trace" }),
      makeLog({ level: "none" }),
    ];

    expect(countLevels(logs as any)).toEqual({
      error: 2,
      warn: 1,
      info: 1,
      debug: 3,
    });
  });

  it("空日志列表返回全零统计", () => {
    expect(countLevels([])).toEqual({ error: 0, warn: 0, info: 0, debug: 0 });
  });
});

describe("日志过滤 (filterLogs)", () => {
  const logs = [
    makeLog({
      id: 1,
      level: "error",
      message: "订单创建失败 fetch failed 404",
      label: { service: "order", component: "GM_xhr", region: "cn", code: 500, line: 42 },
    }),
    makeLog({
      id: 2,
      level: "warn",
      message: "支付响应变慢 retry timeout",
      label: { service: "pay", component: "GM_log", region: "cn", code: 429, line: 7 },
    }),
    makeLog({
      id: 3,
      level: "info",
      message: "订单创建成功 script started",
      label: { service: "order", component: "GM_log", region: "us", code: 200 },
    }),
    makeLog({
      id: 4,
      level: "trace",
      message: "调试链路信息",
      label: { service: "trace", component: "GM_trace", region: "cn", code: 100 },
    }),
  ];

  it("不传过滤条件时保留全部日志", () => {
    expect(filterLogs(logs as any)).toEqual(logs);
  });

  it("按激活级别桶过滤日志；activeLevels 为 null 时不限制级别", () => {
    expect(
      filterLogs(logs as any, { activeLevels: new Set<LevelBucket>(["error", "debug"]) }).map((log) => log.id)
    ).toEqual([1, 4]);
    expect(
      filterLogs(logs as any, { activeLevels: new Set<LevelBucket>(["error", "warn"]) }).map((log) => log.id)
    ).toEqual([1, 2]);
    expect(filterLogs(logs as any, { activeLevels: null })).toHaveLength(4);
  });

  it("按等于条件过滤字符串标签", () => {
    const queries: LogQuery[] = [{ key: "service", condition: "=", value: "order" }];

    expect(filterLogs(logs as any, { queries }).map((log) => log.id)).toEqual([1, 3]);
  });

  it("[=] 按等于条件过滤数字标签的字符串形式", () => {
    expect(
      filterLogs(logs as any, { queries: [{ key: "code", condition: "=", value: "500" }] }).map((log) => log.id)
    ).toEqual([1]);
    expect(
      filterLogs(logs as any, { queries: [{ key: "line", condition: "=", value: "42" }] }).map((log) => log.id)
    ).toEqual([1]);
  });

  it("[!=] 按不等于条件排除指定标签值", () => {
    expect(
      filterLogs(logs as any, { queries: [{ key: "region", condition: "!=", value: "cn" }] }).map((log) => log.id)
    ).toEqual([3]);
    expect(
      filterLogs(logs as any, { queries: [{ key: "component", condition: "!=", value: "GM_log" }] }).map(
        (log) => log.id
      )
    ).toEqual([1, 4]);
  });

  it("[=~] 按包含条件过滤字符串标签", () => {
    expect(
      filterLogs(logs as any, { queries: [{ key: "service", condition: "=~", value: "ord" }] }).map((log) => log.id)
    ).toEqual([1, 3]);
    expect(
      filterLogs(logs as any, { queries: [{ key: "component", condition: "=~", value: "xhr" }] }).map((log) => log.id)
    ).toEqual([1]);
  });

  it("[!~] 按不包含条件排除字符串标签，避免与 =~ 等价（修正 v1.4 中与 =~ 等价的缺陷）", () => {
    expect(
      filterLogs(logs as any, { queries: [{ key: "service", condition: "!~", value: "pay" }] }).map((log) => log.id)
    ).toEqual([1, 3, 4]);
    expect(
      filterLogs(logs as any, { queries: [{ key: "component", condition: "!~", value: "log" }] }).map((log) => log.id)
    ).toEqual([1, 4]);
  });

  it("空 key 的查询条件会跳过 (查询条件被忽略)", () => {
    const queries: LogQuery[] = [{ key: "", condition: "=", value: "不会生效" }];

    expect(filterLogs(logs as any, { queries })).toHaveLength(4);
  });

  it("多个标签条件：与(AND) 关系", () => {
    expect(
      filterLogs(logs as any, {
        queries: [
          { key: "service", condition: "=", value: "order" },
          { key: "region", condition: "=", value: "cn" },
        ],
      }).map((log) => log.id)
    ).toEqual([1]);

    expect(
      filterLogs(logs as any, {
        queries: [
          { key: "component", condition: "=", value: "GM_log" },
          { key: "line", condition: "=", value: "7" },
        ],
      }).map((log) => log.id)
    ).toEqual([2]);
  });

  it("按消息正文正则过滤日志 (messageRegex)", () => {
    expect(filterLogs(logs as any, { messageRegex: /创建/ }).map((log) => log.id)).toEqual([1, 3]);
    expect(filterLogs(logs as any, { messageRegex: /timeout|started/ }).map((log) => log.id)).toEqual([2, 3]);
  });

  it("同时应用级别、标签和正文过滤 (activeLevels)", () => {
    const result = filterLogs(logs as any, {
      activeLevels: new Set<LevelBucket>(["error", "info"]),
      queries: [{ key: "service", condition: "=", value: "order" }],
      messageRegex: /成功/,
    });

    expect(result.map((log) => log.id)).toEqual([3]);
  });

  it("不匹配任何日志时返回空数组", () => {
    const result = filterLogs(logs as any, {
      queries: [{ key: "service", condition: "=", value: "missing" }],
    });

    expect(result).toEqual([]);
  });
});

describe("presetRange", () => {
  const nowMs = Date.UTC(2026, 5, 19, 12, 0, 0);

  it.each([
    ["5m", 5 * 60_000],
    ["15m", 15 * 60_000],
    ["30m", 30 * 60_000],
    ["1h", 60 * 60_000],
    ["3h", 3 * 60 * 60_000],
    ["6h", 6 * 60 * 60_000],
    ["12h", 12 * 60 * 60_000],
    ["24h", 24 * 60 * 60_000],
    ["7d", 7 * 24 * 60 * 60_000],
  ] as const)("根据 %s 预设计算开始和结束时间", (preset, durationMs) => {
    expect(presetRange(preset as TimePreset, nowMs)).toEqual({
      start: nowMs - durationMs,
      end: nowMs,
    });
  });
});

describe("REFRESH_INTERVAL_MS", () => {
  it("映射全部自动刷新间隔到毫秒", () => {
    expect(REFRESH_INTERVAL_MS).toEqual({
      off: 0,
      "5s": 5_000,
      "10s": 10_000,
      "30s": 30_000,
      "1m": 60_000,
      "5m": 5 * 60_000,
    });
  });
});

describe("buildMonthGrid", () => {
  it("每一周都以周日开始并包含七天", () => {
    const grid = buildMonthGrid(2025, 7); // 2025 年 8 月

    expect(grid).toHaveLength(6);
    for (const week of grid) {
      expect(week).toHaveLength(7);
      expect(week[0].date.getDay()).toBe(0);
    }
  });

  it("当月第一天是周日时从当月第一天开始", () => {
    const grid = buildMonthGrid(2025, 5); // 2025 年 6 月 1 日是周日
    const cells = flattenGrid(grid);

    expect(formatDate(cells[0].date)).toBe("2025-06-01");
    expect(cells[0]).toMatchObject({ day: 1, inMonth: true });
    expect(formatDate(cells.at(-1)!.date)).toBe("2025-07-05");
    expect(cells.at(-1)!.inMonth).toBe(false);
  });

  it("当月第一天不是周日时补齐上月日期", () => {
    const grid = buildMonthGrid(2024, 0); // 2024 年 1 月 1 日是周一
    const cells = flattenGrid(grid);

    expect(formatDate(cells[0].date)).toBe("2023-12-31");
    expect(cells[0]).toMatchObject({ day: 31, inMonth: false });
    expect(formatDate(cells[1].date)).toBe("2024-01-01");
    expect(cells[1]).toMatchObject({ day: 1, inMonth: true });
  });

  it("会在最后一周补齐下月日期", () => {
    const grid = buildMonthGrid(2024, 0); // 2024 年 1 月
    const cells = flattenGrid(grid);

    expect(formatDate(cells.at(-1)!.date)).toBe("2024-02-03");
    expect(cells.at(-1)).toMatchObject({ day: 3, inMonth: false });
  });

  it("正确处理闰年二月", () => {
    const grid = buildMonthGrid(2024, 1); // 2024 年 2 月有 29 天
    const cells = flattenGrid(grid);
    const feb29 = cells.find((cell) => formatDate(cell.date) === "2024-02-29");

    expect(grid).toHaveLength(5);
    expect(feb29).toMatchObject({ day: 29, inMonth: true });
    expect(formatDate(cells[0].date)).toBe("2024-01-28");
    expect(formatDate(cells.at(-1)!.date)).toBe("2024-03-02");
  });

  it("正确处理非闰年二月", () => {
    const grid = buildMonthGrid(2023, 1); // 2023 年 2 月有 28 天
    const cells = flattenGrid(grid);

    expect(cells.some((cell) => formatDate(cell.date) === "2023-02-29")).toBe(false);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(28);
  });

  it("正确处理十二月跨到下一年", () => {
    const grid = buildMonthGrid(2024, 11); // 2024 年 12 月
    const cells = flattenGrid(grid);

    expect(formatDate(cells[0].date)).toBe("2024-12-01");
    expect(formatDate(cells.at(-1)!.date)).toBe("2025-01-04");
    expect(cells.at(-1)).toMatchObject({ day: 4, inMonth: false });
  });

  it("正确处理需要六周展示的月份", () => {
    const grid = buildMonthGrid(2025, 7); // 2025 年 8 月从周五开始且有 31 天
    const cells = flattenGrid(grid);

    expect(grid).toHaveLength(6);
    expect(formatDate(cells[0].date)).toBe("2025-07-27");
    expect(formatDate(cells.at(-1)!.date)).toBe("2025-09-06");
  });

  it("覆盖 2026 年 6 月的全部 30 天，并补齐前后非本月日期", () => {
    const grid = buildMonthGrid(2026, 5); // 2026 年 6 月：6 月 1 日为周一，网格以周日开头
    const inMonthDays = grid
      .flat()
      .filter((cell) => cell.inMonth)
      .map((cell) => cell.day);
    const june16 = grid[2][2];
    const last = grid[grid.length - 1][6];

    expect(grid[0][0]).toMatchObject({ day: 31, inMonth: false });
    expect(grid[0][1]).toMatchObject({ day: 1, inMonth: true });
    expect(june16.day).toBe(16);
    expect(june16.inMonth).toBe(true);
    expect(june16.date.getMonth()).toBe(5);
    expect(last.inMonth).toBe(false);
    expect(inMonthDays).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
  });
});

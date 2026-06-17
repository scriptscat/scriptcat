import dayjs from "dayjs";
import type { Logger } from "@App/app/repo/logger";
import type { LogLabel, LogLevel } from "@App/app/logger/core";

/** 标签过滤条件运算符 */
export type LogCondition = "=" | "=~" | "!=" | "!~";

/** 一条标签过滤条件：键 / 运算符 / 取值 */
export interface LogQuery {
  key: string;
  condition: LogCondition;
  value: string;
}

/** 标签聚合结果：键 -> 出现过的取值集合 */
export type LabelsMap = Record<string, Record<string, true>>;

/** 级别桶：trace/none 归入 debug */
export type LevelBucket = "error" | "warn" | "info" | "debug";

/** 将日志级别归入用于展示与筛选的级别桶 */
export function levelBucket(level: LogLevel): LevelBucket {
  switch (level) {
    case "error":
    case "warn":
    case "info":
      return level;
    default:
      // debug / trace / none 统一归入 debug 桶
      return "debug";
  }
}

/** 聚合日志标签：仅收集字符串与数字取值，供标签筛选下拉使用 */
export function aggregateLabels(logs: Logger[]): LabelsMap {
  const labels: LabelsMap = {};
  for (const log of logs) {
    for (const key of Object.keys(log.label)) {
      const value = log.label[key];
      if (typeof value === "string" || typeof value === "number") {
        if (!labels[key]) labels[key] = {};
        labels[key][`${value}`] = true;
      }
    }
  }
  return labels;
}

/** 按级别桶统计各级别日志数量 */
export function countLevels(logs: Logger[]): Record<LevelBucket, number> {
  const counts: Record<LevelBucket, number> = { error: 0, warn: 0, info: 0, debug: 0 };
  for (const log of logs) {
    counts[levelBucket(log.level)] += 1;
  }
  return counts;
}

/** 单条日志标签是否满足全部查询条件（条件之间为 与 关系） */
function matchQueries(label: LogLabel, queries: LogQuery[]): boolean {
  for (const query of queries) {
    if (!query.key) continue;
    const value = label[query.key];
    switch (query.condition) {
      case "=":
        if (`${value}` !== query.value) return false;
        break;
      case "!=":
        if (`${value}` === query.value) return false;
        break;
      case "=~":
        // 仅对字符串取值做子串匹配；非字符串视为不参与该条件
        if (typeof value === "string" && !value.includes(query.value)) return false;
        break;
      case "!~":
        if (typeof value === "string" && value.includes(query.value)) return false;
        break;
    }
  }
  return true;
}

export interface FilterOptions {
  /** 标签过滤条件 */
  queries?: LogQuery[];
  /** 消息正文正则；为空则不按正文过滤 */
  messageRegex?: RegExp | null;
  /** 仅保留这些级别桶；为 null 则不限制级别 */
  activeLevels?: Set<LevelBucket> | null;
}

/** 综合标签条件、正文正则与级别过滤日志 */
export function filterLogs(logs: Logger[], opts: FilterOptions = {}): Logger[] {
  const { queries = [], messageRegex = null, activeLevels = null } = opts;
  return logs.filter((log) => {
    if (activeLevels && !activeLevels.has(levelBucket(log.level))) return false;
    if (!matchQueries(log.label, queries)) return false;
    if (messageRegex && !messageRegex.test(log.message)) return false;
    return true;
  });
}

/** 时间快捷预设 */
export type TimePreset = "5m" | "15m" | "30m" | "1h" | "3h" | "6h" | "12h" | "24h" | "7d";

const PRESET_MS: Record<TimePreset, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 3_600_000,
  "3h": 3 * 3_600_000,
  "6h": 6 * 3_600_000,
  "12h": 12 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
};

/** 由预设与当前时间计算 [start, end]（毫秒） */
export function presetRange(preset: TimePreset, nowMs: number): { start: number; end: number } {
  return { start: nowMs - PRESET_MS[preset], end: nowMs };
}

/** 自动刷新间隔 */
export type RefreshInterval = "off" | "5s" | "10s" | "30s" | "1m" | "5m";

/** 自动刷新间隔对应的毫秒数；off 为 0（关闭） */
export const REFRESH_INTERVAL_MS: Record<RefreshInterval, number> = {
  off: 0,
  "5s": 5_000,
  "10s": 10_000,
  "30s": 30_000,
  "1m": 60_000,
  "5m": 5 * 60_000,
};

/** 月历单元格：对应日期、日号、是否属于当前展示月 */
export interface CalendarCell {
  date: Date;
  day: number;
  inMonth: boolean;
}

/** 生成某年某月（month 为 0-11）的月历网格，以周日为每行首列，整周补齐相邻月日期 */
export function buildMonthGrid(year: number, month: number): CalendarCell[][] {
  const first = dayjs(new Date(year, month, 1));
  // 回退到包含当月 1 号那一周的周日
  let cursor = first.subtract(first.day(), "day");
  const monthEnd = first.endOf("month");
  const weeks: CalendarCell[][] = [];
  while (cursor.isBefore(monthEnd)) {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: cursor.toDate(), day: cursor.date(), inMonth: cursor.month() === month });
      cursor = cursor.add(1, "day");
    }
    weeks.push(week);
  }
  return weeks;
}

import { CronTime } from "cron";
import { t } from "@App/locales/locales";

// 计算下次执行时间，支持 once 关键字表示每分钟/每小时/每天/每月/每星期执行一次
// https://github.com/kelektiv/node-cron

// ### 支持以下两个表达式
//  minute hour dayOfMonth month dayOfWeek
//  second minute hour dayOfMonth month dayOfWeek
// ### 支持以下数值
//  `*`     Asterisks:  Any value
//  `1-3,5` Ranges:     Ranges and individual values
//  `*/2`   Steps:      Every two units
//  `once`  任何时刻的单次执行

/* ### 数值范围
  field          allowed values
  -----          --------------
  second         0-59
  minute         0-59
  hour           0-23
  day of month   1-31
  month          1-12 (or names, see below)
  day of week    0-7 (0 or 7 is Sunday, or use names)
*/

// 使用 cron 内部的 DateTime<boolean> consturctor
const DateTime = new CronTime("* * * * *").sendAt().constructor;

/**
 * once 在不同 cron 位置上的含义映射
 * key 为 once 所在的 cron 位（1 ~ 5，不含秒）
 *
 * 例：
 *  - "* once * * * *"  → 每小时执行一次
 *  - "* * once * * *"  → 每天执行一次
 */
const ONCE_MAP = {
  1: { unit: "minute", format: "yyyy-MM-dd HH:mm:ss", label: "minute" },
  2: { unit: "hour", format: "yyyy-MM-dd HH:mm:ss", label: "hour" },
  3: { unit: "day", format: "yyyy-MM-dd", label: "day" },
  4: { unit: "month", format: "yyyy-MM", label: "month" },
  5: { unit: "week", format: "yyyy-MM-dd", label: "week" },
} as const;

type NextTimeResult = {
  /** 下一次触发时间（已格式化） */
  next: string;
  /** once 类型，用于国际化展示 */
  once: string;
};

/**
 * 对外展示用：
 * - 如果是 once cron，返回类似“下次在 xx 执行一次”
 * - 否则直接返回下一次执行时间
 */
export const nextTimeDisplay = (crontab: string, date = new Date()): string => {
  const res = nextTimeInfo(crontab, date);
  if (res.once) {
    return t(`cron_oncetype.${res.once}`, { next: res.next });
  } else {
    return res.next;
  }
};

export const extraCronExpr = (
  crontab: string
): {
  oncePos: number;
  cronExpr: string;
} => {
  const parts = crontab.trim().split(" ");
  /**
   * 兼容 5 位 / 6 位 cron：
   * - 5 位：分 时 日 月 周
   * - 6 位：秒 分 时 日 月 周
   */
  const lenOffset = parts.length === 5 ? 1 : 0;

  // 非法长度直接判错
  if (parts.length + lenOffset !== 6) {
    throw new Error(t("cron_invalid_expr"));
  }

  let oncePos = -1;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith("once")) {
      oncePos = i + lenOffset; // once 在 6 位 cron 中的实际位置 （5 位 cron 需要整体向后偏移一位）
      parts[i] = part.slice(5, -1) || "*";
      break;
    }
  }
  return { cronExpr: parts.join(" "), oncePos };
};

/**
 * 解析 cron 表达式，计算下一次执行时间
 * 支持自定义 once 关键字（表示“在某个周期内只执行一次”）
 */
export const nextTimeInfo = (crontab: string, date = new Date()): NextTimeResult => {
  const { cronExpr, oncePos } = extraCronExpr(crontab);

  let cron: CronTime;
  try {
    // 将 once 替换，用于标准 cron 解析
    cron = new CronTime(cronExpr);
  } catch {
    /**
     * 不支持多个 once
     * 例如："* once once * *"
     */
    throw new Error(t("cron_invalid_expr"));
  }

  let luxonDate = (DateTime as any).fromJSDate(date);
  let format = "yyyy-MM-dd HH:mm:ss";
  let onceLabel = "";

  /**
   * 如果存在 once：
   * 核心思路：
   * 👉 直接跳到「下一个周期的起始时间」
   * 👉 再从该时间点开始计算 cron 的下一次命中
   */
  if (oncePos >= 1 && oncePos <= 5) {
    const cfg = ONCE_MAP[oncePos as keyof typeof ONCE_MAP];
    onceLabel = cfg.label;
    format = cfg.format;

    /**
     * 例如：
     * 当前时间：2026-01-02 10:23
     * once 在 hour 位
     *
     * → 先跳到 11:00:00
     */
    luxonDate = luxonDate.plus({ [cfg.unit]: 1 }).startOf(cfg.unit as any);

    /**
     * 再减去 1ms：
     * 这样 getNextDateFrom 才能
     * 命中「正好等于周期起点」的 cron
     */
    luxonDate = luxonDate.minus({ milliseconds: 1 });
  }

  const next = cron.getNextDateFrom(luxonDate);

  return {
    next: next.toFormat(format),
    once: onceLabel,
  };
};

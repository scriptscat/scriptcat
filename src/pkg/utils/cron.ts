import { CronTime } from "cron";
import { t } from "@App/locales/locales";

// ===================================== Cron 工具库说明 =====================================
//
// 本模块用于解析 cron 表达式并计算下一次执行时间，
// 在标准 cron 语法基础上扩展支持 `once` 关键字。
//
// 参考文档：
//   https://github.com/kelektiv/node-cron
//   https://docs.scriptcat.org/docs/dev/background/#%E5%AE%9A%E6%97%B6%E8%84%9A%E6%9C%AC
//
// 在线工具测试 cron 表达式：
//   https://crontab.guru/ (英文，标准5位格式)
//   https://tool.lu/crontab/ (中文，标准5位及扩展6位格式)
//
// ────────────────────────────────── Cron 表达式格式 ──────────────────────────────────
//
// 支持以下两种 cron 表达式：
// - 标准 5 位格式：分 时 日 月 周
// - 扩展 6 位格式：秒 分 时 日 月 周
//
// 注：6位扩展格式会使脚本每秒执行，浏览器JavaScript环境无法精准每秒执行，而且对CPU负担大，并不推荐
//
// ────────────────────────────────── 字段取值规则 ──────────────────────────────────
//
// 支持以下取值写法：
// - `*`        ：任意值
// - `1-3,5`    ：范围或离散值
// - `*/2`      ：步长（每隔 N 个单位）
// - `once`
// - `once(*)`
// - `once(...)`：
//   表示在某个周期内仅执行一次（ScriptCat 扩展语法）
//
// ────────────────────────────────── 字段取值范围 ──────────────────────────────────
//
// 字段   | 允许值
// ------ | ------------------------------------------
// 秒     | 0 - 59
// 分     | 0 - 59
// 时     | 0 - 23
// 日     | 1 - 31
// 月     | 1 - 12（或英文月份名，详见 cron 文档）
// 周     | 0 - 7（0 或 7 表示星期日，也可使用英文名称）
//
// ============================================================================================

// 使用 cron 内部的 DateTime<boolean> 构造函数
// 等价于：import { DateTime } from "luxon"
const DateTime = new CronTime("* * * * *").sendAt().constructor;
type LuxonDate = ReturnType<CronTime["sendAt"]>[0];

/**
 * once 在不同 cron 位置上的语义映射表。
 *
 * key 表示 once 所在的 cron 位（1 ~ 5，忽略秒位）。
 *
 * 示例：
 * - "* once * * *"  → 每小时执行一次
 * - "* * once * *"  → 每天执行一次
 */
const ONCE_MAP = {
  1: { unit: "minute", format: "yyyy-MM-dd HH:mm:ss", label: "minute" },
  2: { unit: "hour", format: "yyyy-MM-dd HH:mm:ss", label: "hour" },
  3: { unit: "day", format: "yyyy-MM-dd", label: "day" },
  4: { unit: "month", format: "yyyy-MM", label: "month" },
  5: { unit: "week", format: "yyyy-MM-dd", label: "week" },
} as const;

type NextTimeResult = {
  /** 下一次触发时间 */
  next: LuxonDate;
  /** 时间格式 */
  format: string;
  /** once 类型标识，用于国际化展示 */
  once: string;
};

/**
 * 对外展示用方法。
 *
 * - 若为 once cron，返回「下次在 xx 执行一次」的国际化文案
 * - 否则直接返回下一次执行时间字符串
 */
export const nextTimeDisplay = (crontab: string, date = new Date()): string => {
  const res = nextTimeInfo(crontab, date);
  const nextTimeFormatted = res.next.toFormat(res.format);
  return res.once ? t(`cron_oncetype.${res.once}`, { next: nextTimeFormatted }) : nextTimeFormatted;
};

/**
 * 解析 cron 表达式，提取 once 信息并转换为标准 cron 表达式。
 *
 * @returns
 * - oncePos ：once 在 6 位 cron 表达式中的实际位置（不存在则为 -1）
 * - cronExpr：用于标准 cron 解析的表达式
 */
export const extractCronExpr = (
  crontab: string
): {
  oncePos: number;
  cronExpr: string;
} => {
  const parts = crontab.trim().split(" ");

  /**
   * 兼容 5 位 / 6 位 cron 表达式：
   * - 5 位：分 时 日 月 周
   * - 6 位：秒 分 时 日 月 周
   */
  const lenOffset = parts.length === 5 ? 1 : 0;

  // 长度不合法，直接判定为非法表达式
  if (parts.length + lenOffset !== 6) {
    throw new Error(t("cron_invalid_expr"));
  }

  let oncePos = -1;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith("once")) {
      // once 在 6 位 cron 中的真实位置
      // 5 位 cron 需要整体向后偏移一位
      oncePos = i + lenOffset;
      parts[i] = part.slice(5, -1) || "*";
      break;
    }
  }

  return { cronExpr: parts.join(" "), oncePos };
};

/**
 * 解析 cron 表达式并计算下一次执行时间。
 *
 * 支持自定义 once 关键字，用于表示在对应周期内仅执行一次：
 * - minute：每分钟一次
 * - hour  ：每小时一次
 * - day   ：每天一次
 * - month ：每月一次
 * - week  ：每周一次
 */
export const nextTimeInfo = (crontab: string, date = new Date()): NextTimeResult => {
  const { cronExpr, oncePos } = extractCronExpr(crontab);

  let cron: CronTime;
  try {
    // 使用标准 cron 表达式进行解析
    cron = new CronTime(cronExpr);
  } catch {
    /**
     * 不支持多个 once
     * 示例："* once once * *"
     */
    throw new Error(t("cron_invalid_expr"));
  }

  let luxonDate = (DateTime as any).fromJSDate(date) as LuxonDate;
  let format = "yyyy-MM-dd HH:mm:ss";
  let onceLabel = "";

  /**
   * 若存在 once：
   *
   * 处理思路：
   * 1. 先跳转到下一个周期的起始时间
   * 2. 再从该时间点开始计算 cron 的下一次命中
   */
  if (oncePos >= 1 && oncePos <= 5) {
    const cfg = ONCE_MAP[oncePos as keyof typeof ONCE_MAP];
    onceLabel = cfg.label;
    format = cfg.format;

    /**
     * 示例：
     * 当前时间：2026-01-02 10:23
     * once 位于 hour
     *
     * → 跳转到 11:00:00
     */
    luxonDate = luxonDate.plus({ [cfg.unit]: 1 }).startOf(cfg.unit as any);

    /**
     * 再回退 1 毫秒，
     * 以确保 getNextDateFrom 能命中
     * 「等于周期起点」的 cron 时间
     */
    luxonDate = luxonDate.minus({ milliseconds: 1 });
  }

  const next = cron.getNextDateFrom(luxonDate);

  return {
    next: next,
    format: format,
    once: onceLabel,
  };
};

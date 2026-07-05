import { CronJob, CronTime, type CronJobParams } from "cron";
import { t } from "@App/locales/locales";
export { type CronJob, type CronTime };

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

/**
 * 获取指定日期在当前运行环境中的本地 UTC offset，单位为分钟。
 *
 * 注意：
 * JavaScript Date#getTimezoneOffset() 的符号方向和 UTC offset 相反。
 *
 * 例如：
 * - UTC+8: Date#getTimezoneOffset() 返回 -480，这里转换成 480
 * - UTC+9: Date#getTimezoneOffset() 返回 -540，这里转换成 540
 * - UTC-6: Date#getTimezoneOffset() 返回 360，这里转换成 -360
 */
export const getLocalUtcOffset = (date = new Date()) => {
  return -date.getTimezoneOffset();
};

/**
 * 将 UTC offset 分钟数转换成 Luxon 可识别的 fixed offset zone 字符串。
 *
 * 例如：
 * - 480  -> UTC+08:00
 * - 540  -> UTC+09:00
 * - 180  -> UTC+03:00
 * - -360 -> UTC-06:00
 *
 * 这里返回的不是 IANA timezone。
 * 它不是 Asia/Tokyo、Asia/Shanghai、Asia/Amman 这种地区时区名称，
 * 而是一个固定 UTC 偏移量。
 */
export const toUtcOffsetZone = (utcOffset: number) => {
  const sign = utcOffset < 0 ? "-" : "+";

  const offsetHours = Math.trunc(utcOffset / 60);
  const offsetHoursStr = String(Math.abs(offsetHours)).padStart(2, "0");

  const offsetMinutes = Math.abs(utcOffset - offsetHours * 60);
  const offsetMinutesStr = String(offsetMinutes).padStart(2, "0");

  return `UTC${sign}${offsetHoursStr}:${offsetMinutesStr}`;
};

/**
 * 独立成 getLuxonDate 用于 debug。
 *
 * 目标：
 * - 不直接 import luxon
 * - 不使用 IANA timezone
 * - 不让 CronTime constructor 在未指定 timeZone / utcOffset 时，
 *   内部调用 Intl.DateTimeFormat().resolvedOptions().timeZone
 *   进行自动侦测
 *
 * 做法：
 * - 使用当前运行环境的本地 UTC offset
 * - 将 offset 转成 fixed offset zone 字符串，例如 UTC+08:00
 * - CronTime constructor 和 getNextDateFrom 都显式传入这个 fixed offset zone
 *
 * 注意：
 * fixed offset zone 是固定偏移量，不会自动跟随 DST / 夏令时变化。
 */
export const getLuxonDate = (startDateStr: string, cronTimeStr: string) => {
  const startDate = new Date(startDateStr);

  /**
   * 用 startDate 计算 offset，而不是直接用当前时间。
   *
   * 如果运行环境所在地区有 DST / 夏令时，
   * startDate 对应日期的 offset 可能和当前日期不同。
   */
  const utcOffset = getLocalUtcOffset(startDate);
  const utcOffsetZone = toUtcOffsetZone(utcOffset);

  /**
   * 这里显式传入 fixed offset zone。
   *
   * 因为 timeZone 参数已经有值，所以 CronTime constructor 不会调用：
   * Intl.DateTimeFormat().resolvedOptions().timeZone
   */
  const cronTime = new CronTime(cronTimeStr, utcOffsetZone, null);

  return cronTime.getNextDateFrom(startDate, utcOffsetZone);
};

/**
 * 创建 CronJob。
 *
 * 当调用方没有显式指定 timeZone 或 utcOffset 时，
 * 自动使用当前运行环境的 fixed offset zone。
 *
 * 这样可以避免 cron 内部通过：
 *
 *   Intl.DateTimeFormat().resolvedOptions().timeZone
 *
 * 自动侦测 IANA timezone。
 *
 * 在某些运行环境中，自动侦测出来的 timezone 可能是无效值，
 * 例如 Etc/Unknown，从而导致 CronTime#sendAt() 抛出：
 *
 *   ERROR: You specified an invalid date.
 *
 * 注意：
 * - 这里使用的是 fixed offset zone，例如 UTC+08:00
 * - 它不是 IANA timezone
 * - 它是固定偏移量，不会自动跟随 DST / 夏令时变化
 * - 如果调用方已经传入 timeZone 或 utcOffset，则尊重调用方设置
 */
export const createCronJob = (params: CronJobParams<null, null>) => {
  /**
   * cron 内部也是用 nullish 语义判断。
   *
   * 所以这里不要只判断 undefined。
   * null 和 undefined 都应该视为“没有显式指定”。
   */
  if (params.utcOffset == null && params.timeZone == null) {
    const utcOffset = getLocalUtcOffset();
    const utcOffsetZone = toUtcOffsetZone(utcOffset);

    /**
     * 不直接修改传入的 params，避免产生副作用。
     *
     * 这里显式设置 timeZone 为 fixed offset zone。
     * 因为 timeZone 已经有值，cron 不会再走内部 timezone 自动侦测。
     *
     * 另外，CronJobParams 的类型定义里 timeZone 和 utcOffset 是互斥的。
     * 所以这里需要把原来的 timeZone / utcOffset 字段解构掉，
     * 再重新组装成只包含 timeZone (utcOffsetZone) 的参数对象。
     */
    const { timeZone: _timeZone, utcOffset: _utcOffset, ...restParams } = params;

    params = {
      ...restParams,
      timeZone: utcOffsetZone,
    };
  }

  return CronJob.from(params);
};

// 使用 cron 内部的 DateTime<boolean> 构造函数
// 等价于：import { DateTime } from "luxon"
// 固定为 '2024-04-04T04:44:44Z' 和 '30 0 * * 5' 避免runtime环境导致错误
const DateTime = getLuxonDate("2024-04-04T04:44:44Z", "30 0 * * 5").constructor;
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
 * - 若表达式无效，返回本地化的错误提示文案
 * - 否则直接返回下一次执行时间字符串
 */
export const nextTimeDisplay = (crontab: string, date = new Date()): string => {
  try {
    const res = nextTimeInfo(crontab, date);
    const nextTimeFormatted = res.next.toFormat(res.format);
    return res.once ? t(`script:cron_oncetype.${res.once}`, { next: nextTimeFormatted }) : nextTimeFormatted;
  } catch (e) {
    console.error(`nextTimeDisplay: Invalid cron expression "${crontab}"`, e);
    return t("script:cron_invalid_expr");
  }
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
    throw new Error(t("script:cron_invalid_expr"));
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
  const utcOffset = getLocalUtcOffset(date);
  const utcOffsetZone = toUtcOffsetZone(utcOffset);

  let cron: CronTime;
  try {
    // 使用标准 cron 表达式进行解析
    cron = new CronTime(cronExpr, utcOffsetZone, null);
  } catch {
    /**
     * 不支持多个 once
     * 示例："* once once * *"
     */
    throw new Error(t("script:cron_invalid_expr"));
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

  const next = cron.getNextDateFrom(luxonDate, utcOffsetZone);

  return {
    next: next,
    format: format,
    once: onceLabel,
  };
};

// 复用仓库既有的 cron 解析工具，给出「下次运行」预览、合法性与可排序的时间戳。
export const nextRunText = (crontab: string): { text: string; valid: boolean; at: number | null } => {
  if (!crontab.trim()) return { text: "", valid: false, at: null };
  try {
    const info = nextTimeInfo(crontab); // 非法表达式会抛错
    return { text: nextTimeDisplay(crontab), valid: true, at: info.next.toMillis() };
  } catch {
    return { text: "", valid: false, at: null };
  }
};

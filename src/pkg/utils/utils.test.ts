import { checkSilenceUpdate } from "./utils";
import { ltever } from "./semver";
import { nextTimeDisplay, nextTimeInfo } from "./cron";

const assertNextTimeInfo = (expr: string, date: Date, expected: any) => {
  const actual = nextTimeInfo(expr, date);
  const result = {
    next: actual.next.toFormat(actual.format),
    once: actual.once,
  };

  try {
    expect(result).toEqual(expected);
  } catch (err) {
    // 1) 失败时讯息包含 expr / expected / actual
    // 2) 用 soft，方便一次看到多笔失败（可选）
    throw new Error(
      [
        "",
        `expr: ${expr}`,
        `date: ${date.toISOString()}`,
        `expected: ${JSON.stringify(expected)}`,
        `actual:   ${JSON.stringify(result)}`,
        "",
      ].join("\n")
    );
  }
};

describe("nextTimeDisplay ERROR SAFE", () => {
  it.concurrent.each([
    ["* * * once * once"],
    ["* * once * once"],
    ["* once(2,4) once(4-5) * *"],
    ["* * 1 A *"],
    ["* once 1.2 * *"],
    ["* 3 1**2 * *"],
    ["* 1^2 F * *"],
    ["1 1 * *"],
    ["* 3"],
  ])("错误Cron表达式: %s", (expr) => {
    // 确保无效表达式不会抛出异常
    expect(() => nextTimeDisplay(expr)).not.toThrow();
  });
});

describe("nextTimeInfo1", () => {
  const date = new Date("2025-12-17T11:47:17.629"); // 2025-12-17 11:47:17.629 (本地时区)

  // 让程序先执行一下，避免超时问题
  beforeAll(() => {
    nextTimeDisplay("* * * * *");
  });

  it.concurrent.each([
    ["* * * * * *", { next: "2025-12-17 11:47:18", once: "" }],
    ["* * * * *", { next: "2025-12-17 11:48:00", once: "" }],
    ["* 1-3,5 * * *", { next: "2025-12-18 01:00:00", once: "" }],
    ["* 3-8/2 * * *", { next: "2025-12-18 03:00:00", once: "" }],
  ])("标准Cron表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["once * * * *", { next: "2025-12-17 11:48:00", once: "minute" }],
    ["* once * * *", { next: "2025-12-17 12:00:00", once: "hour" }],
    ["* * once * *", { next: "2025-12-18", once: "day" }],
    ["* * * once *", { next: "2026-01", once: "month" }],
    ["* * * * once", { next: "2025-12-22", once: "week" }],

    ["once(*) * * * *", { next: "2025-12-17 11:48:00", once: "minute" }],
    ["* once(*) * * *", { next: "2025-12-17 12:00:00", once: "hour" }],
    ["* * once(*) * *", { next: "2025-12-18", once: "day" }],
    ["* * * once(*) *", { next: "2026-01", once: "month" }],
    ["* * * * once(*)", { next: "2025-12-22", once: "week" }],

    ["once(5-7) * * * *", { next: "2025-12-17 12:05:00", once: "minute" }],
    ["* once(5-7) * * *", { next: "2025-12-18 05:00:00", once: "hour" }],
    ["* * once(5-7) * *", { next: "2026-01-05", once: "day" }],
    ["* * * once(5-7) *", { next: "2026-05", once: "month" }],
    ["* * * * once(5-7)", { next: "2025-12-26", once: "week" }],
  ])("once表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["once * * * *", { next: "2025-12-17 11:48:00", once: "minute" }],
    ["* once * * * *", { next: "2025-12-17 11:48:00", once: "minute" }],
    ["45 once * * * *", { next: "2025-12-17 11:48:45", once: "minute" }],
    ["once 1-3,5 * * *", { next: "2025-12-18 01:00:00", once: "minute" }],
    ["once 3-8/2 * * *", { next: "2025-12-18 03:00:00", once: "minute" }],
  ])("每分钟一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["* once * * *", { next: "2025-12-17 12:00:00", once: "hour" }],
    ["* * once * * *", { next: "2025-12-17 12:00:00", once: "hour" }],
    ["10 once * * *", { next: "2025-12-17 12:10:00", once: "hour" }],
    ["* 10 once * * *", { next: "2025-12-17 12:10:00", once: "hour" }],
    ["45 10 once * * *", { next: "2025-12-17 12:10:45", once: "hour" }],
    ["1-3,5 once * * *", { next: "2025-12-17 12:01:00", once: "hour" }],
    ["3-8/2 once * * *", { next: "2025-12-17 12:03:00", once: "hour" }],
  ])("每小时一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["* * once * *", { next: "2025-12-18", once: "day" }],
    ["* * * once * *", { next: "2025-12-18", once: "day" }],
    ["45 * * once * *", { next: "2025-12-18", once: "day" }],
    ["33,44 */7 * once * *", { next: "2025-12-18", once: "day" }],
    ["* * once * 3,6", { next: "2025-12-20", once: "day" }],
  ])("每天一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["* * * once *", { next: "2026-01", once: "month" }],
    ["* * * * once *", { next: "2026-01", once: "month" }],
    ["45 * * * once *", { next: "2026-01", once: "month" }],
    ["33,44 */7 * * once *", { next: "2026-01", once: "month" }],
    ["* * * once 3,6", { next: "2026-01", once: "month" }],
  ])("每月一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["* * * * once", { next: "2025-12-22", once: "week" }],
    ["* * * * * once", { next: "2025-12-22", once: "week" }],
    ["45 * * * * once", { next: "2025-12-22", once: "week" }],
    ["33,44 */7 * * * once", { next: "2025-12-22", once: "week" }],
    ["* * 5 * once", { next: "2026-01-05", once: "week" }],
  ])("每星期一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });
});

describe("nextTimeInfo2", () => {
  const date = new Date("2025-12-31T23:59:59.999"); // 2025-12-31 23:59:59.999（本地时区）

  // 让程序先执行一下，避免超时问题
  beforeAll(() => {
    nextTimeDisplay("* * * * *");
  });

  it.concurrent.each([
    ["* * * * * *", { next: "2026-01-01 00:00:00", once: "" }],
    ["* * * * *", { next: "2026-01-01 00:00:00", once: "" }],
  ])("标准 Cron 表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["once * * * *", { next: "2026-01-01 00:00:00", once: "minute" }],
    ["* once * * * *", { next: "2026-01-01 00:00:00", once: "minute" }],
    ["45 once * * * *", { next: "2026-01-01 00:00:45", once: "minute" }],
  ])("每分钟一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["* once * * *", { next: "2026-01-01 00:00:00", once: "hour" }],
    ["* * once * * *", { next: "2026-01-01 00:00:00", once: "hour" }],
    ["10 once * * *", { next: "2026-01-01 00:10:00", once: "hour" }],
    ["* 10 once * * *", { next: "2026-01-01 00:10:00", once: "hour" }],
    ["45 10 once * * *", { next: "2026-01-01 00:10:45", once: "hour" }],
  ])("每小时一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["* * once * *", { next: "2026-01-01", once: "day" }],
    ["* * * once * *", { next: "2026-01-01", once: "day" }],
    ["45 * * once * *", { next: "2026-01-01", once: "day" }],
  ])("每天一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["* * * once *", { next: "2026-01", once: "month" }],
    ["* * * * once *", { next: "2026-01", once: "month" }],
    ["45 * * * once *", { next: "2026-01", once: "month" }],
  ])("每月一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });

  it.concurrent.each([
    ["* * * * once", { next: "2026-01-05", once: "week" }],
    ["* * * * * once", { next: "2026-01-05", once: "week" }],
    ["45 * * * * once", { next: "2026-01-05", once: "week" }],
  ])("每星期一次表达式: %s", (expr, expected) => {
    assertNextTimeInfo(expr, date, expected);
  });
});

describe("ltever", () => {
  it("semver", () => {
    expect(ltever("1.0.0", "1.0.1")).toBe(true);
    expect(ltever("1.0.0", "1.0.0")).toBe(true);
    expect(ltever("1.0.1", "1.0.0")).toBe(false);
  });
  it("any", () => {
    expect(ltever("1.2.3.4", "1.2.3.4")).toBe(true);
    expect(ltever("1.2.3.4", "1.2.3.5")).toBe(true);
    expect(ltever("1.2.3.4", "1.2.3.3")).toBe(false);
  });
});

describe("checkSilenceUpdate", () => {
  it("true", () => {
    expect(
      checkSilenceUpdate(
        {
          connect: ["www.baidu.com"],
        },
        {
          connect: ["www.baidu.com"],
        }
      )
    ).toBe(true);
    expect(
      checkSilenceUpdate(
        {
          connect: ["www.baidu.com", "scriptcat.org"],
        },
        {
          connect: ["scriptcat.org"],
        }
      )
    ).toBe(true);
  });
  it("false", () => {
    expect(
      checkSilenceUpdate(
        {
          connect: ["www.baidu.com"],
        },
        {
          connect: ["www.google.com"],
        }
      )
    ).toBe(false);
    expect(
      checkSilenceUpdate(
        {
          connect: ["www.baidu.com"],
        },
        {
          connect: ["www.baidu.com", "scriptcat.org"],
        }
      )
    ).toBe(false);
  });
});
import { describe, test, expect, it } from "vitest";
import { checkSilenceUpdate } from "./utils";
import { ltever } from "@App/pkg/utils/semver";
import { nextTime } from "./cron";
import { add, format } from "date-fns";

describe("nextTime", () => {
  const date = new Date(1737275107000);
  test("每分钟表达式", () => {
    expect(nextTime("* * * * *", date)).toEqual(`${format(add(date, { minutes: 1 }), "yyyy-MM-dd HH:mm:00")}`);
  });
  test("每分钟一次表达式", () => {
    expect(nextTime("once * * * *", date)).toEqual(
      `${format(add(date, { minutes: 1 }), "yyyy-MM-dd HH:mm")} 每分钟运行一次`
    );
  });
  test("每小时一次表达式", () => {
    expect(nextTime("* once * * *", date)).toEqual(
      `${format(add(date, { hours: 1 }), "yyyy-MM-dd HH")} 每小时运行一次`
    );
  });
  test("每天一次表达式", () => {
    expect(nextTime("* * once * *", date)).toEqual(`${format(add(date, { days: 1 }), "yyyy-MM-dd")} 每天运行一次`);
  });
  test("每月一次表达式", () => {
    expect(nextTime("* * * once *", date)).toEqual(`${format(add(date, { months: 1 }), "yyyy-MM")} 每月运行一次`);
  });
  test("每星期一次表达式", () => {
    expect(nextTime("* * * * once", date)).toEqual(`${format(add(date, { weeks: 1 }), "yyyy-MM-dd")} 每星期运行一次`);
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

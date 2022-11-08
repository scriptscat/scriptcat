import { formatTime, nextTime, ltever, checkSilenceUpdate } from "./utils";
import dayjs from "dayjs";
describe("nextTime", () => {
  test("每分钟表达式", () => {
    expect(nextTime("* * * * *")).toEqual(
      dayjs(new Date()).add(1, "minute").format("YYYY-MM-DD HH:mm:00")
    );
  });
  test("每分钟一次表达式", () => {
    expect(nextTime("once * * * *")).toEqual(
      dayjs(new Date())
        .add(1, "minute")
        .format("YYYY-MM-DD HH:mm 每分钟运行一次")
    );
  });
  test("每小时一次表达式", () => {
    expect(nextTime("* once * * *")).toEqual(
      dayjs(new Date()).add(1, "hour").format("YYYY-MM-DD HH 每小时运行一次")
    );
  });
  test("每天一次表达式", () => {
    expect(nextTime("* * once * *")).toEqual(
      dayjs(new Date()).add(1, "day").format("YYYY-MM-DD 每天运行一次")
    );
  });
  test("每月一次表达式", () => {
    expect(nextTime("* * * once *")).toEqual(
      dayjs(new Date()).add(1, "month").format("YYYY-MM 每月运行一次")
    );
  });
  test("每星期一次表达式", () => {
    expect(nextTime("* * * * once")).toEqual(
      dayjs(new Date()).add(1, "week").format("YYYY-MM-DD 每星期运行一次")
    );
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

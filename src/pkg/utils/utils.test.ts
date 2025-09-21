import { describe, test, expect, it } from "vitest";
import { checkSilenceUpdate } from "./utils";
import { ltever, versionCompare } from "@App/pkg/utils/semver";
import { nextTime } from "./cron";
import dayjs from "dayjs";

describe("nextTime", () => {
  const date = new Date(1737275107000);
  test("每分钟表达式", () => {
    expect(nextTime("* * * * *", date)).toEqual(dayjs(date).add(1, "minute").format("YYYY-MM-DD HH:mm:00"));
  });
  test("每分钟一次表达式", () => {
    expect(nextTime("once * * * *", date)).toEqual(
      dayjs(date).add(1, "minute").format("YYYY-MM-DD HH:mm 每分钟运行一次")
    );
  });
  test("每小时一次表达式", () => {
    expect(nextTime("* once * * *", date)).toEqual(dayjs(date).add(1, "hour").format("YYYY-MM-DD HH 每小时运行一次"));
  });
  test("每天一次表达式", () => {
    expect(nextTime("* * once * *", date)).toEqual(dayjs(date).add(1, "day").format("YYYY-MM-DD 每天运行一次"));
  });
  test("每月一次表达式", () => {
    expect(nextTime("* * * once *", date)).toEqual(dayjs(date).add(1, "month").format("YYYY-MM 每月运行一次"));
  });
  test("每星期一次表达式", () => {
    expect(nextTime("* * * * once", date)).toEqual(dayjs(date).add(1, "week").format("YYYY-MM-DD 每星期运行一次"));
  });
});

describe("ltever", () => {
  it("semver", () => {
    expect(ltever("1.0.0", "1.0.1")).toBe(true);
    expect(ltever("1.0.0", "1.0.0")).toBe(true);
    expect(ltever("1.0.1", "1.0.0")).toBe(false);
    expect(ltever("3.2.01", "3.2.1")).toBe(true); // equal
    expect(ltever("3.2.1", "3.2.01")).toBe(true); // equal
  });
  it("any", () => {
    expect(ltever("1.2.3.4", "1.2.3.4")).toBe(true);
    expect(ltever("1.2.3.4", "1.2.3.5")).toBe(true);
    expect(ltever("1.2.3.4", "1.2.3.3")).toBe(false);
  });
});

describe("versionCompare", () => {
  const twoWayTest = (a: string, b: string, c: number) => versionCompare(a, b) === c && versionCompare(b, a) === -c;
  it("test", () => {
    // 整数版本号
    expect(twoWayTest("0", "1", -1)).toBe(true);
    expect(twoWayTest("1", "3", -1)).toBe(true);
    expect(twoWayTest("3", "2", 1)).toBe(true);
    expect(twoWayTest("2", "16", -1)).toBe(true);
    expect(twoWayTest("16", "19", -1)).toBe(true);
    expect(twoWayTest("19", "20", -1)).toBe(true);

    // 日期版本号
    expect(twoWayTest("2022.10.01", "2022.10.03", -1)).toBe(true);
    expect(twoWayTest("2022.10.03", "2022.10.02", 1)).toBe(true);
    expect(twoWayTest("2022.10.02", "2022.09.22", 1)).toBe(true);
    expect(twoWayTest("2022.09.22", "2022.09.02", 1)).toBe(true);
    expect(twoWayTest("2022.09.02", "2022.09.11", -1)).toBe(true);

    // 日期版本号
    expect(twoWayTest("2022.10.1", "2022.10.3", -1)).toBe(true);
    expect(twoWayTest("2022.10.3", "2022.10.2", 1)).toBe(true);
    expect(twoWayTest("2022.10.2", "2022.9.22", 1)).toBe(true);
    expect(twoWayTest("2022.9.22", "2022.9.2", 1)).toBe(true);
    expect(twoWayTest("2022.9.2", "2022.9.11", -1)).toBe(true);

    // 日期版本号
    expect(twoWayTest("2022-10-01", "2022-10-03", -1)).toBe(true);
    expect(twoWayTest("2022-10-03", "2022-10-02", 1)).toBe(true);
    expect(twoWayTest("2022-10-02", "2022-09-22", 1)).toBe(true);
    expect(twoWayTest("2022-09-22", "2022-09-02", 1)).toBe(true);
    expect(twoWayTest("2022-09-02", "2022-09-11", -1)).toBe(true);

    // 日期版本号
    expect(twoWayTest("2022-10-1", "2022-10-3", -1)).toBe(true);
    expect(twoWayTest("2022-10-3", "2022-10-2", 1)).toBe(true);
    expect(twoWayTest("2022-10-2", "2022-9-22", 1)).toBe(true);
    expect(twoWayTest("2022-9-22", "2022-9-2", 1)).toBe(true);
    expect(twoWayTest("2022-9-2", "2022-9-11", -1)).toBe(true);

    // 日期版本号
    expect(twoWayTest("2022/10/01", "2022/10/03", -1)).toBe(true);
    expect(twoWayTest("2022/10/03", "2022/10/02", 1)).toBe(true);
    expect(twoWayTest("2022/10/02", "2022/09/22", 1)).toBe(true);
    expect(twoWayTest("2022/09/22", "2022/09/02", 1)).toBe(true);
    expect(twoWayTest("2022/09/02", "2022/09/11", -1)).toBe(true);

    // 日期版本号
    expect(twoWayTest("2022/10/1", "2022/10/3", -1)).toBe(true);
    expect(twoWayTest("2022/10/3", "2022/10/2", 1)).toBe(true);
    expect(twoWayTest("2022/10/2", "2022/9/22", 1)).toBe(true);
    expect(twoWayTest("2022/9/22", "2022/9/2", 1)).toBe(true);
    expect(twoWayTest("2022/9/2", "2022/9/11", -1)).toBe(true);

    // 忽略非英文字符的变更进行对比
    expect(twoWayTest("2022/10/1", "2022-10-3", -1)).toBe(true);
    expect(twoWayTest("2022/10/3", "2022-10-2", 1)).toBe(true);
    expect(twoWayTest("2022/10/2", "2022-9-22", 1)).toBe(true);
    expect(twoWayTest("2022/9/22", "2022-9-2", 1)).toBe(true);
    expect(twoWayTest("2022/9/2", "2022-9-11", -1)).toBe(true);

    // semver 對比 (semver.compare)
    expect(twoWayTest("3.2.01", "3.2.1", 0)).toBe(true); // equal
    expect(twoWayTest("3.02.1", "3.2.1", 0)).toBe(true); // equal
    expect(twoWayTest("3.02.0", "3.2.0", 0)).toBe(true); // equal
    expect(twoWayTest("4.5.12", "4.5.15", -1)).toBe(true);
    expect(twoWayTest("4.5.12", "4.5.12-alpha.1", 1)).toBe(true);
    expect(twoWayTest("4.5.12", "4.5.12", 0)).toBe(true);

    // 其他 等价
    expect(twoWayTest("3.2", "3", 1)).toBe(true);
    expect(twoWayTest("3.2.0", "3.2", 0)).toBe(true);
    expect(twoWayTest("3.2.0.0", "3.2.0", 0)).toBe(true);

    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/version/format
    // 3.2 大于 3.2pre, 3.2alpha, ....
    expect(twoWayTest("3.2pre", "3.2", -1)).toBe(true);
    expect(twoWayTest("3.2pre-2", "3.2", -1)).toBe(true);
    expect(twoWayTest("3.2alpha", "3.2", -1)).toBe(true);
    expect(twoWayTest("3.2alpha1", "3.2", -1)).toBe(true);
    expect(twoWayTest("3.2beta", "3.2", -1)).toBe(true);
    expect(twoWayTest("3.2beta2", "3.2", -1)).toBe(true);

    // 其他
    expect(twoWayTest("3", "2.5.1", 1)).toBe(true);
    expect(twoWayTest("2.5", "2.4.1", 1)).toBe(true);
    expect(twoWayTest("3.2.1.0", "3.2.0", 1)).toBe(true);
    expect(twoWayTest("v0.0.1.20210226040352", "v0.0.1.20210226040629", -1)).toBe(true);
    expect(twoWayTest("v0.0.1.20210226040352", "v0.0.1.20210226040352a", 1)).toBe(true);
    expect(twoWayTest("2018042901", "2018052201", -1)).toBe(true);

    // 其他
    expect(twoWayTest("1.2", "1.3", -1)).toBe(true);
    expect(twoWayTest("1.3a", "1.3b", -1)).toBe(true);
    expect(twoWayTest("1.3b", "1.3", -1)).toBe(true);
    expect(twoWayTest("1.3a1", "1.3a2", -1)).toBe(true);
    expect(twoWayTest("1.3a1", "1.3a2", -1)).toBe(true);

    // 其他
    expect(twoWayTest("v.3", "v.5", -1)).toBe(true);
    expect(twoWayTest("v.9", "v.10", -1)).toBe(true);
    expect(twoWayTest("v.10", "v.15", -1)).toBe(true);

    // 其他
    expect(twoWayTest("v3", "v5", -1)).toBe(true);
    expect(twoWayTest("v9", "v10", -1)).toBe(true);
    expect(twoWayTest("v10", "v15", -1)).toBe(true);

    // 不区分大小写
    expect(twoWayTest("v3", "V5", -1)).toBe(true);
    expect(twoWayTest("v9", "V10", -1)).toBe(true);
    expect(twoWayTest("v10", "V15", -1)).toBe(true);
    expect(twoWayTest("V3", "v5", -1)).toBe(true);
    expect(twoWayTest("V9", "v10", -1)).toBe(true);
    expect(twoWayTest("V10", "v15", -1)).toBe(true);

    // 其他
    expect(twoWayTest("a3", "a5", -1)).toBe(true);
    expect(twoWayTest("a9", "a10", -1)).toBe(true);
    expect(twoWayTest("a10", "a15", -1)).toBe(true);
    expect(twoWayTest("a15", "b1", -1)).toBe(true);

    // npm版本号格式
    expect(twoWayTest("1.0.0", "1.0.1", -1)).toBe(true);
    expect(twoWayTest("1.0.0", "1.0.0", 0)).toBe(true);
    expect(twoWayTest("1.0.1", "1.0.0", 1)).toBe(true);

    // 一般格式
    expect(twoWayTest("1.2.3.4", "1.2.3.4", 0)).toBe(true);
    expect(twoWayTest("1.2.3.4", "1.2.3.5", -1)).toBe(true);
    expect(twoWayTest("1.2.3.4", "1.2.3.3", 1)).toBe(true);

    // 异常测试
    expect(twoWayTest("", "", 0)).toBe(true);
    expect(twoWayTest("", "0", 0)).toBe(true);
    expect(twoWayTest("", "1", -1)).toBe(true);
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

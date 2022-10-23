import { formatTime, nextTime } from "./utils";
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

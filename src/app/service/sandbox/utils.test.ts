import { describe, expect, it } from "vitest";
import type { TExtensionEnv } from "../extension/extension_env";
import { backgroundRunInAllowed, isOnceRunDone } from "./utils";

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s);
const env = (inIncognitoContext: boolean | undefined, incognitoMode = "split") =>
  ({ inIncognitoContext, incognitoMode }) as TExtensionEnv;

describe("isOnceRunDone：cron 的 once 字段所在周期内已运行过则跳过", () => {
  it("没有 once（位置 < 1）或从未运行过时不跳过", () => {
    expect(isOnceRunDone(0, at(2026, 11, 5, 10).getTime(), at(2026, 11, 5, 10, 30))).toBe(false);
    expect(isOnceRunDone(3, undefined, at(2026, 11, 5, 10))).toBe(false);
  });

  it.each([
    ["分钟", 1, at(2026, 11, 5, 10, 30, 1), at(2026, 11, 5, 10, 30, 59), at(2026, 11, 5, 10, 31, 0)],
    ["小时", 2, at(2026, 11, 5, 10, 1), at(2026, 11, 5, 10, 59), at(2026, 11, 5, 11, 0)],
    ["天", 3, at(2026, 11, 5, 0, 1), at(2026, 11, 5, 23, 59), at(2026, 11, 6, 0, 0)],
    ["月", 4, at(2026, 11, 1), at(2026, 11, 30, 23), at(2026, 12, 1)],
    ["周（ISO 周一起算）", 5, at(2026, 11, 2), at(2026, 11, 8, 23), at(2026, 11, 9)],
  ])("%s周期：同一周期内跳过，进入下一周期即可运行", (_name, pos, last, samePeriod, nextPeriod) => {
    expect(isOnceRunDone(pos, last.getTime(), samePeriod)).toBe(true);
    expect(isOnceRunDone(pos, last.getTime(), nextPeriod)).toBe(false);
  });

  it("相隔整整一个更大的周期、同名时间单位相同时不跳过（如隔了一周的同一星期几）", () => {
    expect(isOnceRunDone(3, at(2026, 11, 5, 9).getTime(), at(2026, 11, 12, 9))).toBe(false);
    expect(isOnceRunDone(2, at(2026, 11, 5, 9).getTime(), at(2026, 11, 6, 9, 30))).toBe(false);
  });
});

describe("backgroundRunInAllowed：@run-in 与扩展环境（普通 / 隐身）是否匹配", () => {
  const meta = (runIn?: string) => (runIn ? { "run-in": [runIn] } : {});

  it("普通环境只运行 normal-tabs，隐身环境只运行 incognito-tabs", () => {
    expect(backgroundRunInAllowed(meta("normal-tabs"), env(false))).toBe(true);
    expect(backgroundRunInAllowed(meta("incognito-tabs"), env(false))).toBe(false);
    expect(backgroundRunInAllowed(meta("incognito-tabs"), env(true))).toBe(true);
    expect(backgroundRunInAllowed(meta("normal-tabs"), env(true))).toBe(false);
  });

  it("未写 run-in、run-in 为 all、拿不到隐身状态或 Firefox spanning 共享后台时都允许", () => {
    expect(backgroundRunInAllowed(meta(), env(true))).toBe(true);
    expect(backgroundRunInAllowed(meta("all"), env(true))).toBe(true);
    expect(backgroundRunInAllowed(meta("incognito-tabs"), env(undefined))).toBe(true);
    expect(backgroundRunInAllowed(meta("incognito-tabs"), undefined)).toBe(true);
    expect(backgroundRunInAllowed(meta("incognito-tabs"), env(false, "spanning"))).toBe(true);
  });
});

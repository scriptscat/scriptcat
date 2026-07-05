import { describe, it, expect, beforeAll } from "vitest";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { nextRunText } from "./cron";

beforeAll(() => initTestLanguage("zh-CN"));

describe("nextRunText cron 下次运行预览", () => {
  it("合法表达式返回 valid=true 与非空文案", () => {
    const r = nextRunText("0 9 * * *");
    expect(r.valid).toBe(true);
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("非法表达式返回 valid=false", () => {
    expect(nextRunText("not a cron").valid).toBe(false);
  });

  it("空表达式返回 valid=false", () => {
    expect(nextRunText("   ").valid).toBe(false);
  });
});

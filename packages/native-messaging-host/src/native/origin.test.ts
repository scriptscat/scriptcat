import { describe, it, expect } from "vitest";
import { verifyCallerOrigin, extractCallerOrigin, truncateForLog } from "./origin";

const VALID_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/";

describe("verifyCallerOrigin - 主机启动时的调用方来源校验（doc 04 §3 A6, doc 05 §5）", () => {
  it("argv 中存在且在允许列表中时通过", () => {
    const result = verifyCallerOrigin(["node", "host.js", VALID_ORIGIN], [VALID_ORIGIN]);
    expect(result).toEqual({ ok: true, origin: VALID_ORIGIN });
  });

  it("argv 中缺少 chrome-extension:// 来源时拒绝", () => {
    const result = verifyCallerOrigin(["node", "host.js"], [VALID_ORIGIN]);
    expect(result.ok).toBe(false);
  });

  it("来源不在允许列表中时拒绝", () => {
    const other = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/";
    const result = verifyCallerOrigin(["node", "host.js", other], [VALID_ORIGIN]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("允许列表为空时一律拒绝（不存在通配符豁免）", () => {
    const result = verifyCallerOrigin(["node", "host.js", VALID_ORIGIN], []);
    expect(result.ok).toBe(false);
  });

  it("精确匹配：末尾缺少斜杠的变体被拒绝", () => {
    const withoutSlash = VALID_ORIGIN.slice(0, -1);
    const result = verifyCallerOrigin(["node", "host.js", withoutSlash], [VALID_ORIGIN]);
    expect(result.ok).toBe(false);
  });

  it("精确匹配：大小写变体被拒绝", () => {
    const upper = VALID_ORIGIN.toUpperCase();
    const result = verifyCallerOrigin(["node", "host.js", upper], [VALID_ORIGIN]);
    expect(result.ok).toBe(false);
  });

  it("extractCallerOrigin 从任意位置的 argv 中找到合法格式的来源", () => {
    expect(extractCallerOrigin(["--flag", VALID_ORIGIN, "trailing"])).toBe(VALID_ORIGIN);
    expect(extractCallerOrigin(["no", "match", "here"])).toBeUndefined();
  });
});

describe("truncateForLog", () => {
  it("短字符串原样返回", () => {
    expect(truncateForLog("short")).toBe("short");
  });

  it("超过上限时截断并追加省略号", () => {
    const long = "x".repeat(200);
    const result = truncateForLog(long, 128);
    expect(result.length).toBe(129);
    expect(result.endsWith("…")).toBe(true);
  });
});

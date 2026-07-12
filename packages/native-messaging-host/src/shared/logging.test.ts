import { describe, it, expect, vi, afterEach } from "vitest";
import { Logger, redactUrl, redactSecret } from "./logging";

describe("redactUrl - URL 中的敏感查询参数脱敏", () => {
  it("token 参数被替换", () => {
    expect(redactUrl("https://example.com/x?token=abc123")).toBe("https://example.com/x?token=%5BREDACTED%5D");
  });

  it("非敏感参数保持原样", () => {
    expect(redactUrl("https://example.com/x?page=2")).toBe("https://example.com/x?page=2");
  });

  it("多个敏感参数全部脱敏", () => {
    const result = redactUrl("https://example.com/x?token=a&secret=b&page=2");
    expect(result).not.toContain("=a&");
    expect(result).not.toContain("=b");
    expect(result).toContain("page=2");
  });

  it("非法 URL 整体脱敏", () => {
    expect(redactUrl("not a url")).toBe("[REDACTED]");
  });
});

describe("redactSecret", () => {
  it("任意输入都返回固定占位符，不回显原值", () => {
    expect(redactSecret("super-secret-token")).toBe("[REDACTED]");
  });
});

describe("Logger - 仅写入 stderr", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("日志写入 process.stderr 而非 stdout", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    new Logger("test-service").info("hello", { foo: "bar" });

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it("日志行是携带 service/level/message 字段的合法 JSON", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    new Logger("broker").warn("something happened", { clientId: "c1" });

    const written = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed.service).toBe("broker");
    expect(parsed.level).toBe("warn");
    expect(parsed.message).toBe("something happened");
    expect(parsed.clientId).toBe("c1");
    expect(typeof parsed.ts).toBe("string");
  });
});

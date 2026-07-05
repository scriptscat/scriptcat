import { describe, it, expect, vi } from "vitest";
import { isRetryableError, withRetry, classifyErrorCode } from "./agent";

// ---- isRetryableError ----

describe("isRetryableError", () => {
  it("429 应可重试", () => {
    expect(isRetryableError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
  });

  it("500 应可重试", () => {
    expect(isRetryableError(new Error("HTTP 500 Internal Server Error"))).toBe(true);
  });

  it("503 应可重试", () => {
    expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("network 错误应可重试", () => {
    expect(isRetryableError(new Error("network error"))).toBe(true);
    expect(isRetryableError(new Error("Network Error"))).toBe(true);
  });

  it("fetch 失败应可重试", () => {
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
  });

  it("ECONNRESET 应可重试", () => {
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
  });

  it("401 不应重试", () => {
    expect(isRetryableError(new Error("401 Unauthorized"))).toBe(false);
  });

  it("403 不应重试", () => {
    expect(isRetryableError(new Error("403 Forbidden"))).toBe(false);
  });

  it("400 不应重试", () => {
    expect(isRetryableError(new Error("400 Bad Request"))).toBe(false);
  });

  it("404 不应重试", () => {
    expect(isRetryableError(new Error("404 Not Found"))).toBe(false);
  });

  it("普通错误不应重试", () => {
    expect(isRetryableError(new Error("Invalid API key"))).toBe(false);
    expect(isRetryableError(new Error("JSON parse error"))).toBe(false);
  });
});

// ---- withRetry ----

// 测试用的立即返回 delay（避免真实等待和 fake timer 复杂性）
const immediateDelay = () => Promise.resolve();

describe("withRetry", () => {
  it("首次成功时直接返回结果", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const signal = new AbortController().signal;
    const result = await withRetry(fn, signal, 3, immediateDelay);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("429 错误应重试直到成功", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 429 Too Many Requests"))
      .mockRejectedValueOnce(new Error("HTTP 429 Too Many Requests"))
      .mockResolvedValue("ok");
    const signal = new AbortController().signal;

    const result = await withRetry(fn, signal, 3, immediateDelay);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("超过最大重试次数后抛出最后的错误", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 429 Too Many Requests"));
    const signal = new AbortController().signal;

    await expect(withRetry(fn, signal, 3, immediateDelay)).rejects.toThrow("429");
    // 1 次首次尝试 + 3 次重试 = 4 次
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("401 错误不重试，直接抛出", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));
    const signal = new AbortController().signal;

    await expect(withRetry(fn, signal, 3, immediateDelay)).rejects.toThrow("401");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("pre-abort 时不调用 fn，直接抛出", async () => {
    const ac = new AbortController();
    ac.abort();

    const fn = vi.fn().mockResolvedValue("ok");

    await expect(withRetry(fn, ac.signal, 3, immediateDelay)).rejects.toThrow();
    // 信号已 abort，循环开头立即退出，fn 从未被调用
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("fn 内 abort 后不再重试", async () => {
    const ac = new AbortController();
    // fn 执行时同步 abort，模拟外部取消
    const fn = vi.fn().mockImplementation(() => {
      ac.abort();
      return Promise.reject(new Error("HTTP 500"));
    });

    await expect(withRetry(fn, ac.signal, 3, immediateDelay)).rejects.toThrow();
    // fn 被调用一次后 abort，catch 分支检测到 signal.aborted，立即抛出不再重试
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("500 错误重试后成功", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 500 Internal Server Error"))
      .mockResolvedValue("recovered");
    const signal = new AbortController().signal;

    const result = await withRetry(fn, signal, 3, immediateDelay);
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---- classifyErrorCode ----

describe("classifyErrorCode", () => {
  it("429 应分类为 rate_limit", () => {
    expect(classifyErrorCode(new Error("HTTP 429 Too Many Requests"))).toBe("rate_limit");
  });

  it("401 应分类为 auth", () => {
    expect(classifyErrorCode(new Error("401 Unauthorized"))).toBe("auth");
  });

  it("403 应分类为 auth", () => {
    expect(classifyErrorCode(new Error("403 Forbidden"))).toBe("auth");
  });

  it("消息含 timed out 应分类为 tool_timeout", () => {
    expect(classifyErrorCode(new Error('SkillScript "foo" timed out after 30s'))).toBe("tool_timeout");
  });

  it("errorCode 属性为 tool_timeout 应分类为 tool_timeout", () => {
    const e = Object.assign(new Error("execution failed"), { errorCode: "tool_timeout" });
    expect(classifyErrorCode(e)).toBe("tool_timeout");
  });

  it("其他错误应分类为 api_error", () => {
    expect(classifyErrorCode(new Error("500 Internal Server Error"))).toBe("api_error");
    expect(classifyErrorCode(new Error("Unknown error"))).toBe("api_error");
  });
});

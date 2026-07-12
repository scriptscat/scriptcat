import { describe, it, expect } from "vitest";
import { WindowedRateLimiter, ConcurrencyLimiter, AuthFailureLockout } from "./rate-limit";

describe("WindowedRateLimiter - 固定窗口计数（doc 04 §7）", () => {
  it("窗口内未超过上限时允许", () => {
    const limiter = new WindowedRateLimiter(3, 60_000);
    expect(limiter.check("c1", 0).allowed).toBe(true);
    expect(limiter.check("c1", 10).allowed).toBe(true);
    expect(limiter.check("c1", 20).allowed).toBe(true);
  });

  it("超过窗口内上限时拒绝并返回 retryAfterSeconds", () => {
    const limiter = new WindowedRateLimiter(2, 60_000);
    limiter.check("c1", 0);
    limiter.check("c1", 0);
    const result = limiter.check("c1", 0);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("窗口过期后重置计数", () => {
    const limiter = new WindowedRateLimiter(1, 1000);
    expect(limiter.check("c1", 0).allowed).toBe(true);
    expect(limiter.check("c1", 500).allowed).toBe(false);
    expect(limiter.check("c1", 1001).allowed).toBe(true);
  });

  it("不同 key 互相独立计数", () => {
    const limiter = new WindowedRateLimiter(1, 60_000);
    expect(limiter.check("c1", 0).allowed).toBe(true);
    expect(limiter.check("c2", 0).allowed).toBe(true);
  });

  it("reset 清空该 key 的计数", () => {
    const limiter = new WindowedRateLimiter(1, 60_000);
    limiter.check("c1", 0);
    expect(limiter.check("c1", 0).allowed).toBe(false);
    limiter.reset("c1");
    expect(limiter.check("c1", 0).allowed).toBe(true);
  });
});

describe("ConcurrencyLimiter - 并发上限（doc 04 §7 每客户端 4 并发）", () => {
  it("未达上限时可获取", () => {
    const limiter = new ConcurrencyLimiter(2);
    expect(limiter.tryAcquire("c1")).toBe(true);
    expect(limiter.tryAcquire("c1")).toBe(true);
  });

  it("达到上限后拒绝，release 后可再次获取", () => {
    const limiter = new ConcurrencyLimiter(1);
    expect(limiter.tryAcquire("c1")).toBe(true);
    expect(limiter.tryAcquire("c1")).toBe(false);
    limiter.release("c1");
    expect(limiter.tryAcquire("c1")).toBe(true);
  });

  it("不同 client 互相独立", () => {
    const limiter = new ConcurrencyLimiter(1);
    expect(limiter.tryAcquire("c1")).toBe(true);
    expect(limiter.tryAcquire("c2")).toBe(true);
  });

  it("release 多余的调用不会导致计数变为负数", () => {
    const limiter = new ConcurrencyLimiter(1);
    limiter.tryAcquire("c1");
    limiter.release("c1");
    limiter.release("c1");
    expect(limiter.tryAcquire("c1")).toBe(true);
    expect(limiter.tryAcquire("c1")).toBe(false);
  });
});

describe("AuthFailureLockout - 认证失败锁定（doc 04 §7 3 次/分钟 → 5 分钟锁定）", () => {
  it("失败次数未达阈值时不锁定", () => {
    const lockout = new AuthFailureLockout(3, 60_000, 300_000);
    lockout.recordFailure("ep1", 0);
    lockout.recordFailure("ep1", 10);
    expect(lockout.isLockedOut("ep1", 20)).toBe(false);
  });

  it("达到阈值后锁定，锁定期内拒绝", () => {
    const lockout = new AuthFailureLockout(3, 60_000, 300_000);
    lockout.recordFailure("ep1", 0);
    lockout.recordFailure("ep1", 10);
    lockout.recordFailure("ep1", 20);
    expect(lockout.isLockedOut("ep1", 30)).toBe(true);
  });

  it("锁定期结束后自动解锁", () => {
    const lockout = new AuthFailureLockout(1, 60_000, 5000);
    lockout.recordFailure("ep1", 0);
    expect(lockout.isLockedOut("ep1", 1000)).toBe(true);
    expect(lockout.isLockedOut("ep1", 6000)).toBe(false);
  });

  it("recordSuccess 清空失败记录与锁定状态", () => {
    const lockout = new AuthFailureLockout(1, 60_000, 300_000);
    lockout.recordFailure("ep1", 0);
    expect(lockout.isLockedOut("ep1", 100)).toBe(true);
    lockout.recordSuccess("ep1");
    expect(lockout.isLockedOut("ep1", 200)).toBe(false);
  });

  it("窗口外的旧失败不计入阈值", () => {
    const lockout = new AuthFailureLockout(3, 60_000, 300_000);
    lockout.recordFailure("ep1", 0);
    lockout.recordFailure("ep1", 10);
    lockout.recordFailure("ep1", 70_000); // outside the 60s window relative to t=0's failures
    expect(lockout.isLockedOut("ep1", 70_000)).toBe(false);
  });

  it("不同 endpoint 互相独立", () => {
    const lockout = new AuthFailureLockout(1, 60_000, 300_000);
    lockout.recordFailure("ep1", 0);
    expect(lockout.isLockedOut("ep1", 100)).toBe(true);
    expect(lockout.isLockedOut("ep2", 100)).toBe(false);
  });
});

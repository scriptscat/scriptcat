import { describe, it, expect } from "vitest";
import { LIMITS, resolveLimits } from "./limits";

describe("resolveLimits - 有界配置覆盖", () => {
  it("无覆盖时返回默认值", () => {
    expect(resolveLimits()).toEqual(LIMITS);
  });

  it("覆盖值小于默认值时生效（收紧限制）", () => {
    const resolved = resolveLimits({ readCallsPerMinutePerClient: 10 });
    expect(resolved.readCallsPerMinutePerClient).toBe(10);
  });

  it("覆盖值大于默认值时被忽略（不能放宽限制）", () => {
    const resolved = resolveLimits({ readCallsPerMinutePerClient: 1000 });
    expect(resolved.readCallsPerMinutePerClient).toBe(LIMITS.readCallsPerMinutePerClient);
  });

  it("覆盖值为 0 或负数时被忽略", () => {
    expect(resolveLimits({ concurrentCallsPerClient: 0 }).concurrentCallsPerClient).toBe(
      LIMITS.concurrentCallsPerClient
    );
    expect(resolveLimits({ concurrentCallsPerClient: -1 }).concurrentCallsPerClient).toBe(
      LIMITS.concurrentCallsPerClient
    );
  });

  it("非数字或非有限值被忽略", () => {
    expect(resolveLimits({ concurrentCallsPerClient: NaN }).concurrentCallsPerClient).toBe(
      LIMITS.concurrentCallsPerClient
    );
    expect(resolveLimits({ concurrentCallsPerClient: Infinity }).concurrentCallsPerClient).toBe(
      LIMITS.concurrentCallsPerClient
    );
  });

  it("未被覆盖的键保持默认值", () => {
    const resolved = resolveLimits({ readCallsPerMinutePerClient: 10 });
    expect(resolved.writeRequestsPerHourPerClient).toBe(LIMITS.writeRequestsPerHourPerClient);
  });
});

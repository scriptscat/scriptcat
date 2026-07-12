import { describe, it, expect, vi, afterEach } from "vitest";
import { PairingManager } from "./pairing";

function request(manager: PairingManager, overrides: Partial<Parameters<PairingManager["requestPairing"]>[0]> = {}) {
  return manager.requestPairing({
    clientName: "Test Client",
    requestedScopes: ["scripts:list"],
    connectionId: "conn-1",
    ...overrides,
  });
}

describe("PairingManager - 配对状态机（doc 03 §4）", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("成功的配对请求返回 8 位由无歧义字符组成的验证码", () => {
    const manager = new PairingManager();
    const result = request(manager);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pairing.code).toHaveLength(8);
      expect(result.pairing.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("clientName 超过 64 字符时拒绝", () => {
    const result = request(new PairingManager(), { clientName: "x".repeat(65) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("CLIENT_NAME_INVALID");
  });

  it("clientName 为空字符串时拒绝", () => {
    const result = request(new PairingManager(), { clientName: "" });
    expect(result.ok).toBe(false);
  });

  it("clientName 含控制字符时拒绝", () => {
    const result = request(new PairingManager(), { clientName: "evil\x00name" });
    expect(result.ok).toBe(false);
  });

  it("同一连接已有一个待批配对时拒绝第二个", () => {
    const manager = new PairingManager();
    expect(request(manager).ok).toBe(true);
    const second = request(manager);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("PENDING_PAIRING_EXISTS");
  });

  it("不同连接可以各自拥有一个待批配对", () => {
    const manager = new PairingManager();
    expect(request(manager, { connectionId: "conn-1" }).ok).toBe(true);
    expect(request(manager, { connectionId: "conn-2" }).ok).toBe(true);
  });

  it("全局每小时最多 3 次配对请求", () => {
    const manager = new PairingManager();
    expect(request(manager, { connectionId: "c1" }).ok).toBe(true);
    expect(request(manager, { connectionId: "c2" }).ok).toBe(true);
    expect(request(manager, { connectionId: "c3" }).ok).toBe(true);
    const fourth = request(manager, { connectionId: "c4" });
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.reason).toBe("RATE_LIMITED");
  });

  it("超过 1 小时后全局配额重置", () => {
    vi.useFakeTimers();
    const manager = new PairingManager();
    request(manager, { connectionId: "c1" });
    request(manager, { connectionId: "c2" });
    request(manager, { connectionId: "c3" });
    vi.advanceTimersByTime(61 * 60_000);
    const result = request(manager, { connectionId: "c4" });
    expect(result.ok).toBe(true);
  });

  it("get() 在 2 分钟 TTL 后返回 undefined", () => {
    vi.useFakeTimers();
    const manager = new PairingManager();
    const result = request(manager);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    vi.advanceTimersByTime(121_000);
    expect(manager.get(result.pairing.pairingId)).toBeUndefined();
  });

  it("resolve() 后该配对不能再被批准，且释放该连接的待批计数", () => {
    const manager = new PairingManager();
    const result = request(manager, { connectionId: "conn-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    manager.resolve(result.pairing.pairingId);
    expect(manager.get(result.pairing.pairingId)).toBeUndefined();

    // The connection's pending slot is free again for a new request.
    const second = request(manager, { connectionId: "conn-1" });
    expect(second.ok).toBe(true);
  });

  it("resolve() 对不存在或已解决的 pairingId 是安全的空操作，不抛错", () => {
    const manager = new PairingManager();
    expect(() => manager.resolve("nonexistent-pairing-id")).not.toThrow();

    const result = request(manager, { connectionId: "conn-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    manager.resolve(result.pairing.pairingId);
    // Second resolve() of the same (already-removed) pairingId must also be a no-op.
    expect(() => manager.resolve(result.pairing.pairingId)).not.toThrow();
  });

  it("过期配对被清理后不再占用该连接的待批配额", () => {
    vi.useFakeTimers();
    const manager = new PairingManager();
    const first = request(manager, { connectionId: "conn-1" });
    expect(first.ok).toBe(true);
    vi.advanceTimersByTime(121_000);
    manager.get(first.ok ? first.pairing.pairingId : "");

    const second = request(manager, { connectionId: "conn-1" });
    expect(second.ok).toBe(true);
  });
});

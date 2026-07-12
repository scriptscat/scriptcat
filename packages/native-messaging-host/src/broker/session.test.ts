import { describe, it, expect, vi } from "vitest";
import { SessionHandler, type SessionDeps } from "./session";
import { computeMac } from "../auth/challenge";
import { PairingManager } from "../auth/pairing";
import { AuthFailureLockout, ConcurrencyLimiter, WindowedRateLimiter } from "./rate-limit";
import type { HostToShimMessage } from "./messages";
import type { StoredClient } from "../auth/token-store";

const ENDPOINT = "/run/scriptcat-mcp-test.sock";
const SERVER_INFO = { name: "scriptcat-native-host", version: "0.1.0" };

function makeStoredClient(overrides: Partial<StoredClient> = {}): StoredClient {
  return {
    clientId: "client-1",
    displayName: "Test Client",
    tokenHash: "a".repeat(64),
    scopes: ["scripts:list"],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    revoked: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionDeps> = {}) {
  const sent: HostToShimMessage[] = [];
  const tokenStoreGet = vi.fn<(id: string) => StoredClient | undefined>().mockReturnValue(makeStoredClient());
  const touchLastUsed = vi.fn().mockResolvedValue(undefined);
  const dispatchBridgeCall = vi.fn().mockResolvedValue({ ok: true, result: { scripts: [] } });
  const onPairingRequested = vi.fn();

  const deps: SessionDeps = {
    connectionId: "conn-1",
    endpointName: ENDPOINT,
    serverInfo: SERVER_INFO,
    tokenStore: { get: tokenStoreGet, touchLastUsed },
    pairingManager: new PairingManager(),
    authFailureLockout: new AuthFailureLockout(3, 60_000, 300_000),
    readLimiter: new WindowedRateLimiter(60, 60_000),
    writeLimiter: new WindowedRateLimiter(10, 60 * 60_000),
    concurrencyLimiter: new ConcurrencyLimiter(4),
    send: (msg) => sent.push(msg),
    dispatchBridgeCall,
    onPairingRequested,
    ...overrides,
  };

  const session = new SessionHandler(deps);
  return { session, sent, tokenStoreGet, touchLastUsed, dispatchBridgeCall, onPairingRequested, deps };
}

async function authenticate(
  session: SessionHandler,
  sent: HostToShimMessage[],
  clientId = "client-1",
  tokenHash = "a".repeat(64)
) {
  await session.onMessage({ t: "hello", v: 1, clientId });
  const challenge = sent[sent.length - 1] as Extract<HostToShimMessage, { t: "challenge" }>;
  const mac = computeMac(tokenHash, challenge.nonce, ENDPOINT);
  await session.onMessage({ t: "auth", clientId, mac });
}

describe("SessionHandler - 握手与鉴权", () => {
  it("hello 缺少 clientId 时拒绝（引导走 pair 流程）", async () => {
    const { session, sent } = makeSession();
    await session.onMessage({ t: "hello", v: 1 });
    expect(sent).toEqual([{ t: "deny", code: "UNAUTHENTICATED" }]);
    expect(session.getPhase()).toBe("unauthenticated");
  });

  it("完整握手成功后进入 ready 状态并返回 scopes", async () => {
    const { session, sent, touchLastUsed } = makeSession();
    await authenticate(session, sent);
    expect(session.getPhase()).toBe("ready");
    expect(session.getClientId()).toBe("client-1");
    const ready = sent.find((m) => m.t === "ready") as Extract<HostToShimMessage, { t: "ready" }>;
    expect(ready.scopes).toEqual(["scripts:list"]);
    expect(ready.serverInfo).toEqual(SERVER_INFO);
    expect(touchLastUsed).toHaveBeenCalledWith("client-1");
  });

  it("token 不匹配时验证失败并 deny UNAUTHENTICATED", async () => {
    const { session, sent } = makeSession();
    await session.onMessage({ t: "hello", v: 1, clientId: "client-1" });
    const challenge = sent[sent.length - 1] as Extract<HostToShimMessage, { t: "challenge" }>;
    const wrongMac = computeMac("wrong-hash".padEnd(64, "0"), challenge.nonce, ENDPOINT);
    await session.onMessage({ t: "auth", clientId: "client-1", mac: wrongMac });
    expect(sent[sent.length - 1]).toEqual({ t: "deny", code: "UNAUTHENTICATED" });
    expect(session.getPhase()).not.toBe("ready");
  });

  it("未知 clientId 验证失败", async () => {
    const { session, sent, tokenStoreGet } = makeSession();
    tokenStoreGet.mockReturnValue(undefined);
    await authenticate(session, sent);
    expect(sent[sent.length - 1]).toEqual({ t: "deny", code: "UNAUTHENTICATED" });
  });

  it("已撤销的客户端即使 mac 正确也验证失败", async () => {
    const { session, sent, tokenStoreGet } = makeSession();
    tokenStoreGet.mockReturnValue(makeStoredClient({ revoked: true }));
    await authenticate(session, sent);
    expect(sent[sent.length - 1]).toEqual({ t: "deny", code: "UNAUTHENTICATED" });
  });

  it("会话不是凭据：auth 消息中的 clientId 必须与 hello 阶段一致", async () => {
    const { session, sent } = makeSession();
    await session.onMessage({ t: "hello", v: 1, clientId: "client-1" });
    await session.onMessage({ t: "auth", clientId: "client-2", mac: "irrelevant" });
    expect(sent[sent.length - 1]).toEqual({ t: "deny", code: "INVALID_REQUEST" });
  });

  it("连续 3 次认证失败后该 endpoint 被锁定，后续 hello 直接拒绝", async () => {
    const { session, sent } = makeSession();
    for (let i = 0; i < 3; i++) {
      await session.onMessage({ t: "hello", v: 1, clientId: "client-1" });
      const challenge = sent[sent.length - 1] as Extract<HostToShimMessage, { t: "challenge" }>;
      await session.onMessage({ t: "auth", clientId: "client-1", mac: computeMac("wrong", challenge.nonce, ENDPOINT) });
    }
    sent.length = 0;
    await session.onMessage({ t: "hello", v: 1, clientId: "client-1" });
    expect(sent).toEqual([{ t: "deny", code: "RATE_LIMITED" }]);
  });

  it("非法消息（缺少 t 字段）被拒绝", async () => {
    const { session, sent } = makeSession();
    await session.onMessage({ garbage: true });
    expect(sent).toEqual([{ t: "deny", code: "INVALID_REQUEST" }]);
  });
});

describe("SessionHandler - call 分发（稳态阶段）", () => {
  it("未认证时调用 call 返回 UNAUTHENTICATED 错误", async () => {
    const { session, sent } = makeSession();
    await session.onMessage({ t: "call", id: "req-1", action: "scripts.list", input: {} });
    expect(sent).toEqual([
      { t: "result", id: "req-1", ok: false, error: { code: "UNAUTHENTICATED", message: "not authenticated" } },
    ]);
  });

  it("认证后正常转发 call 并返回结果", async () => {
    const { session, sent, dispatchBridgeCall } = makeSession();
    await authenticate(session, sent);
    sent.length = 0;
    await session.onMessage({ t: "call", id: "req-1", action: "scripts.list", input: {} });
    expect(dispatchBridgeCall).toHaveBeenCalledWith("client-1", "scripts.list", {});
    expect(sent).toEqual([{ t: "result", id: "req-1", ok: true, result: { scripts: [] } }]);
  });

  it("超过读调用速率限制时返回 RATE_LIMITED，不转发", async () => {
    const { session, sent, dispatchBridgeCall, deps } = makeSession({
      readLimiter: new WindowedRateLimiter(1, 60_000),
    });
    await authenticate(session, sent);
    sent.length = 0;
    await session.onMessage({ t: "call", id: "req-1", action: "scripts.list", input: {} });
    await session.onMessage({ t: "call", id: "req-2", action: "scripts.list", input: {} });
    expect(dispatchBridgeCall).toHaveBeenCalledTimes(1);
    const result2 = sent.find((m) => m.t === "result" && "id" in m && m.id === "req-2");
    expect(result2 && "ok" in result2 && !result2.ok && result2.error.code).toBe("RATE_LIMITED");
    void deps;
  });

  it("超过并发上限时返回 RATE_LIMITED", async () => {
    let resolveCall!: () => void;
    const dispatchBridgeCall = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => (resolveCall = () => resolve({ ok: true, result: {} }))));
    const { session, sent } = makeSession({ concurrencyLimiter: new ConcurrencyLimiter(1), dispatchBridgeCall });
    await authenticate(session, sent);
    sent.length = 0;

    const first = session.onMessage({ t: "call", id: "req-1", action: "scripts.list", input: {} });
    // Second call arrives while the first is still in flight.
    await session.onMessage({ t: "call", id: "req-2", action: "scripts.list", input: {} });
    const result2 = sent.find((m) => m.t === "result" && "id" in m && m.id === "req-2");
    expect(result2 && "ok" in result2 && !result2.ok && result2.error.code).toBe("RATE_LIMITED");

    resolveCall();
    await first;
  });

  it("write action 消耗写配额而非读配额", async () => {
    const readLimiter = new WindowedRateLimiter(0, 60_000);
    const writeLimiter = new WindowedRateLimiter(5, 60_000);
    const { session, sent, dispatchBridgeCall } = makeSession({
      readLimiter,
      writeLimiter,
      tokenStore: {
        get: vi.fn().mockReturnValue(makeStoredClient({ scopes: ["scripts:install:request"] })),
        touchLastUsed: vi.fn(),
      },
    });
    await authenticate(session, sent);
    sent.length = 0;
    await session.onMessage({ t: "call", id: "req-1", action: "scripts.install.prepare", input: { code: "x" } });
    expect(dispatchBridgeCall).toHaveBeenCalledTimes(1);
  });
});

describe("SessionHandler - 配对流程", () => {
  it("pair 请求返回 pair_pending 并通知 onPairingRequested", async () => {
    const { session, sent, onPairingRequested } = makeSession();
    await session.onMessage({ t: "pair", v: 1, clientName: "New Client", requestedScopes: ["scripts:list"] });
    const pending = sent[0] as Extract<HostToShimMessage, { t: "pair_pending" }>;
    expect(pending.t).toBe("pair_pending");
    expect(pending.code).toHaveLength(8);
    expect(onPairingRequested).toHaveBeenCalledWith(
      expect.objectContaining({ pairingId: pending.pairingId, clientName: "New Client", code: pending.code })
    );
  });

  it("resolvePairing 发送 pair_result 并使该 pairingId 之后不可再决定", async () => {
    const { session, sent, deps } = makeSession();
    await session.onMessage({ t: "pair", v: 1, clientName: "New Client", requestedScopes: ["scripts:list"] });
    const pending = sent[0] as Extract<HostToShimMessage, { t: "pair_pending" }>;

    session.resolvePairing({
      pairingId: pending.pairingId,
      approved: true,
      clientId: "new-id",
      token: "raw-token",
      grantedScopes: ["scripts:list"],
    });
    expect(sent[sent.length - 1]).toEqual({
      t: "pair_result",
      approved: true,
      clientId: "new-id",
      token: "raw-token",
      grantedScopes: ["scripts:list"],
    });
    expect(deps.pairingManager.get(pending.pairingId)).toBeUndefined();
  });
});

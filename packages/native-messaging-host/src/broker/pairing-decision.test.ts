import { describe, it, expect, vi } from "vitest";
import { handlePairingDecision } from "./pairing-decision";
import { PairingManager } from "../auth/pairing";
import type { SessionHandler } from "./session";

function makeDeps(
  overrides: { pairingManager?: PairingManager; getSession?: (id: string) => SessionHandler | undefined } = {}
) {
  const pairingManager = overrides.pairingManager ?? new PairingManager();
  const addClient = vi.fn().mockResolvedValue(undefined);
  // Mirrors the real SessionHandler.resolvePairing side effect (session.ts): it always resolves
  // the pairing in the shared PairingManager before sending pair_result. A mock that skipped
  // this would let a pairingId outlive its actual production lifetime.
  const resolvePairing = vi.fn((params: { pairingId: string }) => {
    pairingManager.resolve(params.pairingId);
  });
  const session = { resolvePairing } as unknown as SessionHandler;
  const getSession = overrides.getSession ?? (() => session);
  return { pairingManager, tokenStore: { addClient }, getSession, addClient, resolvePairing, session };
}

describe("handlePairingDecision - 应用配对决定并签发 token", () => {
  it("批准时生成 token、写入 tokenStore，并通过 session 发送一次性明文 token", async () => {
    const pairingManager = new PairingManager();
    const requestResult = pairingManager.requestPairing({
      clientName: "New Client",
      requestedScopes: ["scripts:list"],
      connectionId: "conn-1",
    });
    expect(requestResult.ok).toBe(true);
    if (!requestResult.ok) return;

    const deps = makeDeps({ pairingManager });
    await handlePairingDecision(deps, {
      pairingId: requestResult.pairing.pairingId,
      approved: true,
      grantedScopes: ["scripts:list"],
    });

    expect(deps.addClient).toHaveBeenCalledTimes(1);
    const addedClient = deps.addClient.mock.calls[0][0];
    expect(addedClient.displayName).toBe("New Client");
    expect(addedClient.scopes).toEqual(["scripts:list"]);
    expect(typeof addedClient.tokenHash).toBe("string");
    expect(addedClient.tokenHash).toHaveLength(64);

    expect(deps.resolvePairing).toHaveBeenCalledWith(
      expect.objectContaining({
        pairingId: requestResult.pairing.pairingId,
        approved: true,
        grantedScopes: ["scripts:list"],
      })
    );
    const resolvedCall = deps.resolvePairing.mock.calls[0][0];
    expect(typeof resolvedCall.token).toBe("string");
    expect(resolvedCall.token).toHaveLength(64);
    // The persisted hash must correspond to the exact token sent to the shim.
    const { hashToken } = await import("../auth/token-store");
    expect(addedClient.tokenHash).toBe(hashToken(resolvedCall.token));
  });

  it("拒绝时不写入 tokenStore，只发送 approved:false", async () => {
    const pairingManager = new PairingManager();
    const requestResult = pairingManager.requestPairing({
      clientName: "New Client",
      requestedScopes: ["scripts:list"],
      connectionId: "conn-1",
    });
    if (!requestResult.ok) return;

    const deps = makeDeps({ pairingManager });
    await handlePairingDecision(deps, { pairingId: requestResult.pairing.pairingId, approved: false });

    expect(deps.addClient).not.toHaveBeenCalled();
    expect(deps.resolvePairing).toHaveBeenCalledWith({ pairingId: requestResult.pairing.pairingId, approved: false });
  });

  it("已过期/不存在的 pairingId 静默无操作", async () => {
    const deps = makeDeps();
    await expect(handlePairingDecision(deps, { pairingId: "missing", approved: true })).resolves.toBeUndefined();
    expect(deps.addClient).not.toHaveBeenCalled();
    expect(deps.resolvePairing).not.toHaveBeenCalled();
  });

  it("原连接已断开（找不到 session）时清理配对但不抛错", async () => {
    const pairingManager = new PairingManager();
    const requestResult = pairingManager.requestPairing({
      clientName: "New Client",
      requestedScopes: ["scripts:list"],
      connectionId: "conn-1",
    });
    if (!requestResult.ok) return;

    const deps = makeDeps({ pairingManager, getSession: () => undefined });
    await handlePairingDecision(deps, { pairingId: requestResult.pairing.pairingId, approved: true });
    expect(deps.addClient).not.toHaveBeenCalled();
    expect(pairingManager.get(requestResult.pairing.pairingId)).toBeUndefined();
  });

  it("同一 pairingId 不能被批准两次（第二次因已 resolve 而找不到）", async () => {
    const pairingManager = new PairingManager();
    const requestResult = pairingManager.requestPairing({
      clientName: "New Client",
      requestedScopes: ["scripts:list"],
      connectionId: "conn-1",
    });
    if (!requestResult.ok) return;

    const deps = makeDeps({ pairingManager });
    await handlePairingDecision(deps, { pairingId: requestResult.pairing.pairingId, approved: true });
    deps.addClient.mockClear();
    deps.resolvePairing.mockClear();

    await handlePairingDecision(deps, { pairingId: requestResult.pairing.pairingId, approved: true });
    expect(deps.addClient).not.toHaveBeenCalled();
    expect(deps.resolvePairing).not.toHaveBeenCalled();
  });
});

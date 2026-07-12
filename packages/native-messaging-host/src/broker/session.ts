import { generateNonce, verifyMac } from "../auth/challenge.js";
import type { TokenStore } from "../auth/token-store.js";
import type { PairingManager } from "../auth/pairing.js";
import type { AuthFailureLockout, ConcurrencyLimiter, WindowedRateLimiter } from "./rate-limit.js";
import { WRITE_ACTIONS, type BridgeAction, type McpScope } from "../shared/protocol.js";
import type { HostToShimMessage, ShimToHostMessage } from "./messages.js";
import { isShimToHostMessage } from "./messages.js";

export type SessionPhase = "unauthenticated" | "challenged" | "ready" | "closed";

export interface BridgeCallOutcome {
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string; operationId?: string };
}

export interface SessionDeps {
  connectionId: string;
  endpointName: string;
  serverInfo: { name: string; version: string };
  tokenStore: Pick<TokenStore, "get" | "touchLastUsed">;
  pairingManager: PairingManager;
  authFailureLockout: AuthFailureLockout;
  readLimiter: WindowedRateLimiter;
  writeLimiter: WindowedRateLimiter;
  concurrencyLimiter: ConcurrencyLimiter;
  send: (message: HostToShimMessage) => void;
  // Forwards an authenticated call to the extension bridge; resolves with its response.
  dispatchBridgeCall: (clientId: string, action: BridgeAction, input: unknown) => Promise<BridgeCallOutcome>;
  // Surfaces a new pairing request to the extension (opens the pairing dialog). The actual
  // approve/reject decision arrives later, out of band, via `resolvePairing`.
  onPairingRequested: (params: {
    pairingId: string;
    clientName: string;
    requestedScopes: McpScope[];
    code: string;
  }) => void;
}

/**
 * Owns one socket connection's protocol state machine: handshake, pairing, and steady-state call
 * dispatch. Pure protocol logic — actual socket I/O (framing into lines, writing bytes) lives in
 * broker/server.ts, which feeds this class one parsed JSON message at a time via `onMessage` and
 * receives outbound messages via the injected `send`.
 */
export class SessionHandler {
  private phase: SessionPhase = "unauthenticated";
  private clientId: string | undefined;
  private scopes: McpScope[] = [];
  private pendingNonce: string | undefined;

  constructor(private readonly deps: SessionDeps) {}

  getPhase(): SessionPhase {
    return this.phase;
  }

  getClientId(): string | undefined {
    return this.clientId;
  }

  close(): void {
    this.phase = "closed";
  }

  async onMessage(raw: unknown): Promise<void> {
    if (this.phase === "closed") return;
    if (!isShimToHostMessage(raw)) {
      this.deny("INVALID_REQUEST");
      return;
    }
    const message = raw as ShimToHostMessage;

    switch (message.t) {
      case "hello":
        await this.handleHello(message);
        return;
      case "auth":
        await this.handleAuth(message);
        return;
      case "pair":
        this.handlePair(message);
        return;
      case "call":
        await this.handleCall(message);
        return;
    }
  }

  /** Called by the broker once the extension has decided a pairing request (out of band). */
  resolvePairing(params: {
    pairingId: string;
    approved: boolean;
    clientId?: string;
    token?: string;
    grantedScopes?: McpScope[];
  }): void {
    this.deps.pairingManager.resolve(params.pairingId);
    this.deps.send({
      t: "pair_result",
      approved: params.approved,
      clientId: params.clientId,
      token: params.token,
      grantedScopes: params.grantedScopes,
    });
  }

  private async handleHello(message: Extract<ShimToHostMessage, { t: "hello" }>): Promise<void> {
    if (this.deps.authFailureLockout.isLockedOut(this.deps.endpointName)) {
      this.deny("RATE_LIMITED");
      return;
    }
    if (!message.clientId) {
      // A `hello` with no clientId signals "wants pairing", but pairing actually happens via a
      // dedicated `pair` message (see handlePair) rather than continuing this handshake. A hello
      // with no clientId can't proceed down the authenticated handshake, so we guide the shim to
      // the pairing flow instead of silently hanging.
      this.deny("UNAUTHENTICATED");
      return;
    }
    this.clientId = message.clientId;
    this.pendingNonce = generateNonce();
    this.phase = "challenged";
    this.deps.send({ t: "challenge", nonce: this.pendingNonce });
  }

  private async handleAuth(message: Extract<ShimToHostMessage, { t: "auth" }>): Promise<void> {
    if (this.phase !== "challenged" || !this.pendingNonce || message.clientId !== this.clientId) {
      this.deny("INVALID_REQUEST");
      return;
    }
    const stored = this.deps.tokenStore.get(message.clientId);
    if (!stored || stored.revoked) {
      this.recordAuthFailure();
      this.deny("UNAUTHENTICATED");
      return;
    }
    const valid = verifyMac(stored.tokenHash, this.pendingNonce, this.deps.endpointName, message.mac);
    if (!valid) {
      this.recordAuthFailure();
      this.deny("UNAUTHENTICATED");
      return;
    }

    this.deps.authFailureLockout.recordSuccess(this.deps.endpointName);
    this.scopes = stored.scopes;
    this.phase = "ready";
    await this.deps.tokenStore.touchLastUsed(this.clientId!);
    this.deps.send({
      t: "ready",
      scopes: this.scopes,
      serverInfo: this.deps.serverInfo,
    });
  }

  private recordAuthFailure(): void {
    this.deps.authFailureLockout.recordFailure(this.deps.endpointName);
  }

  private handlePair(message: Extract<ShimToHostMessage, { t: "pair" }>): void {
    const result = this.deps.pairingManager.requestPairing({
      clientName: message.clientName,
      requestedScopes: message.requestedScopes,
      connectionId: this.deps.connectionId,
    });
    if (!result.ok) {
      this.deny(result.reason === "RATE_LIMITED" ? "RATE_LIMITED" : "INVALID_REQUEST");
      return;
    }
    this.deps.send({ t: "pair_pending", pairingId: result.pairing.pairingId, code: result.pairing.code });
    this.deps.onPairingRequested({
      pairingId: result.pairing.pairingId,
      clientName: result.pairing.clientName,
      requestedScopes: result.pairing.requestedScopes,
      code: result.pairing.code,
    });
  }

  private async handleCall(message: Extract<ShimToHostMessage, { t: "call" }>): Promise<void> {
    if (this.phase !== "ready" || !this.clientId) {
      this.sendResult(message.id, { ok: false, error: { code: "UNAUTHENTICATED", message: "not authenticated" } });
      return;
    }

    const isWrite = WRITE_ACTIONS.includes(message.action);
    const limiter = isWrite ? this.deps.writeLimiter : this.deps.readLimiter;
    const rate = limiter.check(this.clientId);
    if (!rate.allowed) {
      this.sendResult(message.id, {
        ok: false,
        error: { code: "RATE_LIMITED", message: `retry after ${rate.retryAfterSeconds}s` },
      });
      return;
    }

    if (!this.deps.concurrencyLimiter.tryAcquire(this.clientId)) {
      this.sendResult(message.id, { ok: false, error: { code: "RATE_LIMITED", message: "too many concurrent calls" } });
      return;
    }

    try {
      const outcome = await this.deps.dispatchBridgeCall(this.clientId, message.action, message.input);
      this.sendResult(message.id, outcome);
    } finally {
      this.deps.concurrencyLimiter.release(this.clientId);
    }
  }

  private sendResult(id: string, outcome: BridgeCallOutcome): void {
    if (outcome.ok) {
      this.deps.send({ t: "result", id, ok: true, result: outcome.result });
    } else {
      this.deps.send({
        t: "result",
        id,
        ok: false,
        error: outcome.error ?? { code: "INTERNAL_ERROR", message: "unknown error" },
      });
    }
  }

  private deny(code: string): void {
    this.deps.send({ t: "deny", code });
  }
}

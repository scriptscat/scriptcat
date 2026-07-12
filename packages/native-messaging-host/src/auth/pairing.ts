import * as crypto from "node:crypto";
import { LIMITS } from "../shared/limits.js";
import type { McpScope } from "../shared/protocol.js";

const CLIENT_NAME_MAX_LENGTH = 64;
// Excludes visually ambiguous characters (0/O, 1/I/L) since the user cross-checks this code by
// eye against the shim's terminal output (doc 03 §4).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface PendingPairing {
  pairingId: string;
  code: string;
  clientName: string;
  requestedScopes: McpScope[];
  createdAt: number;
  expiresAt: number;
  connectionId: string;
}

export type RequestPairingResult =
  | { ok: true; pairing: PendingPairing }
  | { ok: false; reason: "RATE_LIMITED" | "PENDING_PAIRING_EXISTS" | "CLIENT_NAME_INVALID" };

function generateCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function isPrintable(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x1f\x7f]/.test(value);
}

/**
 * Tracks in-flight pairing requests (doc 03 §4 "Pairing (first run)"). Purely in-memory — a
 * host restart requires clients to re-pair, which is fine since pairings are short-lived
 * (2 min TTL) and this is not where long-term client identity lives (that's TokenStore).
 */
export class PairingManager {
  private pending = new Map<string, PendingPairing>();
  private globalAttemptTimestamps: number[] = [];
  private pendingCountByConnection = new Map<string, number>();

  requestPairing(params: {
    clientName: string;
    requestedScopes: McpScope[];
    connectionId: string;
  }): RequestPairingResult {
    if (
      params.clientName.length === 0 ||
      params.clientName.length > CLIENT_NAME_MAX_LENGTH ||
      !isPrintable(params.clientName)
    ) {
      return { ok: false, reason: "CLIENT_NAME_INVALID" };
    }

    this.pruneGlobalAttempts();
    if (this.globalAttemptTimestamps.length >= LIMITS.pairingAttemptsPerHourGlobal) {
      return { ok: false, reason: "RATE_LIMITED" };
    }
    if ((this.pendingCountByConnection.get(params.connectionId) ?? 0) >= LIMITS.pairingPendingPerConnection) {
      return { ok: false, reason: "PENDING_PAIRING_EXISTS" };
    }

    const now = Date.now();
    const pairing: PendingPairing = {
      pairingId: crypto.randomUUID(),
      code: generateCode(),
      clientName: params.clientName,
      requestedScopes: params.requestedScopes,
      createdAt: now,
      expiresAt: now + LIMITS.pairingTtlMs,
      connectionId: params.connectionId,
    };
    this.pending.set(pairing.pairingId, pairing);
    this.globalAttemptTimestamps.push(now);
    this.pendingCountByConnection.set(
      params.connectionId,
      (this.pendingCountByConnection.get(params.connectionId) ?? 0) + 1
    );
    return { ok: true, pairing };
  }

  /** Returns the pairing if it exists and hasn't expired; expired entries are swept lazily. */
  get(pairingId: string): PendingPairing | undefined {
    const pairing = this.pending.get(pairingId);
    if (!pairing) return undefined;
    if (Date.now() >= pairing.expiresAt) {
      this.remove(pairing);
      return undefined;
    }
    return pairing;
  }

  /** Terminal transition (approved or rejected) — the pairing can never be re-approved after. */
  resolve(pairingId: string): void {
    const pairing = this.pending.get(pairingId);
    if (pairing) this.remove(pairing);
  }

  private remove(pairing: PendingPairing): void {
    this.pending.delete(pairing.pairingId);
    const count = this.pendingCountByConnection.get(pairing.connectionId) ?? 0;
    this.pendingCountByConnection.set(pairing.connectionId, Math.max(0, count - 1));
  }

  private pruneGlobalAttempts(): void {
    const cutoff = Date.now() - 60 * 60_000;
    this.globalAttemptTimestamps = this.globalAttemptTimestamps.filter((t) => t > cutoff);
  }
}

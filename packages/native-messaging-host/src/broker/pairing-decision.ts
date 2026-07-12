import * as crypto from "node:crypto";
import { generateToken, hashToken, type TokenStore } from "../auth/token-store.js";
import type { PairingManager } from "../auth/pairing.js";
import type { SessionHandler } from "./session.js";
import type { McpScope } from "../shared/protocol.js";

export interface PairDecisionPayload {
  pairingId: string;
  approved: boolean;
  grantedScopes?: McpScope[];
  clientId?: string;
  displayName?: string;
}

export interface PairingDecisionDeps {
  pairingManager: Pick<PairingManager, "get" | "resolve">;
  tokenStore: Pick<TokenStore, "addClient">;
  getSession: (connectionId: string) => SessionHandler | undefined;
}

/**
 * Applies an extension-side `pair.decision` (doc 03 §2) to the pairing state and, on approval,
 * mints the client's token (doc 03 §4 "On approval the host issues a 256-bit random token;
 * stores only SHA-256(token) + client record") — the raw token is handed to `resolvePairing`
 * exactly once, over the already-authenticated local socket, and never persisted.
 *
 * Silently no-ops if the pairing has already expired/resolved, or if the originating connection
 * has since disconnected — there's nothing meaningful left to notify.
 */
export async function handlePairingDecision(deps: PairingDecisionDeps, payload: PairDecisionPayload): Promise<void> {
  const pairing = deps.pairingManager.get(payload.pairingId);
  if (!pairing) return;

  const session = deps.getSession(pairing.connectionId);
  if (!session) {
    deps.pairingManager.resolve(payload.pairingId);
    return;
  }

  if (!payload.approved) {
    session.resolvePairing({ pairingId: payload.pairingId, approved: false });
    return;
  }

  const clientId = payload.clientId ?? crypto.randomUUID();
  const token = generateToken();
  const grantedScopes = payload.grantedScopes ?? [];
  const now = Date.now();

  await deps.tokenStore.addClient({
    clientId,
    displayName: payload.displayName ?? pairing.clientName,
    tokenHash: hashToken(token),
    scopes: grantedScopes,
    createdAt: now,
    lastUsedAt: now,
  });

  session.resolvePairing({ pairingId: payload.pairingId, approved: true, clientId, token, grantedScopes });
}

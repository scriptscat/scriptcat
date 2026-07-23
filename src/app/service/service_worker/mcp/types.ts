/**
 * Extension-side mirror of the MCP bridge protocol.
 *
 * The wire constants live in protocol.json (this directory), which is the single source of truth
 * shared byte-for-byte with the sctl daemon repo. This module is the strongly-typed mirror; the
 * two are kept from drifting by protocol.conformance.test.ts.
 *
 * Full protocol spec: PROTOCOL.md in the sctl repo (mirrored under docs/superpowers/specs).
 */

export const PROTOCOL_VERSION = 1;

// Minimum sctl daemon version the extension will talk to; below this the controller reports
// status "host_outdated" and refuses to dispatch bridge calls.
export const MIN_DAEMON_VERSION = "0.1.0";

// ---------------------------------------------------------------------------------------------
// Layer 1 — ext <-> daemon envelope types (WS transport)
// ---------------------------------------------------------------------------------------------
// Kept in sync with protocol.json (envelopeTypes) via protocol.conformance.test.ts. The offscreen
// WS client owns the socket and relays decoded envelopes to/from the SW controller.

export const WS_MESSAGE_TYPES = [
  "auth.challenge",
  "auth.response",
  "auth.ok",
  "hello",
  "bridge.request",
  "bridge.response",
  "bridge.cancel",
  "pair.request",
  "pair.decision",
  "client.revoke",
  "client.sync",
  "ping",
  "pong",
  "bridge.shutdown",
] as const;

export type WSMessageType = (typeof WS_MESSAGE_TYPES)[number];

export interface WSEnvelope<TPayload = unknown> {
  v: 1;
  type: WSMessageType;
  requestId: string;
  payload: TPayload;
}

// The two auth modes carried by auth.response.mode (PROTOCOL §3.1 session / §3.2 pairing).
export type AuthMode = "session" | "pairing";

// daemon->ext, opens every connection: nonceD is a 32-byte random challenge, lowercase hex.
export interface AuthChallengePayload {
  nonceD: string;
}

// ext->daemon: the extension's nonceE plus HMAC(key, ctx || nonceD || nonceE). `key` is the
// long-term K in session mode, or the code-derived Kp_mac in pairing mode.
export interface AuthResponsePayload {
  mode: AuthMode;
  nonceE: string;
  hmac: string;
}

// daemon->ext: HMAC(key, ctx || nonceE || nonceD) proving the daemon also holds the key. In
// pairing mode it additionally ships the freshly minted long-term K, AES-256-GCM encrypted under
// the code-derived Kp_enc.
export interface AuthOkPayload {
  hmac: string;
  key?: { ciphertext: string; iv: string };
}

// daemon->ext, sent once immediately after the auth handshake completes, so the extension can
// compare daemonVersion against MIN_DAEMON_VERSION before dispatching any bridge call.
export interface HelloPayload {
  daemonVersion: string;
  protocolVersion: typeof PROTOCOL_VERSION;
}

// host->ext, a new shim asked to pair. `code` is the 8-char verification string the user
// cross-checks against the shim's own terminal output.
export interface PairRequestPayload {
  pairingId: string;
  clientName: string;
  requestedScopes: McpScope[];
  code: string;
}

// ext->host, the human's decision. On approval the host mints clientId/token and reports the
// authoritative record back via a subsequent `client.sync` — this payload never carries a token.
export interface PairDecisionPayload {
  pairingId: string;
  approved: boolean;
  grantedScopes: McpScope[];
}

// host->ext, full client list after any host-side change (new pairing, revoke, scope edit).
// The host is the authority on tokenHash/scopes/revoked; the extension mirrors it verbatim.
export type ClientSyncPayload = McpClientRecord[];

export interface McpClientRecord {
  clientId: string;
  displayName: string;
  tokenHash: string;
  scopes: McpScope[];
  createdAt: number;
  lastUsedAt: number;
  revoked: boolean;
}

// ---------------------------------------------------------------------------------------------
// Layer 1.5 — bridge actions
// ---------------------------------------------------------------------------------------------

export const MCP_SCOPES = [
  "scripts:list",
  "scripts:metadata:read",
  "scripts:source:read",
  "scripts:install:request",
  "scripts:toggle:request",
  "scripts:delete:request",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const BRIDGE_ACTIONS = [
  "scripts.list",
  "scripts.metadata.get",
  "scripts.source.get",
  "scripts.install.request",
  "scripts.toggle.request",
  "scripts.delete.request",
] as const;

export type BridgeAction = (typeof BRIDGE_ACTIONS)[number];

export const BRIDGE_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHENTICATED",
  "INSUFFICIENT_SCOPE",
  "WRITE_MODE_DISABLED",
  "USER_APPROVAL_REQUIRED",
  "USER_REJECTED",
  "OPERATION_EXPIRED",
  "CONFLICT",
  "NOT_FOUND",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
] as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

export const OPERATION_KINDS = ["install", "update", "enable", "disable", "delete", "source_disclosure"] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];

export const OPERATION_STATUSES = ["awaiting_user", "approved", "rejected", "expired", "cancelled", "failed"] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export interface McpBridgeRequest<TInput = unknown> {
  // 线上 payload 不含此字段（PROTOCOL §4：requestId 属于 envelope 层）；由 McpController 从
  // envelope 注入，供下游关联挂起操作与回发应答。
  requestId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
  clientId: string;
  action: BridgeAction;
  input: TInput;
}

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
  operationId?: string;
}

export type McpBridgeResponse<TResult = unknown> =
  | { requestId: string; ok: true; result: TResult }
  | { requestId: string; ok: false; error: BridgeError };

// ---------------------------------------------------------------------------------------------
// Shared result/input shapes
// ---------------------------------------------------------------------------------------------

export type ScriptType = "normal" | "crontab" | "background";

export interface ScriptSummary {
  uuid: string;
  name: string;
  namespace: string;
  version?: string;
  author?: string;
  description?: string;
  type: ScriptType;
  enabled: boolean;
  updatedAt: string;
  hasUpdateUrl: boolean;
}

export interface ScriptMetadata extends ScriptSummary {
  matches: string[];
  includes: string[];
  excludes: string[];
  grants: string[];
  connects: string[];
  requires: string[];
  resources: string[];
  runAt?: string;
  crontab?: string;
}

export interface ScriptSource {
  uuid: string;
  name: string;
  version?: string;
  code: string;
  sha256: string;
  contentTrust: "untrusted-user-script-source";
}

export interface PendingOperationRef {
  operationId: string;
  status: "awaiting_user";
  kind: OperationKind;
  expiresAt: string;
}

export interface OperationStatusResult {
  operationId: string;
  kind: OperationKind;
  status: OperationStatus;
  resultSummary?: { uuid?: string; name?: string; enabled?: boolean };
  errorCode?: BridgeErrorCode;
}

// Row shape for the "待确认" reopen entry (§5.1 误关重开入口): the still-pending ops the user can
// re-open a confirm page for. No client name — approval is channel-based only (design §3.0.1).
export interface PendingOperationSummary {
  operationId: string;
  kind: OperationKind;
  createdAt: number;
}

export const ACTION_REQUIRED_SCOPE: Record<BridgeAction, McpScope> = {
  "scripts.list": "scripts:list",
  "scripts.metadata.get": "scripts:metadata:read",
  "scripts.source.get": "scripts:source:read",
  "scripts.install.request": "scripts:install:request",
  "scripts.toggle.request": "scripts:toggle:request",
  "scripts.delete.request": "scripts:delete:request",
} as const;

export const WRITE_ACTIONS: readonly BridgeAction[] = [
  "scripts.install.request",
  "scripts.toggle.request",
  "scripts.delete.request",
] as const;

// ---------------------------------------------------------------------------------------------
// Extension-only types — not part of the wire protocol, just UI/controller state. Persisted
// entities (McpClient, McpOperation, McpAuditEvent) live in src/app/repo/mcp.ts alongside their
// DAOs (repo convention: entity + DAO in one file); this status enum stays here because it's
// derived controller state, never written to storage.
// ---------------------------------------------------------------------------------------------

export type McpBridgeStatus =
  | "disabled"
  | "pending_enrollment"
  | "connecting"
  | "connected"
  | "host_unreachable"
  | "host_outdated";

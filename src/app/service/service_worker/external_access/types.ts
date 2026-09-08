/**
 * Extension-side mirror of the sctl bridge protocol.
 *
 * The protocol constants are generated from sctl/internal/pkg/protocol/protocol.json, the single source of truth
 * shared byte-for-byte with the sctl daemon repo. This module is the strongly-typed mirror; the
 * two are kept from drifting by protocol.conformance.test.ts.
 *
 * Full protocol spec: PROTOCOL.md in the sctl repo (mirrored under docs/superpowers/specs).
 */

export const JSONRPC_VERSION = "2.0" as const;

// ---------------------------------------------------------------------------------------------
// JSON-RPC 2.0 messages carried by the extension-daemon WebSocket.
// ---------------------------------------------------------------------------------------------
// The offscreen client owns the socket and relays decoded messages to/from the service worker.

export const SESSION_METHODS = [
  "$session.authenticate",
  "$session.authenticated",
  "$session.hello",
  "$session.capabilities",
  "$session.ping",
  "$session.shutdown",
  "$/cancelRequest",
] as const;

export interface JSONRPCError {
  code: number;
  message: string;
  data?: { code: BridgeErrorCode; operationId?: string };
}

export interface WSEnvelope<TParams = unknown, TResult = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  id?: string;
  method?: string;
  params?: TParams;
  result?: TResult;
  error?: JSONRPCError;
}

// The two authentication modes returned from $session.authenticate.
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

// daemon->ext, sent once immediately after the auth handshake completes for diagnostics.
export interface HelloPayload {
  daemonVersion: string;
}

// ---------------------------------------------------------------------------------------------
// Layer 2 — bridge actions (capability RPC)
// ---------------------------------------------------------------------------------------------

export const EXTERNAL_ACCESS_SCOPES = [
  "scripts:list",
  "scripts:metadata:read",
  "scripts:source:read",
  "scripts:install:request",
  "scripts:toggle:request",
  "scripts:delete:request",
  "scripts:edit:request",
] as const;

export type ExternalAccessScope = (typeof EXTERNAL_ACCESS_SCOPES)[number];

// Adding a capability: add the method to the sctl schema, then map it here and in
// ACTION_REQUIRED_SCOPE (and EXTERNAL_ACCESS_SCOPES if it needs a new one),
// list it in WRITE_ACTIONS if it mutates, then handle it in the bridge. protocol.conformance.test.ts
// fails until both sides agree.
export const BRIDGE_ACTIONS = [
  "scripts.list",
  "scripts.metadata.get",
  "scripts.source.get",
  "scripts.source.grep",
  "scripts.install.request",
  "scripts.toggle.request",
  "scripts.delete.request",
  "scripts.edit.request",
] as const;

export type BridgeAction = (typeof BRIDGE_ACTIONS)[number];

export const BRIDGE_ERROR_CODES = [
  "INVALID_REQUEST",
  "METHOD_NOT_FOUND",
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

export interface ExternalAccessBridgeRequest<TInput = unknown> {
  requestId: string;
  clientId: string;
  action: BridgeAction;
  input: TInput;
}

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
  operationId?: string;
}

export type ExternalAccessBridgeResponse<TResult = unknown> =
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
  // Line window actually returned (design §4.1): defaults to the whole file ([1, totalLines]) when
  // the request carried no startLine/endLine. sha256 above is always the whole-file hash, even for
  // a window, so a client can tell the underlying script changed across paginated reads.
  startLine: number;
  endLine: number;
  totalLines: number;
}

// One `scripts.source.grep` hit. before/after are context lines (design §4.2); each match's context
// is computed independently, so overlapping windows around adjacent hits repeat lines on purpose.
export interface ScriptSourceGrepMatch {
  lineNumber: number;
  line: string;
  before: string[];
  after: string[];
}

export interface ScriptSourceGrepResult {
  uuid: string;
  name: string;
  version?: string;
  matches: ScriptSourceGrepMatch[];
  totalMatches: number;
  truncated: boolean;
  skippedLongLines: number;
  totalLines: number;
  sha256: string;
  contentTrust: "untrusted-user-script-source";
}

// Which disclosure a pending `source_disclosure` operation will answer with (design §4.2 "挂起态的
// 区分"): scripts.source.get and scripts.source.grep share one OperationKind, one scope and one
// sessionAllowKey, so this is what the request-time dedup and the decide-time result-producing
// branch key off of instead. Two pending requests only collapse into one operation when both the
// form and its parameters match exactly.
export type SourceDisclosureForm =
  | { form: "full"; startLine?: number; endLine?: number; maxBytes?: number }
  | {
      form: "grep";
      query: string;
      mode: "text" | "regex";
      ignoreCase: boolean;
      contextLines: number;
      maxMatches: number;
    };

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

export const ACTION_REQUIRED_SCOPE: Record<BridgeAction, ExternalAccessScope> = {
  "scripts.list": "scripts:list",
  "scripts.metadata.get": "scripts:metadata:read",
  "scripts.source.get": "scripts:source:read",
  // grep is source disclosure too — same scope, same gate, no dedicated scope (design §3 决策 13).
  "scripts.source.grep": "scripts:source:read",
  "scripts.install.request": "scripts:install:request",
  "scripts.toggle.request": "scripts:toggle:request",
  "scripts.delete.request": "scripts:delete:request",
  "scripts.edit.request": "scripts:edit:request",
} as const;

export const WRITE_ACTIONS: readonly BridgeAction[] = [
  "scripts.install.request",
  "scripts.toggle.request",
  "scripts.delete.request",
  "scripts.edit.request",
] as const;

// ---------------------------------------------------------------------------------------------
// Extension-only types — not part of the wire protocol, just UI/controller state. The persisted
// ExternalAccessOperation entity lives in src/app/repo/external_access.ts alongside its DAO (repo
// convention: entity + DAO in one file), and the audit event type in ./audit.ts; this status enum
// stays here because it's derived controller state, never written to storage.
// ---------------------------------------------------------------------------------------------

export type ExternalAccessBridgeStatus =
  | "disabled"
  | "pending_enrollment"
  | "connecting"
  | "connected"
  | "host_unreachable";

// getStatus / ExternalAccessStatusChanged payload: the bare status plus the daemon version reported
// by the hello handshake. daemonVersion is only carried while connected; the status bar renders it
// as "sctl v{daemonVersion}".
export interface ExternalAccessBridgeStatusInfo {
  status: ExternalAccessBridgeStatus;
  daemonVersion?: string;
}

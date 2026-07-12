/**
 * Extension-side mirror of the MCP bridge protocol.
 *
 * Intentionally NOT imported from packages/native-messaging-host/src/shared/protocol.ts — the
 * two packages don't share a build graph (the host package is standalone, its own lockfile,
 * built/tested by its own CI job). Kept in sync via protocol.conformance.test.ts, which imports
 * both modules and compares their literal unions.
 *
 * Spec: workspace/.ref-docs/03-protocol-spec.md §2-3 (gitignored reference doc).
 */

export const PROTOCOL_VERSION = 1;

// Minimum native-host package version the extension will talk to; below this the controller
// reports status "host_outdated" and refuses to dispatch bridge calls.
export const MIN_HOST_VERSION = "0.1.0";

// ---------------------------------------------------------------------------------------------
// Layer 1 — browser <-> native host envelope types
// ---------------------------------------------------------------------------------------------

export const NATIVE_MESSAGE_TYPES = [
  "hello",
  "bridge.request",
  "bridge.response",
  "pair.request",
  "pair.decision",
  "client.revoke",
  "client.sync",
  "operations.changed",
  "ping",
  "pong",
  "bridge.shutdown",
] as const;

export type NativeMessageType = (typeof NATIVE_MESSAGE_TYPES)[number];

export interface NativeEnvelope<TPayload = unknown> {
  v: 1;
  type: NativeMessageType;
  requestId: string;
  payload: TPayload;
}

// host->ext, sent once immediately after the native port connects (doc 03 §6 versioning).
export interface HelloPayload {
  hostVersion: string;
}

// host->ext, a new shim asked to pair (doc 03 §4 "Pairing (first run)"). `code` is the 8-char
// verification string the user cross-checks against the shim's own terminal output.
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
  "scripts.install.prepare",
  "scripts.toggle.request",
  "scripts.delete.request",
  "operations.get",
  "operations.list",
  "operations.cancel",
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

export const ACTION_REQUIRED_SCOPE: Record<BridgeAction, McpScope> = {
  "scripts.list": "scripts:list",
  "scripts.metadata.get": "scripts:metadata:read",
  "scripts.source.get": "scripts:source:read",
  "scripts.install.prepare": "scripts:install:request",
  "scripts.toggle.request": "scripts:toggle:request",
  "scripts.delete.request": "scripts:delete:request",
  "operations.get": "scripts:install:request",
  "operations.list": "scripts:install:request",
  "operations.cancel": "scripts:install:request",
} as const;

export const WRITE_ACTIONS: readonly BridgeAction[] = [
  "scripts.install.prepare",
  "scripts.toggle.request",
  "scripts.delete.request",
] as const;

// ---------------------------------------------------------------------------------------------
// Extension-only types (doc 02 §3, doc 04 §4, doc 04 §9) — not part of the wire protocol, but
// colocated here per the "types.ts" slice; entities move to src/app/repo/mcp.ts in the next
// commit alongside their DAOs (repo convention: entity + DAO in one file). Declared here first
// so bridge/approval code in that commit can import a single mcp/types.ts for wire + entity
// shapes without a circular dependency on the repo layer.
// ---------------------------------------------------------------------------------------------

export type McpBridgeStatus = "disabled" | "connecting" | "connected" | "host_unreachable" | "host_outdated";

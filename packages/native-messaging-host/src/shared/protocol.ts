/**
 * MCP bridge protocol — single normative source for the browser<->host native-messaging
 * envelope and the host<->extension bridge action vocabulary.
 *
 * Full prose spec: packages/native-messaging-host/PROTOCOL.md (this file is the typed source of
 * truth; PROTOCOL.md documents the same shapes in prose for a human reader).
 *
 * The extension keeps an independently-typed mirror at
 * src/app/service/service_worker/mcp/types.ts rather than importing this file, so the two
 * packages never share a build graph; a conformance test compares the literal unions exported
 * here against the extension's copy to catch drift (see mcp/protocol.conformance.test.ts).
 */

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------------------------
// Layer 1 — browser <-> native host (Chrome Native Messaging) envelope types
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

// host->ext, sent once immediately after the native port connects, so the extension can compare
// hostVersion against its own MIN_HOST_VERSION before dispatching any bridge call.
export interface HelloPayload {
  hostVersion: string;
}

// ---------------------------------------------------------------------------------------------
// Layer 1.5 — bridge actions (the security-relevant vocabulary carried inside
// bridge.request / bridge.response)
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
  // Host-injected from the authenticated broker session — a shim can never set this itself.
  clientId: string;
  action: BridgeAction;
  input: TInput;
}

export interface BridgeError {
  code: BridgeErrorCode;
  // Stable, user-facing message: no filesystem paths, no stack traces.
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
  updatedAt: string; // ISO-8601
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
  expiresAt: string; // ISO-8601, createdAt + 5 min
}

export interface OperationStatusResult {
  operationId: string;
  kind: OperationKind;
  status: OperationStatus;
  resultSummary?: { uuid?: string; name?: string; enabled?: boolean };
  errorCode?: BridgeErrorCode;
}

// ---------------------------------------------------------------------------------------------
// Per-action input/result schemas
// ---------------------------------------------------------------------------------------------

export type ScriptsListInput = Record<string, never>;
export interface ScriptsListResult {
  scripts: ScriptSummary[];
  contentTrust: "untrusted-user-script-metadata";
}

export interface ScriptsMetadataGetInput {
  uuid: string;
}
export type ScriptsMetadataGetResult = ScriptMetadata & { contentTrust: "untrusted-user-script-metadata" };

export interface ScriptsSourceGetInput {
  uuid: string;
}
export type ScriptsSourceGetResult = ScriptSource;

export interface ScriptsInstallPrepareInput {
  url?: string;
  code?: string;
}
export type ScriptsInstallPrepareResult = PendingOperationRef;

export interface ScriptsToggleRequestInput {
  uuid: string;
  enable: boolean;
}
export type ScriptsToggleRequestResult = PendingOperationRef;

export interface ScriptsDeleteRequestInput {
  uuid: string;
}
export type ScriptsDeleteRequestResult = PendingOperationRef;

export interface OperationsGetInput {
  operationId: string;
}
export type OperationsGetResult = OperationStatusResult;

export type OperationsListInput = Record<string, never>;
export interface OperationsListResult {
  operations: OperationStatusResult[];
}

export interface OperationsCancelInput {
  operationId: string;
}
export interface OperationsCancelResult {
  operationId: string;
  status: "cancelled";
}

/** Maps each bridge action to its strict input/result pair; drives exhaustive dispatch tables. */
export interface BridgeActionSchema {
  "scripts.list": { input: ScriptsListInput; result: ScriptsListResult };
  "scripts.metadata.get": { input: ScriptsMetadataGetInput; result: ScriptsMetadataGetResult };
  "scripts.source.get": { input: ScriptsSourceGetInput; result: ScriptsSourceGetResult };
  "scripts.install.prepare": { input: ScriptsInstallPrepareInput; result: ScriptsInstallPrepareResult };
  "scripts.toggle.request": { input: ScriptsToggleRequestInput; result: ScriptsToggleRequestResult };
  "scripts.delete.request": { input: ScriptsDeleteRequestInput; result: ScriptsDeleteRequestResult };
  "operations.get": { input: OperationsGetInput; result: OperationsGetResult };
  "operations.list": { input: OperationsListInput; result: OperationsListResult };
  "operations.cancel": { input: OperationsCancelInput; result: OperationsCancelResult };
}

// ---------------------------------------------------------------------------------------------
// Scope required per action — used by both the host broker and the extension bridge for
// defense-in-depth authorization checks (each side checks independently rather than trusting
// the other's claim).
// ---------------------------------------------------------------------------------------------

export const ACTION_REQUIRED_SCOPE: Record<BridgeAction, McpScope> = {
  "scripts.list": "scripts:list",
  "scripts.metadata.get": "scripts:metadata:read",
  "scripts.source.get": "scripts:source:read",
  "scripts.install.prepare": "scripts:install:request",
  "scripts.toggle.request": "scripts:toggle:request",
  "scripts.delete.request": "scripts:delete:request",
  // Operation-plumbing actions require ownership of the operation, not a fixed scope; any write
  // scope suffices at the catalog-visibility level, host/extension re-check ownership per-call.
  "operations.get": "scripts:install:request",
  "operations.list": "scripts:install:request",
  "operations.cancel": "scripts:install:request",
} as const;

/** Write actions that require the session-only "allow write requests" flag to be on. */
export const WRITE_ACTIONS: readonly BridgeAction[] = [
  "scripts.install.prepare",
  "scripts.toggle.request",
  "scripts.delete.request",
] as const;

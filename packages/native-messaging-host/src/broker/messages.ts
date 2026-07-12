// Layer 2 — shim <-> host local socket protocol. Purely internal to this package; never
// crosses to the extension, so unlike shared/protocol.ts these types aren't mirrored anywhere.

import type { BridgeAction, McpScope } from "../shared/protocol.js";

export type ShimToHostMessage =
  | { t: "hello"; v: 1; clientId?: string }
  | { t: "auth"; clientId: string; mac: string }
  | { t: "pair"; v: 1; clientName: string; requestedScopes: McpScope[] }
  | { t: "call"; id: string; action: BridgeAction; input: unknown };

export type HostToShimMessage =
  | { t: "challenge"; nonce: string }
  | { t: "ready"; scopes: McpScope[]; serverInfo: { name: string; version: string } }
  | { t: "deny"; code: string }
  | { t: "pair_pending"; pairingId: string; code: string }
  | { t: "pair_result"; approved: boolean; clientId?: string; token?: string; grantedScopes?: McpScope[] }
  | { t: "result"; id: string; ok: true; result: unknown }
  | { t: "result"; id: string; ok: false; error: { code: string; message: string; operationId?: string } }
  | { t: "event"; event: "operations.changed" | "scopes.changed" | "bridge.offline"; data: unknown };

export function isShimToHostMessage(value: unknown): value is ShimToHostMessage {
  return typeof value === "object" && value !== null && typeof (value as { t?: unknown }).t === "string";
}

# ScriptCat MCP Bridge Protocol

Three layers, bottom-up: (1) browser ↔ native host, (2) shim ↔ host local socket, (3) agent-facing
MCP tool/resource catalog. All identifiers below are normative — implementation and tests both key
off this document; `src/app/service/service_worker/mcp/types.ts` (extension) and
`src/shared/protocol.ts` (this package) are independently-maintained mirrors, kept in sync by
`protocol.conformance.test.ts` on the extension side.

## Conventions

- All IDs (`requestId`, `operationId`, `clientId`, `pairingId`, session nonces) are cryptographically
  random — `crypto.randomUUID()` or 32 random hex bytes. Sequential IDs are never used.
- Timestamps are Unix milliseconds internally.
- All schemas are strict: unknown properties are rejected (zod `.strict()` in the shim/host; manual
  key allow-lists in the extension bridge, `src/app/service/service_worker/mcp/bridge.ts`).
- `protocolVersion: 1` appears in every bridge envelope.

## Layer 1 — Browser ↔ native host (Chrome native messaging)

Standard Chrome framing: 4-byte little-endian length prefix + UTF-8 JSON
(`src/native/framing.ts`). Oversize or malformed frames are skipped in streaming mode — never by
resetting the whole buffer, which would desynchronize the stream.

Host startup validates `process.argv`'s caller origin against `allowed_origins` in its own config
before opening the IPC endpoint (`src/native/origin.ts`); mismatch → exit 1.

| type | direction | purpose |
|---|---|---|
| `hello` | host→ext | `{ hostVersion }`, sent once on connect |
| `bridge.request` / `bridge.response` | host→ext / ext→host | wraps a Layer 1.5 request/response |
| `pair.request` | host→ext | `{ pairingId, clientName, requestedScopes, code }` |
| `pair.decision` | ext→host | `{ pairingId, approved, grantedScopes }` |
| `client.revoke` | ext→host | `{ clientId }` — host drops the session and token hash |
| `client.sync` | host→ext | full client list (host is the authority on `tokenHash`) |
| `ping` / `pong` | host↔ext | keepalive, 20s interval |
| `bridge.shutdown` | ext→host | graceful stop (user disabled MCP) |

Envelope: `{ v: 1, type: string, requestId: string, payload: object }`.

## Layer 1.5 — Bridge actions

```typescript
type McpBridgeRequest = {
  requestId: string;
  protocolVersion: 1;
  clientId: string; // host-injected from the authenticated session, never from shim input
  action:
    | "scripts.list"
    | "scripts.metadata.get"
    | "scripts.source.get"
    | "scripts.install.prepare"
    | "scripts.toggle.request"
    | "scripts.delete.request"
    | "operations.get"
    | "operations.list"
    | "operations.cancel";
  input: unknown;
};

type McpBridgeResponse =
  | { requestId: string; ok: true; result: unknown }
  | {
      requestId: string;
      ok: false;
      error: {
        code:
          | "INVALID_REQUEST" | "UNAUTHENTICATED" | "INSUFFICIENT_SCOPE" | "WRITE_MODE_DISABLED"
          | "USER_APPROVAL_REQUIRED" | "USER_REJECTED" | "OPERATION_EXPIRED" | "CONFLICT"
          | "NOT_FOUND" | "RATE_LIMITED" | "PAYLOAD_TOO_LARGE" | "INTERNAL_ERROR";
        message: string;
        operationId?: string;
      };
    };
```

Scopes: `scripts:list`, `scripts:metadata:read`, `scripts:source:read`, `scripts:install:request`,
`scripts:toggle:request`, `scripts:delete:request`. `scripts.install.prepare`,
`scripts.toggle.request`, and `scripts.delete.request` additionally require the session-only
"write mode" switch to be on (`WRITE_MODE_DISABLED` otherwise).

Reads return a `contentTrust` tag (`"untrusted-user-script-metadata"` /
`"untrusted-user-script-source"`) on every script-derived payload. `scripts.install.prepare` takes
exactly one of `url` (https-only, no embedded credentials, no private/loopback hosts) or `code`
(≤512 KiB — the host→browser native-messaging frame cap leaves headroom above that; larger scripts
must be supplied by `url`, fetched by the extension itself). Writes return a `PendingOperationRef`
(`{ operationId, status: "awaiting_user", kind, expiresAt }`); nothing mutates until a human
approves via `install.html` or `mcp_confirm.html`.

`operations.get`/`operations.list`/`operations.cancel` are scoped to the calling `clientId` —
another client's operation is `NOT_FOUND`, not `INSUFFICIENT_SCOPE` (existence isn't leaked).

## Layer 2 — Shim ↔ host local socket

Unix domain socket (`<runtimeDir>/scriptcat-mcp-<random>.sock`, mode 0600) or Windows named pipe,
opened by `src/broker/ipc.ts`. Line-delimited JSON, `\n`-terminated, max line 4 MiB — oversize or
malformed lines are dropped without desyncing the stream (`src/broker/server.ts`).

**Handshake** (every connection, `src/broker/session.ts`):

```
shim → { t: "hello", v: 1, clientId?: string }        // clientId absent = wants pairing
host → { t: "challenge", nonce: <32B hex> }
shim → { t: "auth", clientId, mac: HMAC-SHA256(token, nonce + "|" + endpointName) }
host → { t: "ready", scopes, serverInfo } | { t: "deny", code: "UNAUTHENTICATED" }
```

The MAC is keyed on the raw token (never stored host-side — only its SHA-256 is persisted,
`src/auth/token-store.ts`) and binds the endpoint name, so a captured response can't be replayed
against a different socket. Three failed auths per 60s per endpoint trigger a temporary lockout
(`src/broker/rate-limit.ts`).

**Pairing** (first run, `src/auth/pairing.ts`):

```
shim → { t: "pair", v: 1, clientName, requestedScopes }
host → { t: "pair_pending", pairingId, code }   // 8-char, shown to the user on both sides
host → { t: "pair_result", approved, clientId?, token?, grantedScopes? }
```

The token appears exactly once, on this already-authenticated local socket; only its hash is ever
persisted. Pairing requests expire after 2 minutes; at most one pending pairing per socket
connection, 3 per hour globally.

**Steady state**:

```
shim → { t: "call", id, action, input }        // becomes bridge.request
host → { t: "result", id, ok, result | error }  // from bridge.response
host → { t: "event", event: "operations.changed" | "scopes.changed" | "bridge.offline", data }
```

## Layer 3 — MCP surface (shim, official `@modelcontextprotocol/sdk`)

`server_info` is always visible once authenticated; every other tool is filtered by the client's
granted scopes (`src/auth/scopes.ts`). Tool input schemas are zod `.strict()`, mirroring Layer 1.5
exactly (`src/shim/tools.ts`). Tool descriptions state the human-approval contract, e.g.
`request_script_install`: *"Requests installation. A ScriptCat window asks the user to review and
approve; poll get_operation_status with the returned operationId. The script is installed disabled
unless the user chooses otherwise."*

All tool results use the structured-output shape (`src/shim/tools.ts` `toToolResult`):

```typescript
{ content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload }
```

`payload` always carries `contentTrust` when it contains any script-derived string. Script content
is never interpolated into Markdown or prose — only returned as opaque JSON string fields.

## Versioning

`protocolVersion` is a single integer shared by layers 1–2. The host reports its own package
version in the native `hello`; the extension refuses to dispatch bridge requests to a host below
`MIN_HOST_VERSION` (`src/app/service/service_worker/mcp/types.ts`), reporting status
`"host_outdated"` instead. The MCP layer's protocol revision is negotiated by the SDK itself.

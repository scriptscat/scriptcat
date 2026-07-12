# ScriptCat MCP Bridge — Threat Model

## Assets

1. **Script execution authority** — the ability to install/enable code that runs on matched pages.
2. **Script source & metadata** — may contain API keys, private endpoints, proprietary code
   (`scripts.source.get`), and browsing-habit inference (`scripts.list`).
3. **Client tokens** — grant scoped access to the above.
4. **User trust in ScriptCat** — store-review standing; no silent capability expansion in store
   builds.

## Adversaries & entry points

| ID | Adversary | Entry point | Status |
|---|---|---|---|
| A1 | Malicious web page in the browser | HTTP/CORS/DNS-rebinding to a local server | **Eliminated by design** — no HTTP listener exists anywhere in this package; transport is stdio (shim) + OS-level IPC (`src/broker/ipc.ts`), never a TCP socket. |
| A2 | Prompt-injected or confused AI agent | a legitimate, already-authenticated MCP session | Primary design driver: two-phase writes (`McpApprovalService`), human approval on every install/enable/disable/delete, disabled-by-default installs, scope minimization, structured (never Markdown) output. |
| A3 | Other local process, same OS user | socket path, token file, host config | Mitigated (user-only file/socket permissions, hashed tokens, challenge-response, no secrets in argv/env) — **not fully defensible**; see residual risk below. |
| A4 | Other local user on a shared machine | socket/named-pipe access | Blocked: per-user runtime dir `0700` (`src/shared/config.ts`), Windows named-pipe ACL scoped to the current user. |
| A5 | Malicious userscript already installed | its name/description/source flowing to the model; its code while staged | `contentTrust` tagging on every script-derived string, no Markdown interpolation, React-default escaping in the approval UI, static compile-time tool descriptions. |
| A6 | Rogue/compromised extension | connecting to the native host | Chrome's own `allowed_origins` manifest allow-list plus host-side `process.argv` origin verification (`src/native/origin.ts`) at startup. |
| A7 | Supply chain (npm) of this package | dependency tree | Exact-pinned `@modelcontextprotocol/sdk` and `zod`, committed lockfile, minimal dependency surface. |

**Residual risk** (also surfaced in the Tools settings page warning dialog): a malicious process
running as the same OS user can ultimately read the shim's token file or debug the browser. This
bridge does not defend against an already-compromised user account.

## Authentication & authorization

- **AuthN**: every socket connection completes HMAC-SHA-256 challenge-response
  (`src/auth/challenge.ts`) before any `call` is accepted. Sessions are connection-lifetime; the
  host re-derives `clientId` from the authenticated connection on every call and stamps it into
  `McpBridgeRequest.clientId` — a shim can never supply its own `clientId` in `input`.
- **AuthZ**: scopes are checked host-side (tool visibility + call gate,
  `src/auth/scopes.ts`) **and independently re-checked in the extension** against
  `McpClientDAO` before acting (`src/app/service/service_worker/mcp/bridge.ts`). A compromised
  host binary alone cannot mint a scope it doesn't have — the extension holds its own copy of
  grants and the write-session flag.
- Scope set is least-privilege, with no catch-all "full access" scope: `scripts:list`,
  `scripts:metadata:read`, `scripts:source:read`, `scripts:install:request`,
  `scripts:toggle:request`, `scripts:delete:request`.
- Pairing defaults: read scopes pre-checked only if requested; write scopes and
  `scripts:source:read` always default unchecked (`src/pages/mcp_confirm/App.tsx`
  `SCOPE_DEFAULT_ON`).
- Revocation is immediate: the extension deletes the client record and sends `client.revoke`; the
  host drops the token hash and closes the session.

## Write-path integrity (TOCTOU)

Every write goes through a pending `McpOperation` (`src/app/repo/mcp.ts`) with fields binding it to
the exact content that was reviewed: `contentHash` (staged code), `existingCodeHash` (target's
code at request time), `expiresAt` (5-minute TTL). `McpApprovalService.decide()` re-verifies, at
the moment of approval, immediately before mutating anything:

1. Status is still `"awaiting_user"` and not expired.
2. The staged code's SHA-256 still matches `contentHash`.
3. For enable/disable/delete: the target script's current code SHA-256 still matches
   `existingCodeHash`, and the target still exists — otherwise `CONFLICT`.
4. The requesting client is not revoked.
5. The decision is single-shot: a decided or expired operation can never re-enter
   `"awaiting_user"`.
6. Installs execute with `enabled=false` unless the human explicitly enabled on the approval page.
7. Closing the approval window without deciding leaves the operation `"awaiting_user"` until it
   expires — closing is neither approval nor rejection.

## URL retrieval policy (`scripts.install.prepare` with `url`)

Enforced by `src/app/service/service_worker/mcp/url_policy.ts` on the extension side (the host
never fetches URLs):

- `https:` only; `http:`, `file:`, `data:`, `javascript:`, `blob:` and embedded credentials
  (`user:pass@`) are rejected.
- Loopback, RFC1918 private, link-local, and multicast destinations are rejected syntactically;
  every redirect (max 3) is re-validated the same way. **Residual limitation**: there is no
  DNS-resolution API available to the extension, so a hostname that resolves to a private address
  only at fetch time cannot be caught — true DNS-rebinding protection is not achievable from this
  layer.
- Response size is capped at 2 MiB, enforced by aborting the stream, not by a post-hoc check.

## Model-facing injection defenses

- Every script-derived string crosses to the agent only inside structured JSON carrying
  `contentTrust: "untrusted-user-script-metadata" | "untrusted-user-script-source"` — never
  concatenated into prose, Markdown, or tool descriptions.
- Tool names and descriptions are compile-time constants (`src/shim/tools.ts`
  `TOOL_DESCRIPTIONS`).
- The extension's approval/pairing UI renders client names and script names as plain text (React
  default escaping, no `dangerouslySetInnerHTML`), with a 64-character cap on client display names
  enforced at pairing.
- Nothing returned by a script can alter the server's capabilities, tool list, or resource
  templates.

## Limits

| Limit | Value |
|---|---|
| Socket line max | 4 MiB |
| Native message max (each direction) | 1 MiB (Chrome's own host↔browser cap) |
| Inline install code max | 512 KiB |
| Downloaded script max | 2 MiB (fetched by the extension; never transits the host) |
| Concurrent calls | 4 per client |
| Read calls | 60/min/client |
| Write requests | 10/hour/client |
| Pairing attempts | 3/hour global; 1 pending per connection |
| Auth failures | 3/min/endpoint → lockout |
| Approval TTL | 5 minutes |
| Pairing TTL | 2 minutes |

Rate-limit hits return `RATE_LIMITED` and are audit-logged. Limits are defined in
`src/shared/limits.ts` and can only be tightened, never loosened, by host config overrides.

## Secrets handling

- The client token is 32 random bytes, shown to the shim exactly once over the already-authenticated
  socket; the host persists only its SHA-256 (`src/auth/token-store.ts`). The shim persists the raw
  token in its own credentials file, `chmod 600` on POSIX.
- Tokens never appear in URLs, `argv`, environment variables, logs, audit events, or error messages
  (`src/shared/logging.ts` redacts URLs and secrets by construction).
- Host config directory permissions are verified at startup — symlinks are resolved first, and the
  host refuses to run against a world- or group-writable directory (`src/shared/config.ts`).

## Audit model

Every bridge call (allowed or denied), pairing decision, operation transition, and revocation is
recorded in the extension's `McpAuditDAO` ring buffer (500 events,
`src/app/repo/mcp.ts`). Audit events never contain tokens or script source. The Tools settings page
exposes a per-client filter, a clear-log action, and a JSON export button — both source-free by
construction — plus a one-click "Revoke all clients & stop bridge" emergency action.

## Native host hardening

- The generated manifest's `allowed_origins` is an exact extension-ID list written by the
  installer — no wildcards (Chrome forbids them regardless).
- Startup validates `process.argv`'s origin against that list, logging only the rejected origin
  string (truncated) on mismatch, then exits.
- No dynamic `eval`/`Function`; no shell-outs; `child_process` is unused in host/shim runtime code.
- `stdout` is exclusively the native-messaging channel (host) or MCP stdio (shim); all diagnostics
  go to `stderr`.
- An unhandled rejection logs to `stderr` and exits non-zero rather than continuing in an unknown
  state — Chrome reconnects the native host on the next `connectNative` call.

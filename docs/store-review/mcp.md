# MCP Bridge — Store Review Package

This document assembles the store-review case for the MCP bridge feature (developer-build only;
never present in `store-stable`/`store-beta`, see [`../develop.md`](../develop.md#build-profiles--mcp-gate)).
It exists so a store reviewer, or a maintainer answering a review question, has one place to point
to instead of re-deriving the story from the code.

## 1. Data flow

```
AI client (MCP)  ──stdio──►  scriptcat-mcp shim  ──OS-local socket/named pipe──►  native host
                                                                                        │
                                                                            native messaging
                                                                                        ▼
                                                                              ScriptCat extension
                                                                          (McpController/McpBridge)
                                                                                        │
                                                             two-phase approval (install.html /
                                                             mcp_confirm.html) before any mutation
```

No HTTP listener exists anywhere in this feature — the shim talks to the host over stdio, the host
talks to the browser over Chrome's native-messaging channel, and the host talks to the shim over an
OS-local Unix domain socket (macOS/Linux) or named pipe (Windows). This removes the entire
CORS/DNS-rebinding/port-scanning threat class by construction (see
[`../../packages/native-messaging-host/THREAT-MODEL.md`](../../packages/native-messaging-host/THREAT-MODEL.md) §"Adversaries & entry points", A1).

## 2. Tool-by-tool privilege table

| Tool | Required scope | Capability |
|---|---|---|
| `server_info` | (authenticated) | Bridge status, extension version, granted scopes. |
| `list_scripts` | `scripts:list` | Structured script summaries (name, type, enabled state) — no source. |
| `get_script_metadata` | `scripts:metadata:read` | Single script's matches/grants/connects — no source. |
| `get_script_source` | `scripts:source:read` | Full script source, which may contain secrets — off by default at pairing. |
| `request_script_install` | `scripts:install:request` | Creates a pending operation; nothing installs until approved on `install.html`. Installed disabled unless the human explicitly enables it. |
| `request_script_toggle` | `scripts:toggle:request` | Creates a pending operation; nothing toggles until approved on `mcp_confirm.html`. |
| `request_script_delete` | `scripts:delete:request` | Creates a pending operation; requires a press-and-hold confirmation on `mcp_confirm.html`. |
| `get_operation_status` / `list_pending_operations` / `cancel_operation` | any write scope | Polling/bookkeeping for the above; never itself mutates a script. |

Full protocol and scope semantics: [`../../packages/native-messaging-host/PROTOCOL.md`](../../packages/native-messaging-host/PROTOCOL.md).

## 3. Threat model & abuse cases

See [`../../packages/native-messaging-host/THREAT-MODEL.md`](../../packages/native-messaging-host/THREAT-MODEL.md)
in full. Summary of the primary abuse case this design targets: a prompt-injected or otherwise
confused AI agent holding a valid, scoped session cannot install, enable, disable, or delete a
script without a human reviewing and approving that exact request in the ScriptCat UI — every write
is a two-phase pending operation bound to the exact content hash and target state reviewed
(TOCTOU-safe re-verification at the moment of approval).

## 4. Consent surfaces

- **Pairing dialog**: client name, an 8-character verification code the user cross-checks against
  the client's own terminal output, and a scope checklist — read scopes pre-checked only if
  requested, write scopes and source-read always unchecked by default. Rendered in-page
  (`McpPairingDialog`, `src/pages/options/routes/Tools/sections/`) when the options tab is already
  open, or as a focused popup (`McpPairingView`, `src/pages/mcp_confirm/App.tsx`) otherwise —
  `McpController` checks for an open options tab before deciding which.
- **Install approval banner** (`src/pages/install/components/McpBanner.tsx`): requesting client name,
  source (URL host or "raw code"), content SHA-256, and an explicit "installs disabled unless you
  enable it below" note, on the existing `install.html` review page.
- **Enable/disable/delete confirmation** (`src/pages/mcp_confirm/App.tsx`, `McpConfirmView`): script
  name and requesting client for enable/disable; a press-and-hold confirmation for delete.
- **Source disclosure prompt** (same `McpConfirmView`, `kind: "source_disclosure"`): the first time
  a client calls `get_script_source` for a given script, the client name and script name are shown
  with three options — "Deny", "Allow once" (authorizes exactly the next read only), and "Allow for
  this client" (persists a permanent per-client, per-script grant on the client record). Until a
  decision is made, the call returns `USER_APPROVAL_REQUIRED` rather than the source.

Screenshots and a walkthrough recording of these surfaces are not yet captured — this is a known
gap in the review package (tracked alongside the other follow-ups in §6), not a claim that they
exist. Whoever prepares the actual store submission should capture them from a running developer
build before submission.

## 5. Permission justification

`nativeMessaging` is **absent** from the `store-stable` and `store-beta` manifests — verified by
`scripts/build-config.js`'s `checkMcpPackProfileCompliance`, which fails the pack build if the
string is found in a store-profile bundle. It is present only in the separately-distributed
`developer` artifact. The store submission for `store-stable`/`store-beta` therefore carries no new
permission from this feature.

## 6. No silent installs or enables

No code path reachable from the MCP bridge calls `installByUrl`/`installByCode`/`deleteScript`/
`enableScript` directly. Every write action (`scripts.install.prepare`, `scripts.toggle.request`,
`scripts.delete.request`) only ever creates a pending `McpOperation`
(`src/app/repo/mcp.ts`); the actual mutation happens exclusively inside
`McpApprovalService.decide()`, called only from the human-facing `install.html`/`mcp_confirm.html`
pages after an explicit approve action.

## 7. Token storage & revocation

- The client token is 32 random bytes, shown to the shim exactly once over an already-authenticated
  local socket; the native host persists only its SHA-256
  (`packages/native-messaging-host/src/auth/token-store.ts`). The extension never sees or stores
  the raw token — it mirrors `tokenHash` only, for its own independent scope re-check.
- Revocation ("Revoke" on a client row, or the emergency "Revoke all clients & stop bridge") deletes
  the extension's client record and sends `client.revoke` to the host, which drops the token hash
  and closes any live session for that client immediately.

## 8. Native host installer / uninstall

Per-platform installers live in `packages/native-messaging-host/installers/`
(`install.sh`/`uninstall.sh` for macOS/Linux, `install.ps1`/`uninstall.ps1` for Windows). They
generate the native-messaging manifest at install time from `manifest.template.json`, binding it to
the actual installed extension ID rather than shipping a hardcoded one. `uninstall.*` removes the
generated manifest and the host's config/runtime directories.

## 9. Audit-log behavior

Every bridge call (allowed or denied), pairing decision, operation transition, and revocation is
recorded in the extension-side `McpAuditDAO` ring buffer (500 events,
`src/app/repo/mcp.ts`), never containing tokens or script source. The Tools settings card exposes a
per-client filter, a "Clear" action, and a "Export JSON" download over the same data — both
source-free by construction.

## 10. Privacy disclosure

An authorized client can read exactly what its granted scopes allow, and no more: script names/types/
enabled-state (`scripts:list`), match patterns and permission grants (`scripts:metadata:read`), and
full source (`scripts:source:read`, off by default, carries an explicit "may contain secrets" note
at pairing). Nothing is readable before pairing completes with the corresponding scope granted by
the human. Holding `scripts:source:read` is necessary but not sufficient to read a given script's
source: the first read of each script by each client additionally requires a one-time (or
permanent, if the human chooses "Allow for this client") disclosure approval — see §4.

## 11. Demo recording

Not yet produced — deferred to whoever prepares the actual store submission, alongside the
screenshots noted in §4. The scripted walkthrough is: enable the bridge (warning dialog) → pair a
client (verification code + scope checklist) → request an install (approval banner) → request a
delete (press-and-hold confirm) → revoke the client → "Revoke all & stop bridge".

## 12. Kill-switch & rollback

- **User kill-switch**: "Revoke all clients & stop bridge" on the Tools settings card is immediate;
  simply turning off "Enable MCP bridge" also closes the native-messaging port.
- **Distribution rollback**: because the feature ships only in the `developer` artifact, rolling
  back is publishing the prior developer build — `store-stable`/`store-beta` users are never
  affected, since they never received this code.
- **Code rollback**: `SC_ENABLE_MCP` defaults to off at build time, which neutralizes the feature
  without a revert; the feature's commits are otherwise a normal revertable unit.

## 13. Known follow-ups (explicitly deferred, not blocking this feature)

- Firefox event-page bridge support (this bridge currently targets Chrome's `connectNative`; the
  card and controller now correctly hide themselves on Firefox rather than attempting to connect).
- Signed native-host binaries / single-file packaging.
- Windows installer verification: `install.ps1`/`uninstall.ps1` (including `-Rollback`) are
  implemented and syntax-reviewed by hand, but never executed — no PowerShell interpreter is
  available in the environment that produced this pass. Exercised only by the Windows leg of the
  `native-host` CI job building/testing the TypeScript package itself.
- The doc 09 §3 manual smoke test (a real browser with the extension loaded, a real installed
  native host, and a real MCP client pairing and calling tools end-to-end) and store screenshots /
  demo recording (§4, §11) — both need a live UI to drive or capture from, not achievable from an
  automated pass.
- Actual store submission — this package documents readiness, it does not constitute a submission.

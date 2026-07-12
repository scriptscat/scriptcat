# Using the ScriptCat MCP Bridge

A practical, task-oriented guide to connecting an AI agent (Claude Desktop, Claude Code, or any
other [Model Context Protocol](https://modelcontextprotocol.io/) client) to your ScriptCat
userscripts, with worked examples of the flows you'll actually hit.

This is a **developer-build-only** feature — it does not exist in the Chrome Web Store build. For
*why* it's built this way (threat model, scope design, TOCTOU guarantees), see
[`packages/native-messaging-host/THREAT-MODEL.md`](../packages/native-messaging-host/THREAT-MODEL.md)
and [`packages/native-messaging-host/PROTOCOL.md`](../packages/native-messaging-host/PROTOCOL.md).
This guide is the "how do I actually use it" companion to those.

## What you get

Once connected, an AI agent can:

- List your installed userscripts and read their metadata (matches, grants, enabled state) —
  read-only, no approval needed once you've granted the scope.
- Read a script's full source — gated behind a one-time (or permanent, your choice) approval per
  script per client, because source can contain secrets.
- **Request** installing a new script, enabling/disabling one, or deleting one — every one of
  these is a *request*. Nothing changes until you review and click Approve in a ScriptCat window
  that pops up. New installs are disabled by default even after you approve them, unless you
  explicitly flip the enable switch on that same approval screen.

There is no code path from an MCP request to a script mutation that skips your approval. If an
agent asks for something destructive, you'll see it before it happens.

## 1. Prerequisites

- Node.js ≥ 20 on your PATH.
- A **developer build** of the extension (the MCP bridge is compiled out of the store build
  entirely — see [`docs/develop.md`](./develop.md#build-profiles--mcp-gate)).
- macOS or Linux for now if you want to *build and run the installer yourself* — the Windows
  installer (`install.ps1`) exists and is code-reviewed, but hasn't been exercised end-to-end in
  this repo's CI (no Windows/PowerShell environment was available when it was written). It should
  work; treat it as less battle-tested than the POSIX path.

## 2. Build and load the extension with MCP enabled

```bash
pnpm install
SC_ENABLE_MCP=true pnpm run dev
```

Load `dist/ext` as an unpacked extension (`chrome://extensions` → Developer mode → "Load
unpacked"). Note the extension's ID from that page — you'll need it in step 4 (it looks like
`abcdefghijklmnopabcdefghijklmnop`, 32 lowercase letters a–p).

## 3. Build the native host

The native host is a standalone package, not bundled into the extension:

```bash
cd packages/native-messaging-host
pnpm install
pnpm build
```

This produces `dist/host.js` (the native-messaging host Chrome launches) and `dist/shim.js` (the
MCP-facing stdio server your AI client launches), plus two CLI entry points once installed:
`scriptcat-native-host` and `scriptcat-mcp`.

## 4. Register the native host with Chrome

```bash
./installers/install.sh --extension-id <your-extension-id>
```

Run this from inside `packages/native-messaging-host`. Add `--browser edge`, `--browser chromium`,
or `--browser brave` (repeatable) if you want it registered for a browser other than Chrome. This
writes the native-messaging manifest Chrome needs, pins the exact `node` binary path into a
generated launcher script (so nothing can hijack it via `PATH`), and writes the host's own config
directory (`~/Library/Application Support/ScriptCat/NativeHost` on macOS,
`~/.local/share/scriptcat/native-host` on Linux by default, or `$XDG_DATA_HOME/...` if set).

Verify it worked:

```bash
node dist/host.js --doctor
```

You should see four green checks, including "allowed origins configured" — that one only turns
green after `install.sh` has run at least once with a valid extension ID.

**Upgrading later:** re-run `install.sh` with the new build in place; it installs alongside the
old version (never overwrites it) and records the previous one so `install.sh --rollback` can
restore it if something goes wrong.

**Uninstalling:** `./installers/uninstall.sh` removes every manifest it registered plus the
installed program files.

## 5. Enable the bridge in ScriptCat

Open the extension's options page → **Tools** → **MCP Bridge (Developer)**. Flip "Enable MCP
bridge" — a warning dialog explains what you're turning on (agents can list/read metadata freely;
everything else needs your approval) before it actually takes effect. Status should move from
"Connecting…" to "Connected" within a second or two if the native host is reachable.

If it says "Host unreachable": re-check step 4 — usually the extension ID in the manifest doesn't
match the one Chrome actually assigned this load. If it says "Host outdated": you're running an
older `native-messaging-host` build than the extension requires; rebuild it (step 3).

## 6. Pair your MCP client

Every client (Claude Desktop, Claude Code, a custom script — anything speaking MCP over stdio)
needs to pair once before it can do anything. Pairing is interactive and requires the ScriptCat
window to be open so you can approve it:

```bash
node dist/shim.js --pair --name "Claude Desktop"
```

This prints an 8-character code to your terminal and waits (up to 2 minutes) for you to approve
it. Simultaneously, ScriptCat shows a pairing dialog — either in the already-open options tab, or
as a new popup window if the options page wasn't open. **Check that the code shown in ScriptCat
matches the one in your terminal** before approving; that's the whole point of the code (it stops
a different local process from racing your real pairing request). The dialog also shows a scope
checklist — `scripts:list` and `scripts:metadata:read` are requested and checked by default for a
bare `--pair` call; check the boxes for anything else you want this client to be able to *request*
(it can still only request writes — approval always happens per-operation regardless of scopes).

Want to request more scopes up front instead of editing them later per-client in the UI?

```bash
node dist/shim.js --pair --name "Claude Desktop" \
  --scopes scripts:list,scripts:metadata:read,scripts:source:read,scripts:install:request,scripts:toggle:request,scripts:delete:request
```

On approval, credentials are saved to `~/.config/scriptcat-mcp/credentials.json` (macOS/Linux) or
`%APPDATA%\scriptcat-mcp` (Windows) — the raw token lives only there and in the native host's
in-memory session; ScriptCat itself never sees or stores it, only its hash.

## 7. Register it with your MCP client

For Claude Desktop or Claude Code, add an entry to your MCP server config:

```json
{
  "mcpServers": {
    "scriptcat": {
      "command": "node",
      "args": ["/absolute/path/to/packages/native-messaging-host/dist/shim.js"]
    }
  }
}
```

(This package isn't published to a registry yet, so point directly at the built `shim.js` rather
than a bare `scriptcat-mcp` command — unless you've `npm link`ed it yourself, in which case the
bin name works too.) Restart your client. It should now list a `scriptcat` MCP server with tools
scoped to whatever you approved during pairing.

## 8. Turn on write mode when you actually want changes made

Even with write scopes granted, a paired client's `request_script_*` tools are refused
(`WRITE_MODE_DISABLED`) until you flip **"Allow write requests this session"** in the Tools
settings card. This is deliberately **not** persisted — it resets every time the browser
restarts, and there's no way to turn it on from outside the ScriptCat UI. It exists so that
"connected + scoped" is never enough on its own to mutate anything; a human has to actively decide
"yes, this session, changes are OK" before any write request can even reach the approval stage.

## Available tools

| Tool | What it needs from you | Requires write mode? |
|---|---|---|
| `server_info` | Nothing — works as soon as you're paired | No |
| `list_scripts` | `scripts:list` scope | No |
| `get_script_metadata` | `scripts:metadata:read` scope | No |
| `get_script_source` | `scripts:source:read` scope **+ a one-time disclosure approval per script** | No |
| `request_script_install` | `scripts:install:request` scope + install approval | Yes |
| `request_script_toggle` | `scripts:toggle:request` scope + toggle approval | Yes |
| `request_script_delete` | `scripts:delete:request` scope + hold-to-confirm delete approval | Yes |
| `get_operation_status` | Any write scope | No |
| `list_pending_operations` | Any write scope | No |
| `cancel_operation` | Any write scope | No |

## Case studies

### Case 1 — "What userscripts do I have installed, and which are enabled?"

Purely read-only, works the moment you're paired with `scripts:list`:

> **You:** What userscripts do I have installed right now?
> **Agent:** *calls `list_scripts`* → gets back an array of `{ uuid, name, type, enabled,
> updatedAt, hasUpdateUrl, ... }` with no source code and no full update URL (only whether one
> exists) — those are metadata-tier fields, not secrets.
> **Agent:** "You have 12 scripts installed; 9 are enabled. Want details on any of them?"

No approval prompt appears anywhere in this flow — it's exactly as safe as looking at the Scripts
list in the extension yourself.

### Case 2 — "Find and fix a bug in my auto-login script"

This is the flow that needs the disclosure gate:

> **You:** There's a bug in my "Auto Login" script — can you find and fix it?
> **Agent:** *calls `list_scripts`*, finds the uuid, then calls `get_script_metadata`* to confirm
> it's the right one, then calls `get_script_source`.
> **Result:** first call to `get_script_source` for *this script, this client* returns
> `USER_APPROVAL_REQUIRED` with an `operationId` — nothing is sent back yet. ScriptCat pops up:
> *"`Claude Desktop` wants to read the source of `Auto Login`. Source may contain secrets."* with
> three buttons: **Deny**, **Allow once**, **Allow for this client**.
>
> - **Allow once** — this one read succeeds; the *next* call to `get_script_source` for the same
>   script prompts again.
> - **Allow for this client** — this and every future read of *this script* by *this client*
>   succeed with no further prompting (a permanent grant recorded on the client, per-script — not
>   a blanket "always allow this client to read anything").
>
> Say you pick "Allow once." The agent retries `get_script_source`, gets the code, spots the bug,
> and (assuming write mode is on and you've granted `scripts:install:request`) calls
> `request_script_install` with the fixed code. ScriptCat's install page opens with a banner:
> *"Requested by `Claude Desktop`"*, the source URL/`raw code` label, a content SHA-256 you can
> expand, and the full normal permission/diff review UI — the enable switch defaults **off**, so
> even after you click Install the fixed version won't run until you explicitly enable it.

### Case 3 — "Turn off the script that's breaking this site while I debug it"

> **You:** Disable my "Ad Blocker Tweaks" script for now.
> **Agent:** *calls `list_scripts`* to find the uuid, then `request_script_toggle` with
> `{ uuid, enable: false }`.
> **Result:** if write mode is off, the call fails immediately with `WRITE_MODE_DISABLED` and the
> agent should tell you to flip the session switch. If write mode is on, ScriptCat opens
> `mcp_confirm.html` (a lightweight popup, not the full install page): script name, requesting
> client, Approve/Reject. You approve → `enableScript` runs → the agent's next
> `get_operation_status` poll shows `status: "approved"`.
>
> Between your approval and the actual disable, ScriptCat re-checks that the script's code hasn't
> changed since the request was made (TOCTOU protection) — if you'd edited it in the meantime,
> you'd get `CONFLICT` instead, and the agent would need to make a fresh request.

### Case 4 — "Clean up scripts I don't use anymore"

> **You:** Delete the three scripts I haven't used in months: X, Y, Z.
> **Agent:** calls `request_script_delete` three times, once per uuid, collecting three
> `operationId`s.
> **Result:** three separate `mcp_confirm.html` popups (or the agent can poll
> `list_pending_operations` to see them all as `awaiting_user`), each requiring a **press-and-hold
> for 1.5 seconds** on the Delete button — a deliberately harder-to-fumble confirmation than a
> single click, since deletion also removes the script's stored values and isn't undoable. You can
> reject any of the three independently; rejecting one doesn't touch the others.

### Case 5 — Revoking access when you're done

> Open Tools → MCP Bridge → the paired-clients list shows every client with its granted scopes and
> last-used time. Click **Revoke** on "Claude Desktop" → confirm → its session is killed
> immediately server-side (the host drops the token hash) and any future call from that client
> fails authentication. If you want to shut the whole thing down at once — every client, right
> now — **"Revoke all clients & stop bridge"** does exactly that and also flips the enable switch
> off.

## Auditing what happened

The same settings card has an **Audit log** — every bridge call (allowed or denied), every pairing
decision, every operation transition, and every revocation, newest first, with client name,
action, and outcome. It never contains tokens or script source — the audit writer is only ever
given the action name, the client, and the outcome, never the request/response payload, so there's
no code path for a secret to end up in it. **Export JSON** downloads the same data client-side;
**Clear** wipes it (irreversible, confirmed before it happens).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Status stuck on "Connecting…" then "Host unreachable" | Native host isn't registered for the extension ID Chrome actually assigned this load, or the host process crashed. Re-run `install.sh` with the correct ID; check `node dist/host.js --doctor`. |
| "Host outdated" | Extension was built against a newer `MIN_HOST_VERSION` than your installed native host reports. Rebuild `packages/native-messaging-host` and re-run `install.sh`. |
| `scriptcat-mcp` (no `--pair`) exits immediately with "No credentials found" | You haven't paired yet, or you're running it as a different OS user than the one who paired. Run `--pair` again. |
| Pairing times out | You have 2 minutes to approve from the moment `--pair` prints the code; if ScriptCat isn't open or the MCP toggle is off, it can't show the dialog at all — check the bridge is Connected first. |
| A write tool always returns `WRITE_MODE_DISABLED` | The session write switch is off (it resets every browser restart, on purpose). Flip it in Tools → MCP Bridge. |
| A write tool returns `INSUFFICIENT_SCOPE` | The client wasn't granted that scope at pairing time. Re-pair with `--scopes` including it, or edit the client's scopes from the paired-clients list. |
| `get_script_source` keeps returning `USER_APPROVAL_REQUIRED` even after you approved | You likely chose "Allow once" and the agent is making a *second* read — that's expected; approve again, or choose "Allow for this client" if you expect repeated reads. |

## What this bridge deliberately does not do

- It never opens any network listener — the entire transport is stdio (agent↔host) plus an
  OS-local Unix socket or named pipe (host↔shim). There's no port to attack from a web page.
- It doesn't trust the AI client's own claims — the native host re-derives which client is calling
  from the authenticated session on every request, and the extension independently re-checks that
  client's scopes against its own record before acting.
- It can't defend against another process already running as your own OS user account reading the
  paired client's token file — that's a documented, accepted residual limitation, not a bug (see
  the threat model doc linked at the top).

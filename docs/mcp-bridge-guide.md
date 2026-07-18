<p align="right">
<a href="./mcp-bridge-guide_zh-CN.md">中文</a> <a href="./mcp-bridge-guide.md">English</a>
</p>

# Using the ScriptCat MCP Bridge

A practical, task-oriented guide to connecting an AI agent (Claude Desktop, Claude Code, or any
other [Model Context Protocol](https://modelcontextprotocol.io/) client) — or your own terminal —
to your ScriptCat userscripts, with worked examples of the flows you'll actually hit.

The bridge is **built into every build but ships turned off**; you opt in from the extension's
settings. It talks to a small local companion binary, [`sctl`](https://github.com/scriptscat/sctl),
which runs a WebSocket daemon on `127.0.0.1:8643`; the extension connects to it as a client from an
offscreen document. No browser permission is added, and there is no native-messaging host or
installer to register. For *why* it's built this way (threat model, handshake, scope design, TOCTOU
guarantees) see the sctl repo's [`THREAT-MODEL.md`](https://github.com/scriptscat/sctl/blob/main/THREAT-MODEL.md)
and [`PROTOCOL.md`](https://github.com/scriptscat/sctl/blob/main/PROTOCOL.md); this guide is the
"how do I actually use it" companion.

## What you get

Once connected, an AI agent (over MCP) **or** you (over the `sctl` CLI) can:

- List your installed userscripts and read their metadata (matches, grants, enabled state) —
  read-only, no approval needed once the scope is granted.
- Read a script's full source — gated behind a one-time (or permanent, your choice) approval per
  script per client, because source can contain secrets. (The `sctl` CLI is exempt from this
  prompt — you typed the command yourself — but MCP agents are not.)
- **Request** installing a new script, enabling/disabling one, or deleting one. Every one is a
  *request*: the call blocks and nothing changes until you review it and click Approve in a
  ScriptCat window that pops up automatically. New installs stay disabled even after you approve,
  unless you flip the enable switch on that same approval screen.

There is no code path from an MCP or CLI request to a script mutation that skips your approval (see
"direct-allow mode" below for the one exception you can deliberately opt into).

## 1. Prerequisites

- The `sctl` binary. It's a single self-contained Go binary — no Node, no runtime deps. Build it
  from the [`scriptscat/sctl`](https://github.com/scriptscat/sctl) repo:

  ```bash
  go build -ldflags "-X github.com/scriptscat/sctl/internal/cli.Version=0.1.0" -o sctl ./cmd/sctl
  ```

  > **Version matters.** The extension refuses any daemon reporting a version below
  > `minDaemonVersion` (currently `0.1.0`) and shows "Host outdated". A plain `go build` stamps
  > `0.0.0-dev`, which is *below* the gate — always build with the `-ldflags` above (or use a
  > release binary) for anything you intend to actually connect.

- macOS, Linux, or Windows — `sctl` is loopback-only and cross-platform; there is no OS-specific
  installer step.

## 2. Start the daemon

```bash
sctl serve
```

This binds the WebSocket hub on `127.0.0.1:8643` (loopback only — it refuses any non-loopback
address) and writes a `0600` control-token file that local `sctl` front-ends use. You can also skip
this step: `sctl pair`, `sctl mcp`, and the CLI verbs auto-start a detached `serve` if one isn't
already running.

## 3. Enable the bridge in ScriptCat

Open the extension's options page → **Tools** → **MCP Bridge (Developer)**. Flip "Enable MCP
bridge" — a dialog first explains what you're turning on (agents can list/read metadata freely;
everything else needs your approval). The connection address defaults to `ws://127.0.0.1:8643`;
leave it unless you moved the daemon. Status stays "Connecting…" until you pair (next step).

## 4. Pair the extension with the daemon (one time)

The extension and the daemon establish a shared long-term key once, so neither can be impersonated
by another local process. Generate a code from the daemon and enter it in the extension:

```bash
sctl pair
```

This prints an 8-character one-time code (valid 2 minutes). In ScriptCat's MCP Bridge card, paste it
into the **Pairing code** field and click **Pair**. The two sides run a mutual handshake, the daemon
hands the extension a long-term key over an encrypted channel, and the status moves to **Connected**.
Re-pairing replaces the old key (only one extension instance is supported in this version).

## 5a. Connect an MCP client (Claude Desktop, Claude Code, …)

Each MCP agent pairs once, so it gets its own revocable identity and scopes. Because `sctl mcp`'s
stdout is the MCP protocol channel, pairing is a **separate** terminal command:

```bash
sctl mcp pair --name "Claude Desktop"
```

This prints an 8-character code and blocks. ScriptCat shows a pairing dialog (in the open options
tab, or a popup) with the same code and a **scope checklist**. **Confirm the code matches**, tick
the scopes this client may *request*, and approve. The minted token is cached at
`<dataDir>/mcp-clients/Claude Desktop.json` (`0600`); ScriptCat only ever stores its hash.

Then point your client's MCP config at the serving command (one identity per `--name`, so you can
run several client configs):

```json
{
  "mcpServers": {
    "scriptcat": { "command": "sctl", "args": ["mcp", "--name", "Claude Desktop"] }
  }
}
```

Restart your client. It will list a `scriptcat` server exposing only the tools your approved scopes
allow. An unpaired or revoked `sctl mcp` serves zero tools and tells the model to run
`sctl mcp pair`.

## 5b. …or just use the CLI

The `sctl` verbs drive the exact same bridge with a built-in `sctl-cli` identity — no pairing, full
scope, but **writes still require your approval in the browser**:

```bash
sctl scripts list                 # or --json for machine-readable output
sctl scripts info <uuid>
sctl scripts source <uuid>        # raw source to stdout (no disclosure prompt for the CLI)
sctl install ./my-script.user.js  # or a URL; blocks until you approve/reject in the browser
sctl enable <uuid>
sctl disable <uuid>
sctl rm <uuid>
```

Write verbs block until you decide; **Ctrl-C** cancels the request (the browser confirm page is
dismissed). Exit codes: **0** approved/ok, **1** you rejected, **2** voided (timeout / Ctrl-C /
disconnect), **3** other error.

## 6. Turn on write mode when you actually want changes made

Even with write scopes granted, write requests are refused (`WRITE_MODE_DISABLED`) until you flip
**"Allow write requests this session"** in the Tools card. It is deliberately **not** persisted —
it resets on browser restart and can't be toggled from outside the ScriptCat UI. Separately, the
**write approval policy** chooses what happens to an allowed write request:

- **Require approval** (default) — every write blocks on a per-item confirm page.
- **Allow directly** — write requests run immediately without per-item confirmation (an amber
  warning marks this as a safety downgrade). Even here, new installs still default to disabled, and
  reading source still needs approval.

## Available MCP tools

| Tool | What it needs from you | Write? |
|---|---|---|
| `scripts_list` | `scripts:list` scope | No |
| `scripts_metadata_get` | `scripts:metadata:read` scope | No |
| `scripts_source_get` | `scripts:source:read` scope **+ a one-time disclosure approval per script** | No |
| `scripts_install_request` | `scripts:install:request` scope + install approval | Yes |
| `scripts_toggle_request` | `scripts:toggle:request` scope + toggle approval | Yes |
| `scripts_delete_request` | `scripts:delete:request` scope + hold-to-confirm delete approval | Yes |

Write tools are **blocking**: the call suspends until you approve or reject (there is no
operation-polling API — the result comes back on the same call). While it waits, the MCP server
sends progress notifications so clients don't time out; if the client disconnects or times out, the
operation is voided and its confirm page invalidated.

## Case studies

### Case 1 — "What userscripts do I have installed, and which are enabled?"

Read-only, works the moment you're paired with `scripts:list`:

> **You:** What userscripts do I have installed right now?
> **Agent:** *calls `scripts_list`* → an array of `{ uuid, name, type, enabled, updatedAt,
> hasUpdateUrl, … }` — no source, and only whether an update URL exists (metadata-tier, not
> secrets).
> **Agent:** "You have 12 scripts installed; 9 are enabled."

No approval prompt appears — it's exactly as safe as looking at the Scripts list yourself. (The same
answer from your terminal: `sctl scripts list`.)

### Case 2 — "Find and fix a bug in my auto-login script"

This is the flow that needs the disclosure gate:

> **You:** There's a bug in my "Auto Login" script — can you find and fix it?
> **Agent:** *calls `scripts_list`*, finds the uuid, *calls `scripts_metadata_get`* to confirm,
> then *calls `scripts_source_get`*.
> **Result:** the first `scripts_source_get` for *this script, this client* blocks. ScriptCat pops
> up: *"`Claude Desktop` wants to read the source of `Auto Login`. Source may contain secrets."*
> with **Deny**, **Allow once**, **Allow for this client**.
>
> - **Allow once** — this read succeeds; the *next* read prompts again.
> - **Allow for this client** — this and every future read of *this script* by *this client*
>   succeed with no further prompt (a permanent per-script grant, not a blanket "read anything").
>
> Say you pick "Allow once." The call returns the source, the agent spots the bug and (with write
> mode on and `scripts:install:request` granted) calls `scripts_install_request` with the fix.
> ScriptCat's install page opens: *"Requested by `Claude Desktop`"*, the source label, an expandable
> content SHA-256, and the normal permission/diff review — the enable switch defaults **off**, so
> even after you click Install the fixed version won't run until you enable it.

### Case 3 — "Turn off the script that's breaking this site while I debug it"

> **You:** Disable my "Ad Blocker Tweaks" script for now.
> **Agent:** *calls `scripts_list`* to find the uuid, then `scripts_toggle_request` with
> `{ uuid, enable: false }`.
> **Result:** if write mode is off, the call fails immediately with `WRITE_MODE_DISABLED`. If it's
> on, ScriptCat opens a lightweight confirm popup (script name, requesting client, Approve/Reject).
> You approve → the toggle runs → the blocking call returns success.
>
> Between your approval and the actual disable, ScriptCat re-checks that the script's code hasn't
> changed since the request (TOCTOU protection) — if you'd edited it meanwhile you'd get `CONFLICT`,
> and the agent would make a fresh request.

### Case 4 — "Clean up scripts I don't use anymore"

> **You:** Delete the three scripts I haven't used in months: X, Y, Z.
> **Agent:** calls `scripts_delete_request` three times, once per uuid.
> **Result:** the requests block and their confirm pages are shown **one at a time** (concurrent
> writes queue). Each Delete needs a **press-and-hold for 1.5 s** — harder to fumble than a click,
> since deletion also removes the script's stored values and isn't undoable. You can reject any
> independently; rejecting one doesn't touch the others. If you close a confirm page by mistake, the
> request stays pending — reopen it from the **Awaiting confirmation** row in the settings card.

### Case 5 — Revoking access when you're done

> Tools → MCP Bridge → the paired-clients list shows every client with its scopes and last-used
> time. **Revoke** → confirm → the daemon drops the token immediately and any in-flight or future
> call from that client fails. **"Revoke all clients & stop bridge"** does that for everyone and
> flips the enable switch off. (The `sctl-cli` identity isn't a paired client — it doesn't appear
> here and shares the bridge's lifecycle; stopping the bridge stops it.)

## Auditing what happened

The settings card has an **Audit log** — every bridge call (allowed or denied), pairing decision,
operation transition, and revocation, newest first, with client name, action, and outcome. It never
contains tokens or source; the audit writer is only given the action, client, and outcome. **Export
JSON** downloads it client-side; **Clear** wipes it (confirmed, irreversible).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Status stuck on "Connecting…" then "Host unreachable" | The daemon isn't running or is on a different address. Start `sctl serve` (or run any `sctl` command), and check the connection address in the card matches. |
| "Host outdated" | The daemon reports a version below `minDaemonVersion` (`0.1.0`) — almost always a plain `go build` (`0.0.0-dev`). Rebuild with the `-ldflags "…Version=0.1.0"` from step 1, or use a release binary. |
| Pairing never completes | `sctl pair` codes last 2 minutes; the bridge must be enabled and the daemon reachable so ScriptCat can run the handshake. Confirm the code in the browser matches the terminal before clicking Pair. |
| `sctl mcp` serves no tools / model says to run `sctl mcp pair` | That `--name` identity isn't paired (or was revoked). Run `sctl mcp pair --name "<same name>"`. |
| A write always returns `WRITE_MODE_DISABLED` | The session write switch is off (resets each browser restart, on purpose). Flip it in Tools → MCP Bridge. |
| A write returns `INSUFFICIENT_SCOPE` | The client wasn't granted that scope at pairing. Re-pair with the scope, or edit the client's scopes in the paired-clients list. (The `sctl-cli` identity always has full scope.) |
| `scripts_source_get` prompts again after you approved | You chose "Allow once" and the agent made a second read — expected; approve again, or pick "Allow for this client". |
| A CLI write exits `2` | The request was voided — you (or the client) timed out, Ctrl-C'd, or the extension disconnected before you decided. |

## What this bridge deliberately does and doesn't do

- It **does** open a loopback WebSocket listener (`127.0.0.1:8643`) — that's the trade for zero new
  browser permissions and no installer. A web page can see the port is open, but every connection
  must pass a bidirectional HMAC handshake before any business message; an unauthenticated socket is
  dropped after 5 s with no information leaked. There is deliberately no Origin check (a non-browser
  process can forge Origin freely — the handshake is the only real gate).
- It doesn't trust the client's own claims — the daemon re-derives which client is calling from the
  authenticated session, and the extension independently re-checks that client's scopes against its
  own record before acting.
- It can't defend against another process already running as your own OS user reading the paired
  token or key file (both `0600`) — a documented, accepted residual limitation, not a bug. See the
  sctl [`THREAT-MODEL.md`](https://github.com/scriptscat/sctl/blob/main/THREAT-MODEL.md).

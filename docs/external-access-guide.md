<p align="right">
<a href="./external-access-guide_zh-CN.md">中文</a> <a href="./external-access-guide.md">English</a>
</p>

# Using ScriptCat External Access

A practical, task-oriented guide to connecting an AI agent (Claude Desktop, Claude Code, or any
other [Model Context Protocol](https://modelcontextprotocol.io/) client) — or your own terminal —
to your ScriptCat userscripts, with worked examples of the flows you'll actually hit.

External Access is **built into every build but ships turned off**; you opt in from the extension's
settings. It talks to a small local companion binary, [`sctl`](https://github.com/scriptscat/sctl),
which runs a WebSocket daemon on `localhost:8643`; the extension connects to it as a client from an
offscreen document. No browser permission is added, and there is no native-messaging host or
installer to register.

**Trust is flat.** You *enroll* the extension with the daemon exactly once (an out-of-band code you
read from the terminal and type into ScriptCat). After that, the `sctl` CLI **and** every MCP agent
reach the daemon over that one trusted channel and inherit its trust — there is no per-client
pairing, no per-client scopes, and no per-client revocation. What still gates every dangerous action
is a **human decision in the browser**, applied identically to the CLI and to MCP.

For *why* it's built this way (threat model, handshake, TOCTOU guarantees) see the sctl repo's
[`docs/threat-model.md`](https://github.com/scriptscat/sctl/blob/main/docs/threat-model.md) and
[`docs/protocol.md`](https://github.com/scriptscat/sctl/blob/main/docs/protocol.md); this guide is
the "how do I actually use it" companion.

## What you get

Once connected, an AI agent (over MCP) **or** you (over the `sctl` CLI) can:

- List your installed userscripts and read their metadata (matches, grants, enabled state) —
  read-only, no approval needed.
- Read a script's full source — gated by the **source-read policy** (approval by default) because
  source can contain secrets. This applies to the CLI too — reading source is a privacy decision, so
  `sctl scripts source` is **not** exempt.
- **Request** installing a new script, enabling/disabling one, or deleting one. Every one is a
  *request*: the call blocks and nothing changes until you decide in a ScriptCat window that pops up
  automatically. Installs and updates reuse ScriptCat's normal install page (with the identity,
  permissions, code, and version diff you already know); the install page's own enable switch decides
  the enabled state, so an approved install is usable immediately, just like a normal install.

There is no code path from an MCP or CLI request to a script mutation that skips your decision
(unless you deliberately switch a policy to "allow directly" — see below).

## 1. Prerequisites

- The `sctl` binary. It's a single self-contained Go binary — no Node, no runtime deps. Build it
  from the [`scriptscat/sctl`](https://github.com/scriptscat/sctl) repo:

  ```bash
  go build -ldflags "-X github.com/scriptscat/sctl/internal/cli.Version=0.1.0" -o sctl ./cmd/sctl
  ```

  > **Version matters.** The extension refuses any daemon reporting a version below
  > `minDaemonVersion` (currently `0.1.0`) and shows "version too old". A plain `go build` stamps
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
this step: `sctl connect`, `sctl mcp`, and the CLI verbs auto-start a detached `serve` if one isn't
already running.

## 3. Enable External Access in ScriptCat

Open the extension's options page → **Tools** → **External Access**. Flip the enable switch — a
dialog first explains what you're turning on (agents can list/read metadata freely; everything else
needs your decision). The connection address defaults to `ws://localhost:8643`; you can edit it
before enrolling if you moved the daemon. Status stays "Pending enrollment" until you enroll (next
step).

## 4. Enroll the extension with the daemon (one time)

Enrollment is the one and only step that needs an out-of-band code — and it's the whole of trust
setup. Run:

```bash
sctl connect
```

This prints an 8-character one-time code (valid 2 minutes) **in your terminal only** — the code
never travels over the connection. In ScriptCat's External Access card, click **Connect to sctl**,
type the code into the dialog, and confirm. The two sides run a mutual handshake, the daemon hands
the extension a long-term key over an encrypted channel, and the status moves to **Connected**.

That's it. **The CLI and every MCP agent now inherit this trust** — none of them enroll again.
Re-enrolling replaces the old key (only one extension instance is supported in this version).

Why an out-of-band code and not "compare two codes on screen"? Anything the daemon sends over the
wire, a malicious local process that forged its Origin could also receive. A code that only ever
exists in your terminal and passes through your eyes and fingers is the one secret such a process
can't get.

## 5a. Connect an MCP client (Claude Desktop, Claude Code, …)

No per-client pairing. Once the extension is enrolled, just point your client's MCP config at the
serving command:

```json
{
  "mcpServers": {
    "scriptcat": { "command": "sctl", "args": ["mcp", "--name", "Claude Desktop"] }
  }
}
```

Restart your client. It lists a `scriptcat` server exposing all script tools; every write and every
source read still stops at your decision in the browser. `--name` is purely an **audit label** — it
attributes this client's requests in ScriptCat's log and nothing more (you can run several client
configs with different names). If the extension isn't enrolled yet, tool calls return an
"extension not connected" error until you run `sctl connect`.

## 5b. …or just use the CLI

The `sctl` verbs drive the exact same channel with the same permissions:

```bash
sctl scripts list                 # or --json for machine-readable output
sctl scripts info <uuid>
sctl scripts source <uuid>        # raw source to stdout; gated by the source-read policy
sctl install ./my-script.user.js  # or a URL; blocks until you decide in the browser
sctl enable <uuid>
sctl disable <uuid>
sctl rm <uuid>
```

Write verbs block until you decide; **Ctrl-C** cancels the request (the browser confirm page is
dismissed). Exit codes: **0** approved/ok, **1** you rejected, **2** voided (timeout / Ctrl-C /
disconnect), **3** other error.

## 6. Policies and per-decision choices

Two **global policies** live in the External Access card, and both apply identically to the CLI and
to MCP:

- **Write policy** — *Require approval* (default) blocks every install / toggle / delete on a
  confirm surface; *Allow directly* runs write requests immediately (an amber warning marks this as
  a safety downgrade).
- **Source-read policy** — *Require approval* (default) blocks each source read on a disclosure
  prompt; *Allow directly* returns source without a prompt.

When a policy is set to *Require approval*, the confirm surface offers a **three-tier decision**:

- **Reject** — this request only.
- **Allow** — this request only.
- **Allow this session** — stop asking for **this script and this operation** for the rest of the
  **extension session** (it's keyed to the browser/extension session, not to an MCP connection or a
  CLI process, which is exactly why the CLI and MCP share one notion of "session"). It resets on
  browser restart, extension reload, or when you stop External Access.

To stop being asked entirely, switch the matching policy to *Allow directly* (global, affects CLI
and MCP at once).

## Available MCP tools

| Tool | What it needs from you | Write? |
|---|---|---|
| `scripts_list` | nothing | No |
| `scripts_metadata_get` | nothing | No |
| `scripts_source_get` | a source-disclosure decision (unless the source-read policy is "allow directly") | No |
| `scripts_install_request` | an install decision on the install page (unless the write policy is "allow directly") | Yes |
| `scripts_toggle_request` | a toggle decision (unless the write policy is "allow directly") | Yes |
| `scripts_delete_request` | a hold-to-confirm delete decision (unless the write policy is "allow directly") | Yes |

Write tools are **blocking**: the call suspends until you decide (there is no operation-polling API —
the result comes back on the same call). While it waits, the MCP server sends progress notifications
so clients don't time out; if the client disconnects or times out, the operation is voided and its
confirm surface invalidated.

## Case studies

### Case 1 — "What userscripts do I have installed, and which are enabled?"

Read-only, works the moment you're enrolled:

> **You:** What userscripts do I have installed right now?
> **Agent:** *calls `scripts_list`* → an array of `{ uuid, name, type, enabled, updatedAt,
> hasUpdateUrl, … }` — no source, and only whether an update URL exists (metadata-tier, not
> secrets).
> **Agent:** "You have 12 scripts installed; 9 are enabled."

No prompt appears — it's exactly as safe as looking at the Scripts list yourself. (The same answer
from your terminal: `sctl scripts list`.)

### Case 2 — "Find and fix a bug in my auto-login script"

This is the flow that hits the disclosure gate:

> **You:** There's a bug in my "Auto Login" script — can you find and fix it?
> **Agent:** *calls `scripts_list`*, finds the uuid, *calls `scripts_metadata_get`* to confirm,
> then *calls `scripts_source_get`*.
> **Result:** with the source-read policy on *Require approval*, the read blocks. ScriptCat pops up
> a confirm page: *"External Access wants to read the source of `Auto Login`. Source may contain
> secrets."* with **Reject**, **Allow this session**, **Allow**.
>
> - **Allow** — this read succeeds; the *next* read prompts again.
> - **Allow this session** — this and every future read of *this script* succeed with no further
>   prompt until the extension session ends.
>
> Say you pick "Allow." The call returns the source, the agent spots the bug and calls
> `scripts_install_request` with the fix. ScriptCat's install page opens with a banner —
> *"Requested via External Access"* — plus the source, an expandable content SHA-256, and the normal
> permission/diff review. The enable switch behaves like a normal install; approve and the fixed
> version is live.

### Case 3 — "Turn off the script that's breaking this site while I debug it"

> **You:** Disable my "Ad Blocker Tweaks" script for now.
> **Agent:** *calls `scripts_list`* to find the uuid, then `scripts_toggle_request` with
> `{ uuid, enable: false }`.
> **Result:** with the write policy on *Require approval*, ScriptCat opens a lightweight confirm page
> (script name, "triggered via External Access", Reject / Allow this session / Allow). You allow →
> the toggle runs → the blocking call returns success.
>
> Between your decision and the actual disable, ScriptCat re-checks that the script's code hasn't
> changed since the request (TOCTOU protection) — if you'd edited it meanwhile you'd get `CONFLICT`,
> and the agent would make a fresh request.

### Case 4 — "Clean up scripts I don't use anymore"

> **You:** Delete the three scripts I haven't used in months: X, Y, Z.
> **Agent:** calls `scripts_delete_request` three times, once per uuid.
> **Result:** the requests block and their confirm pages are shown **one at a time** (concurrent
> writes queue). Each Delete needs a **press-and-hold for 1.5 s** — harder to fumble than a click,
> since deletion also removes the script's stored values and isn't undoable. You can reject any
> independently. If you close a confirm page by mistake, the request stays pending — reopen it from
> the **Awaiting confirmation** entry.

### Case 5 — Stopping access when you're done

> Tools → External Access → **Stop External Access**. This discards the long-term key, so every
> downstream client (CLI and every MCP agent) loses trust at once, clears any "allow this session"
> grants, and flips the enable switch off. To connect again later, enroll once more with
> `sctl connect`. (To cut off a single agent without stopping everything, remove the `scriptcat`
> server from that agent's own MCP config.)

## Auditing what happened

External Access records each operation through ScriptCat's existing **logger** under the
`local-access` component — allowed or denied, with the client's self-reported label, the action, and
the outcome. It never contains tokens or source. The card has a **View audit log** button that
deep-links to the Logs page pre-filtered to `component = local-access`, where you get all the usual
filters (level, time, text). The self-reported client name is recorded for forensics only; because
it's unauthenticated and forgeable, it never appears on an approval screen.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Status stuck on "Connecting…" then "connection failed" | The daemon isn't running or is on a different address. Start `sctl serve` (or run any `sctl` command), and check the connection address in the card matches. |
| "version too old" | The daemon reports a version below `minDaemonVersion` (`0.1.0`) — almost always a plain `go build` (`0.0.0-dev`). Rebuild with the `-ldflags "…Version=0.1.0"` from step 1, or use a release binary. |
| Enrollment never completes | `sctl connect` codes last 2 minutes; External Access must be enabled and the daemon reachable so ScriptCat can run the handshake. Read the code from the terminal and type it into the dialog before it expires. |
| `sctl mcp` tool calls return "extension not connected" | The extension isn't enrolled (or you stopped External Access). Run `sctl connect` and complete enrollment, then retry. |
| `scripts_source_get` prompts again after you approved | You chose "Allow" and the agent made a second read — expected; approve again, or pick "Allow this session". |
| A CLI write exits `2` | The request was voided — you (or the client) timed out, Ctrl-C'd, or the extension disconnected before you decided. |

## What External Access deliberately does and doesn't do

- It **does** open a loopback WebSocket listener (`127.0.0.1:8643`) — that's the trade for zero new
  browser permissions and no installer. An **Origin whitelist** cheaply rejects ordinary web pages
  (a browser stamps the Origin and page JS can't forge it), but a non-browser process can forge any
  Origin, so every connection must still pass a bidirectional HMAC handshake before any business
  message; an unauthenticated socket is dropped after 5 s with no information leaked. The handshake
  is the real gate.
- It treats the client's self-reported name as an **audit label only** — flat trust doesn't
  authenticate client identity, so the name never gates anything and never appears on an approval
  screen. What authorizes a request is that it arrived over the enrolled channel; what bounds damage
  is your per-operation decision.
- It can't defend against another process already running as your own OS user reading the daemon key
  or control token (both `0600`) — a documented, accepted residual limitation, not a bug. See the
  sctl [`docs/threat-model.md`](https://github.com/scriptscat/sctl/blob/main/docs/threat-model.md).

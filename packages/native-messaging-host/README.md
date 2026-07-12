<p align="right">
<a href="./README_zh-CN.md">中文</a> <a href="./README.md">English</a>
</p>

# @scriptcat/native-messaging-host

The local Node.js process that bridges [ScriptCat](https://github.com/scriptscat/scriptcat) to AI
agents over the [Model Context Protocol](https://modelcontextprotocol.io/). It ships two
executables built from this package:

- **`scriptcat-native-host`** (`src/host.ts`) — registered with Chrome as a
  [native messaging host](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
  Chrome launches it; it authenticates and relays requests from paired MCP clients to the
  extension over stdio native messaging.
- **`scriptcat-mcp`** (`src/shim.ts`) — the stdio MCP server your AI client (Claude Desktop, Claude
  Code, or any other MCP client) launches. It exposes the `list_scripts`, `get_script_source`,
  `request_script_install`, etc. tools, and forwards them to the host over a local Unix socket or
  Windows named pipe.

There is no HTTP listener anywhere in this package — every transport is stdio or OS-local IPC.

This package only matters if you're building ScriptCat with `SC_ENABLE_MCP=true` (a
developer-build-only feature; it does not exist in the Chrome Web Store build). For the *why*
behind this design (threat model, scope design, TOCTOU guarantees), see
[`THREAT-MODEL.md`](./THREAT-MODEL.md) and [`PROTOCOL.md`](./PROTOCOL.md) in this directory. For
step-by-step usage with worked examples, see
[`docs/mcp-bridge-guide.md`](../../docs/mcp-bridge-guide.md) at the repo root.

## Requirements

- Node.js ≥ 20.
- macOS or Linux to run the installer scripts yourself right now (`install.ps1` for Windows exists
  and is code-reviewed, but hasn't been exercised end-to-end in this repo's CI).

## Install & build

This is a standalone package with its own lockfile — it is not part of the root pnpm workspace's
build graph and must be installed/built separately:

```bash
cd packages/native-messaging-host
pnpm install
pnpm build
```

`pnpm build` runs `tsc` and produces `dist/host.js` and `dist/shim.js`. `pnpm dev` runs the same
compile in `--watch` mode.

## Register the native host

```bash
./installers/install.sh --extension-id <your-extension-id> [--browser edge|chromium|brave] [--rollback]
```

Run from inside this directory. `--browser` is repeatable to register for more than one Chromium
browser besides Chrome. `--rollback` restores the previously installed version (recorded
automatically on every upgrade install). `installers/install.ps1` is the Windows equivalent;
`installers/uninstall.sh` / `installers/uninstall.ps1` remove every manifest and installed file.

Check the installation:

```bash
node dist/host.js --doctor
```

## CLI reference

**`scriptcat-native-host`** (`dist/host.js`):

| Flag | Effect |
|---|---|
| `--doctor` | Prints config-dir, permissions, allowed-origins, and Node-version health checks and exits. |
| `--print-manifest --extension-id <id> --host-path <path>` | Prints the native-messaging manifest JSON that would be written for that extension ID, without writing anything. Used by the installer scripts. |

Run with no flags, this is the process Chrome itself launches per its native-messaging manifest —
you don't normally invoke it directly outside of `--doctor`/`--print-manifest`.

**`scriptcat-mcp`** (`dist/shim.js`):

| Flag | Effect |
|---|---|
| `--pair --name "<client name>" [--scopes a,b,c]` | Interactive pairing: prints an 8-character code, waits up to 2 minutes for approval in the ScriptCat UI, then saves credentials on success. |
| *(no flags)* | Starts the stdio MCP server using previously saved credentials. This is what your MCP client config should launch. |

Run with no `--pair` flag and no saved credentials, `scriptcat-mcp` exits immediately with "No
credentials found" — pair first.

## Testing

```bash
pnpm test        # vitest run
pnpm test:watch  # vitest --watch
```

## Package layout

| Path | Contents |
|---|---|
| `src/host.ts`, `src/shim.ts` | Entry points for the two executables. |
| `src/auth/` | Pairing, scopes, challenge-response, token storage. |
| `src/broker/` | The local IPC server the shim connects to, plus rate limiting and pairing-decision handling. |
| `src/native/` | Chrome native-messaging framing/channel/origin verification. |
| `src/shim/` | The MCP-facing stdio server: tool schemas, resources, socket client. |
| `src/shared/` | Protocol types, config, logging, limits shared across the package. |
| `src/installers/lib/` | Manifest generation logic used by `installers/install.sh` / `install.ps1`. |
| `installers/` | The end-user install/uninstall/rollback shell and PowerShell scripts. |
| `PROTOCOL.md` | The normative three-layer wire protocol (browser↔host, shim↔host, MCP tool catalog). |
| `THREAT-MODEL.md` | Assets, adversaries, entry points, and the mitigations for each. |

## License

GPLv3 — same as the rest of the ScriptCat repository. See [`LICENSE`](./LICENSE) (or the
[root `LICENSE`](../../LICENSE) for the full text).

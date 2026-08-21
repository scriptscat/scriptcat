# E2E Harness

> **What this owns.** How the E2E harness is *set up and run*: the two tracks, browser/profile isolation, the
> fixtures and helpers you build on, the protocol mocks, the environment variables, and where run artifacts
> land.
>
> **What this is NOT.** It does not decide *when* to verify something or how to report it — that is
> [`../docs/verification.md`](../docs/verification.md), and the record's layout/verdicts live in
> [`../docs/references/verification-report-template.md`](../docs/references/verification-report-template.md).
> Unit-test mechanics live in [`../docs/references/develop-testing.md`](../docs/references/develop-testing.md).

## 1. Two tracks

| | Smoke suite | Local verification |
| --- | --- | --- |
| Path | `e2e/*.spec.ts` (committed) | `e2e/scratch/<scenario>/` (git-ignored) |
| Command | `pnpm run test:e2e` | `node e2e/session.mjs start <scenario>` (§8), or a scratch spec |
| Config | [`playwright.config.ts`](../playwright.config.ts) | none, or [`playwright.scratch.config.ts`](../playwright.scratch.config.ts) |
| Scope | stable regression flows | the one change or bug in front of you |
| Runs in CI | yes | never |
| Output | CI verdict + `test-results/` | `<scenario>/report.md` + evidence |

Within the local track, **driving a session is the default** and a scratch spec is the exception — see
[§8](#8-verification-sessions) and [`../docs/verification.md`](../docs/verification.md#choosing-the-form).
Either way, one scenario is one directory under `e2e/scratch/`.

The separation is mechanical, not conventional: the main config sets `testIgnore: ["**/scratch/**"]`, so
`pnpm run test:e2e` and CI can never collect scratch scripts, while the scratch config points `testDir` at
`e2e/scratch/` and clears `testIgnore`. Both configs share one `outputDir` (`test-results/`); Playwright
wipes it at the start of every run, so keep durable evidence under your scenario directory, not in
`test-results/`.

Promoting a scratch scenario into the committed suite is a separate, deliberate decision; see
[`../docs/verification.md`](../docs/verification.md).

## 2. Setup

```bash
pnpm run test:e2e:install    # one-time: pnpm exec playwright install chromium
pnpm run dev                 # or pnpm run build — both write dist/ext
```

Every fixture loads the **built** extension from `dist/ext` via `--disable-extensions-except` +
`--load-extension`, so a stale build silently verifies old code. Rebuild before a run. Page-only edits under
`src/pages/` hot-reload into an already-open page; edits to `manifest.json`, `service_worker`, `offscreen`, or
`sandbox` need a fresh launch, which every run does anyway.

## 3. Harness chain

```text
playwright config → fixture (launchPersistentContext, loads dist/ext)
  → extensionId (read from the extension service worker URL)
  → page openers / script installer (utils.ts)
  → assertions on real UI, page console, or extension storage
```

### Isolation

| Resource | Mechanism |
| --- | --- |
| Browser profile | ephemeral: `launchPersistentContext("")`, or a `mkdtemp` dir removed with `fs.rmSync` after each test |
| First-use onboarding | `addInitScript` presets `localStorage.firstUse = "false"` so the welcome modal can't swallow clicks |
| `userScripts` permission | two-phase launch (below); the granted profile is worker-scoped and copied per test |
| Chromium sandbox | on locally, off under `CI` (GitHub Actions runs non-root, where the sandbox only costs fork overhead) |
| Test hostnames | `--host-resolver-rules` maps `*.test` names to `127.0.0.1` |

### Fixtures

| Import | What it gives you |
| --- | --- |
| [`fixtures.ts`](./fixtures.ts) → `test` | `context` + `extensionId`; onboarding dismissed. The default. |
| [`fixtures.ts`](./fixtures.ts) → `testWithUserScripts` | same, plus the `userScripts` permission already granted |
| [`server-fixtures.ts`](./server-fixtures.ts) → `test`, `startMockServer` | the above plus a local HTTP server and `.test` hostnames resolved to it |
| [`agent-fixtures.ts`](./agent-fixtures.ts) → `test`, `makeTextSSE`, `makeToolCallSSE` | an Agent-ready profile and a routed mock LLM endpoint |

[`utils.ts`](./utils.ts) carries the page openers and script installer used by every track:
`openOptionsPage`, `openPopupPage`, `openEditorPage`, `openAgentChatPage`, `openAgentProviderPage`,
`saveCurrentEditor`, `installScriptByCode`, `runInlineTestScript`, and `autoApprovePermissions`.

### The two-phase launch

`userScripts` is an *optional* MV3 permission (`manifest.json` `optional_permissions`), so a freshly launched
profile cannot inject page scripts. `testWithUserScripts` solves it once per worker: phase 1 launches a temp
profile, navigates to `chrome://extensions/` and calls
`chrome.developerPrivate.updateExtensionConfiguration({ userScriptsAccess: true })`, then closes; phase 2 copies
that profile per test so the grant persists without re-running phase 1 each time. Use this fixture rather than
re-deriving the dance — doing it per test starves the extension service worker under parallel workers.

GM APIs that need a grant open `confirm.html`; `autoApprovePermissions(context)` watches for it and clicks
permanent-allow.

## 4. Protocol mocks

Mocks are local HTTP servers, not stubbed internal code paths:

- [`server-fixtures.ts`](./server-fixtures.ts) — `startMockServer()` returns `{ port, url, requestLog, hits,
  failPath, unfailPath, reset, close }`, serving `@require`/`@resource`/XHR/redirect routes. `hits()` and
  `failPath()` are what let a test tell a re-download from a cache hit, or force a 500. Used by
  `resource-update.spec.ts` and `gm-xhr-site-access.spec.ts`.
- `gm-api.spec.ts` starts its own server and maps `content-security-policy.test` to it, so CSP behaviour is
  exercised without leaving the machine.
- `agent-fixtures.ts` intercepts `**/mock-llm.test/**` through `context.route` and replies with scripted SSE
  frames built by `makeTextSSE` / `makeToolCallSSE` — the mock has no scenario branching of its own.

### Known external dependencies

Two committed specs are **not** hermetic and will fail when the public internet or a third party is down:

| Spec | Reaches | Local alternative that already exists |
| --- | --- | --- |
| `agent-conversation.spec.ts`, `agent-error-handling.spec.ts` | `https://content-security-policy.com/` as the injection target | the `.test` host + `--host-resolver-rules` pattern used by `gm-api.spec.ts` |
| `gm-api.spec.ts` | `unpkg.com` — `patchScriptCode` rewrites `cdn.jsdelivr.net` `@require`/`@resource` URLs to it | `startMockServer()`'s `/lib.js` / `/res.txt` routes |

Treat this as known debt, not a pattern to copy: new specs mock their external protocols.

## 5. Environment variables

None are required; each one only switches on when set. `.env` is **not** loaded by anything in this repository
— export these in the shell (or inline before the command) instead.

| Variable | Read by | Effect |
| --- | --- | --- |
| `E2E_PROXY` | [`fixtures.ts`](./fixtures.ts), [`agent-fixtures.ts`](./agent-fixtures.ts) | Chromium proxy for the launched context. Falls back to `https_proxy` / `http_proxy` / `HTTPS_PROXY` / `HTTP_PROXY`. Needed for the non-hermetic specs above on a restricted network. |
| `E2E_RECORD_VIDEO_DIR` | [`fixtures.ts`](./fixtures.ts) **only** | Records video into that directory. Off by default. Point it at your scenario directory, e.g. `e2e/scratch/<scenario>/videos`. `server-fixtures.ts` / `agent-fixtures.ts`, and any spec that copies a fixture inline instead of importing it, do **not** honour this. |
| `E2E_ONEDRIVE_TOKEN_FILE` | local scratch scripts only — **not referenced by any committed file** | Path to a OneDrive token JSON for real-provider cloud-sync verification, conventionally defaulting to `~/.config/scriptcat/e2e-onedrive-token.json`. Real account, real side effects — only with authorization. Recorded here because nothing in-tree can tell you it exists. |
| `E2E_HEADED` | `headlessArgs()` in [`launch-args.ts`](./launch-args.ts), imported by every fixture | Set to `1`, `true`, or `yes` to launch a **visible** window instead of the default `--headless=new`; unset it (or use `0`/`false`) otherwise. `session.mjs --headed` does the same for a session. |
| `CI` | every fixture, plus [`playwright.config.ts`](../playwright.config.ts) | Disables the Chromium sandbox, and switches Playwright to 1 retry / 2 workers / HTML reporter / `forbidOnly`. Set by GitHub Actions; don't set it by hand. |

Secrets never belong in a committed spec or in `report.md` — see the redaction rules in
[`../docs/references/verification-report-template.md`](../docs/references/verification-report-template.md).

## 6. Writing a scratch script

Create `e2e/scratch/<scenario>/`, put the script and every artifact it produces inside it, and import the
harness from one level further up:

```ts
import { test, expect } from "../../fixtures";
import { openOptionsPage } from "../../utils";
```

```bash
# everything under e2e/scratch/
pnpm exec playwright test --config playwright.scratch.config.ts

# one scenario, filtering by test title (regex) — quote it
pnpm exec playwright test --config playwright.scratch.config.ts -g "options page"
```

[`../docs/verification.md`](../docs/verification.md) owns the rest: when a scratch run is the right tool, where
evidence goes, and how to report the verdict honestly.

## 7. Failure investigation

```bash
ls test-results/            # traces, failure screenshots, .last-run.json (both tracks)
pnpm exec playwright show-report          # HTML report (CI reporter; produced locally with --reporter=html)
pnpm exec playwright show-trace <trace.zip>
```

Traces are recorded `on-first-retry`, so a first local failure has no trace — re-run with `--retries=1` to get
one. Deeper symptom-by-symptom triage lives in
[`../docs/references/verification-debugging.md`](../docs/references/verification-debugging.md).

## 8. Verification sessions

A session is a long-lived browser holding the built extension, driven one command at a time. It exists so that
answering a new question costs one command instead of editing a spec and re-running it from the top.

```bash
node e2e/session.mjs start <scenario> [--headed]   # 启动，默认无头
node e2e/session.mjs status [<scenario>]           # 谁还活着
node e2e/session.mjs stop <scenario> | --all       # 停止并清理 profile
```

`start` builds nothing — run `pnpm run dev` first. It grants the `userScripts` permission in a throwaway launch
and then relaunches from the same profile, because `updateExtensionConfiguration` reloads the extension and its
own pages answer `ERR_BLOCKED_BY_CLIENT` while that happens. It also sweeps the onboarding tabs the extension
opens on install, so `pages` starts clean — one that arrives later simply stays, which is why the current page
is tracked by CDP target identity rather than by index; URL remains a fallback for old evidence files.

### Driving it

```bash
node e2e/drive.mjs <command> [args]                # 唯一存活会话时自动选中
node e2e/drive.mjs --scenario <scenario> <command> # 多会话时必须指名
```

| Command | What it does |
| --- | --- |
| `open <alias\|path>` | Open an extension page. Aliases: `options`, `popup`, `editor`, `logger`, `setting`, `tools`, `subscribe`, `install`, `import`, `batchupdate` |
| `goto <url>` | Navigate the current page anywhere |
| `snapshot [scope]` | List the visible interactive elements with a selector you can paste straight into `click` — run this *before* clicking |
| `click` / `fill` / `press` / `wait` | Interact, by selector (`press` takes a key, e.g. `ControlOrMeta+a`) |
| `text [selector]` | `innerText`, default `body` |
| `shot [name] [--full]` | Screenshot into `<scenario>/shots/`, numbered in capture order |
| `eval <js>` | Run in the current page — with `return` it is a function body, otherwise an expression; `await` works in both |
| `sw <js>` | Run **inside** the extension Service Worker |
| `storage [key]` | Read `chrome.storage.local` from an extension page |
| `install <file.user.js>` | Install a userscript through the Service Worker |
| `pages` / `use <i>` / `close` | Page management; `→` marks the current page |
| `console [n]` | Last `n` lines the session recorded, across all contexts (see below) |

The current page is tracked by CDP target identity, not by index — the extension opens pages of its own, and indices shift.

Clicking starts from `snapshot`, because the UI is Tailwind-classed and reading class strings tells you nothing
about what is clickable. It prefers `data-testid`, falls back to `#id`, then to `text="…"`, and marks disabled
elements with `✗`; pass a scope (`snapshot "header"`) to narrow a busy page. Playwright's selector engines all
work in `click`/`fill`/`wait`, so `text="设置"` and CSS can be mixed freely.

### What the scenario directory holds

| File | Written by | Holds |
| --- | --- | --- |
| `.session.json` | `session.mjs` | port, extension id, profile, pid — removed on `stop` |
| `console.log` | the session, continuously | `console`, uncaught exceptions and log entries from **every** context, tagged with their origin |
| `actions.log` | every `drive.mjs` call | the driving record, which `report.md` quotes |
| `daemon.log` | the daemon | launch failures; read it when `start` reports failure |
| `shots/` | `drive.mjs shot` | screenshots |
| `report.md` | you | the verdict — see [`../docs/references/verification-report-template.md`](../docs/references/verification-report-template.md) |

### Concurrency

Each session allocates its CDP port from the kernel (`listen(0)`), makes its own `mkdtemp` profile, and owns its
scenario directory, so sessions in different worktrees — or two in one — never collide. The port is the only
globally contended resource and nothing hardcodes it.

### What a session does not give you

No protocol mocks and no `.test` hostname mapping: §4's mock servers belong to the fixtures, so a verification
that needs one is a scratch-spec case. `sw` runs inside the Service Worker, so `chrome.runtime.sendMessage`
there cannot reach the extension — send those from an extension page via `eval`.

The collector holds an open debugger session on every target for the session's whole life. That is what makes
the capture complete, but it also means a session is the wrong tool for verifying Service Worker eviction or
idle-termination behaviour — use the committed `keep-alive.spec.ts` track for that.

### Capturing console across contexts

Userscript self-tests and background scripts assert by printing to `console`, and those prints happen in
contexts Playwright does not expose as pages. The session therefore attaches over CDP at the browser level and
auto-attaches to every target, so all four contexts land in one `console.log`:

```text
[log] (src/service_worker.js) …     Service Worker
[log] (src/offscreen.html) …        Offscreen document
[log] (src/sandbox.html) …          Sandbox — where @background / @crontab scripts run
[log] (src/options.html) …          extension pages, content scripts and ordinary web pages
```

Object arguments are rendered from their preview (`{passed: 29, failed: 0}`), not flattened to `Object`, so a
self-test's summary line survives into the log. Attachment happens before a new target runs its first line, so
`document-start` output is not missed. Filter with ordinary shell tools:

```bash
node e2e/drive.mjs console 200 | grep -E "通过|失败|Passed|Failed"
```

Note that installing a `@background` script leaves it disabled (`status: 2`); enable it before expecting output.

## Maintaining this file

Keep it true to the branch (see [`../docs/DOC-MAINTENANCE.md`](../docs/DOC-MAINTENANCE.md)):

```bash
ls e2e/fixtures.ts e2e/utils.ts e2e/server-fixtures.ts e2e/agent-fixtures.ts
ls e2e/session.mjs e2e/drive.mjs
grep -n "testIgnore\|outputDir" playwright.config.ts playwright.scratch.config.ts
grep -n "process.env.E2E_\|process.env.CI" e2e/*.ts e2e/*.mjs
grep -rn "host-resolver-rules" e2e/
node e2e/session.mjs            # §8 的命令表来自这里的 usage
node e2e/drive.mjs help         # 驱动命令表同理
node -e "console.log(Object.keys(require('./package.json').scripts).filter(s=>s.includes('e2e')))"
```

## Related

[`../docs/verification.md`](../docs/verification.md) ·
[`../docs/references/verification-report-template.md`](../docs/references/verification-report-template.md) ·
[`../docs/references/develop-testing.md`](../docs/references/develop-testing.md) ·
[`../AGENTS.md`](../AGENTS.md)

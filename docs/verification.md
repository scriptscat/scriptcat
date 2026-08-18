# Feature verification

## When to skip this guide

Use targeted committed tests alone when they fully observe the changed logic — pure logic, parsers, utilities,
docs, comments, types, and anything the committed suite already proves. Use this guide when the behaviour
depends on cross-context wiring (Service Worker ↔ Content ↔ Inject ↔ Offscreen ↔ Sandbox) or a real Chrome API a
unit test cannot exercise, or when reproducing a runtime-only bug. It does not replace TDD.

Verification is not how the committed suite grows: do not run `pnpm run test:e2e` to check one thing, and do not
add an `e2e/*.spec.ts` as part of it. Promotion is a separate decision
([`references/develop-testing.md`](references/develop-testing.md#choosing-a-test-boundary)).

## Workflow

1. Run `pnpm run typecheck` and `pnpm test -- --run <file>`; run `pnpm test` only when the blast radius is not
   confirmed local or a gate requires it.
2. Build the extension with `pnpm run dev` (or `pnpm run build`). The session loads `dist/ext`, so a stale build
   silently verifies old code — `session.mjs` refuses to start when `dist/ext/manifest.json` is missing, but it
   cannot tell you the build is *old*.
3. Start a session and drive it. Everything it produces lands in `e2e/scratch/<scenario>/`, which is gitignored.

   ```bash
   node e2e/session.mjs start <scenario>       # 常驻浏览器，默认无头
   node e2e/drive.mjs open options             # 一条命令一次操作
   node e2e/drive.mjs snapshot                 # 要点什么，先看有哪些可交互元素
   node e2e/drive.mjs click '[data-testid="theme-toggle"]'
   node e2e/drive.mjs shot after-toggle
   node e2e/session.mjs stop <scenario>
   ```

4. Before running, create `report.md` in that directory from
   [`references/verification-report-template.md`](references/verification-report-template.md); update it as
   evidence arrives.
5. Record how the target was driven, deciding runtime observations, gaps and shortest user reproduction steps.
   `actions.log` already holds the driving record verbatim — quote it rather than reconstructing it.

## Choosing the form

Drive the live session by default. Author a spec only when the extra cost buys something.

| To observe the target | You author |
|---|---|
| a one-off state, visual or console check, however many steps it takes | nothing — drive the session |
| a sequence that must be replayed identically, or where timing/concurrency *is* the contract | a scratch spec |
| a flow worth protecting from regression forever | a committed `e2e/*.spec.ts`, as a separate decision |

A session survives between commands, so exploring costs one command per question instead of one edit-and-rerun
cycle per question. A spec earns its cost when the *ordering* is the thing under test — `drive.mjs` gives no
guarantee about the gap between two invocations.

Scratch specs still run through the scratch config, and still belong to a scenario directory:

```bash
pnpm exec playwright test --config playwright.scratch.config.ts -g "<test title>"
```

## Driving the session

[`../e2e/README.md`](../e2e/README.md#8-verification-sessions) owns the command reference, and
[`references/verification-methods.md`](references/verification-methods.md) the patterns for behaviour the UI does
not expose directly — the `example/tests/` in-page self-tests, Service Worker messages, themes. What matters for
a verdict:

- **Observe from a path the driven surface does not share.** `drive.mjs storage` reads `chrome.storage.local`
  from an extension page, and `drive.mjs sw` evaluates inside the Service Worker — neither goes through the UI
  you just clicked.
- **The session records continuously, from every context.** `console`, uncaught exceptions and log entries from
  the Service Worker, the Offscreen document, the Sandbox (where `@background` / `@crontab` scripts run) and
  every page all land in `console.log`, tagged with their origin — including output produced before you thought
  to look. That is what makes a console-asserting userscript self-test observable without authoring a spec. Every
  `drive.mjs` command appends to `actions.log`.
- **Screenshots are captured while the run is alive**, into `<scenario>/shots/`, numbered in capture order.
- **`sw` runs *inside* the Service Worker**, so `chrome.runtime.sendMessage` there does not reach the extension
  — send those from an extension page with `drive.mjs eval`.

Sessions are headless: verification must not steal desktop focus, and several worktrees verify at once. Add
`--headed` only to watch by eye.

## Running more than one at a time

Each session takes its own kernel-allocated CDP port, its own throwaway Chrome profile and its own scenario
directory, so sessions in different worktrees — or two in the same one — do not collide. The one globally
contended resource is the port, and nothing hardcodes it.

`drive.mjs` targets the only live session automatically. With more than one live it refuses to guess:

```bash
node e2e/session.mjs status                          # 谁还活着
node e2e/drive.mjs --scenario <scenario> open popup   # 多会话时必须指名
```

Stop what you started (`node e2e/session.mjs stop --all`); a session holds a real Chrome process open until you
do. Evidence survives the stop — only the profile and `.session.json` are removed.

## Reporting honestly

For acceptance against a spec, `<scenario>` is the spec slug. Extract each requirement into one verdict row and
evidence section. Verdict labels are `holds`, `does not hold`, `not observed`.

For bug reproduction, state whether the reproduction asserts expected behaviour (red until fixed) or current
buggy behaviour (green until fixed), then turn it into a committed RED test unless
[`references/develop-testing.md`](references/develop-testing.md#when-tdd-doesnt-apply) grants the exception.
Driving a session rather than authoring a spec does not remove that test.

Never weaken an assertion, skip a failed step or describe red as green. For background and cross-context
effects, use a specific console line or storage change; "no errors" is not evidence. Obtain authorization before
destructive or external side effects — a real cloud provider through `E2E_ONEDRIVE_TOKEN_FILE` is a real account
with real side effects — and before substituting anything for a real dependency, including driving a Service
Worker message in place of the UI that sends it. The verdict row then names what stood in and what it does not
cover.

When claiming that something did **not** happen — such as a request, write, disclosure, duplicate event, or stale
callback — either observe the forbidden channel through the relevant completion or closure window, or provide a
causal proof that execution cannot reach that side effect. A final UI value, persisted value, or absence of errors
alone is insufficient. For a negative claim, `holds` requires that closure-window observation or causal proof;
otherwise report `not observed`.

## Maintaining this route

Harness facts are checked by [`../e2e/README.md`](../e2e/README.md#maintaining-this-file). Follow
[`DOC-MAINTENANCE.md`](DOC-MAINTENANCE.md) after path or harness changes. What this route still owns:

```bash
grep -n "e2e/scratch/" .gitignore                          # evidence stays local
node e2e/session.mjs                                       # the usage block is the command list
grep -n "testDir" playwright.scratch.config.ts             # the scratch config still targets it
ls example/tests/                                          # the in-page self-test scripts
```

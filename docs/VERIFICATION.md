# Functional Verification Guide

> **What this owns.** How to *confirm a change actually works* — or *reproduce a reported bug* — by driving the
> **real built extension** end-to-end, written so an AI coding tool (Claude, Codex, …) or a human can do it
> without inventing a workflow. Both modes use the same harness; the per-scenario `report.md` (below) is the
> consultable record of what was verified or reproduced. This is deliberately **lightweight**: one-shot scratch
> scripts and local-only evidence — kept out of Git and never deleted as part of a run; cleanup is the user's call.
>
> **What this is NOT.** It is *not* the test-suite reference. The mechanics of Vitest unit tests and the
> permanent Playwright E2E suite live in [`DEVELOP.md`](./DEVELOP.md) → *Testing*; the TDD-first principle and
> engineering rules live in [`../AGENTS.md`](../AGENTS.md). Read those for writing committed tests.

## The one rule: verification ≠ growing the E2E suite

The full E2E suite is **heavy** (two-phase browser launch, real network fetches, multi-minute timeouts). When
you only want to *check that a feature works*, do not pay that cost and do not leave anything behind:

- ❌ **Never** run the whole suite (`pnpm run test:e2e`) just to verify one thing.
- ❌ **Never** add a permanent `e2e/*.spec.ts` as part of casual verification.
- ✅ Write a **throwaway scratch script** under `e2e/scratch/` (git-ignored), run it, and keep any evidence local.

Promoting a scenario into the permanent suite is a *separate, deliberate* decision — only when it deserves
permanent regression coverage. That path is owned by [`DEVELOP.md`](./DEVELOP.md), not this guide.

**Reproducing a bug you intend to fix is *not* "casual verification."** A scratch reproduction is the *确定 bug
存在* step from [`../AGENTS.md`](../AGENTS.md) (确定 bug 存在 → 写测试 → 修复): it confirms the bug is real but does
**not** replace the test. Next, promote it into a *failing* committed test, then fix, then confirm it goes green —
that permanent test is owned by [`DEVELOP.md`](./DEVELOP.md) / [`../AGENTS.md`](../AGENTS.md).

## Prerequisite gate (cheap signals first)

Driving a browser is the *last* check, not the first. Confirm the cheap signals are green before you build:

```bash
pnpm run typecheck      # tsc --noEmit
pnpm test               # Vitest unit tests (or target one file, see DEVELOP.md)
```

Green unit tests do **not** mean the feature works — they mean the units you tested behave. Cross-context wiring
(Service Worker ↔ Content ↔ Inject ↔ Offscreen ↔ Sandbox) and real Chrome APIs only exercise in a loaded
extension. That gap is exactly what this guide closes.

## Step 1 — Build a loadable extension

```bash
pnpm run dev            # development build with source maps → writes dist/ext
# or: pnpm run build    # production build, also → dist/ext
```

Load `dist/ext` as an unpacked extension (the scratch scripts below do this for you via
`--load-extension`). After a rebuild:

- **Page-only edits** (React UI under `src/pages/`) hot-reload — just refresh the page.
- **Edits to `manifest.json`, `service_worker`, `offscreen`, or `sandbox`** require **reloading the extension**
  (and a fresh launch in the scratch flow, since each run loads `dist/ext` freshly).

## Step 2 — Write a scratch verification script

Scratch scripts live in **`e2e/scratch/`** and reuse the existing harness, so you write almost no boilerplate:

- `import { test, expect } from "../fixtures";` — gives you a `context` (with `dist/ext` loaded) and an
  `extensionId`, with the first-use guide already dismissed. See [`e2e/fixtures.ts`](../e2e/fixtures.ts).
- `import { ... } from "../utils";` — page openers and a script installer. See [`e2e/utils.ts`](../e2e/utils.ts):
  `openOptionsPage`, `openPopupPage`, `openEditorPage`, `installScriptByCode`, `saveCurrentEditor`,
  `autoApprovePermissions`, and `runInlineTestScript`.

### Evidence location

Keep all throwaway verification evidence under **`test-results/verify/<scenario>/`**:

- screenshots: `test-results/verify/<scenario>/screenshots/*.png`
- videos: `test-results/verify/<scenario>/videos/*.webm`
- logs / notes / short verification reports: `test-results/verify/<scenario>/*.md` or `*.log`
- additional test resources: `test-results/verify/<scenario>/resources/`

`test-results/` and `playwright-report/` are git-ignored, so these files are local evidence only and must not be
committed. Do not put verification screenshots, videos, or notes under `docs/`, `e2e/`, or committed source
directories unless you are deliberately adding permanent documentation assets.

Use `resources/` for any extra local inputs or outputs needed to understand or reproduce the run, for example:

- inline userscripts copied out of a scratch file for readability
- mock API responses, fixture JSON/YAML, import/export files, generated ZIPs, or downloaded artifacts
- temporary HTML pages, saved network payloads, or before/after data snapshots

Reference these resources from `report.md` with relative links such as `[Import file](resources/import.yaml)` or
`[Mock response](resources/provider-response.json)`. Keep secrets and real credentials out of the resource directory;
sanitize them before saving evidence.

Embed screenshots inline with `![alt](screenshots/…png)` plus a caption line, so `report.md` renders as a visual
record you can skim without opening files. Link videos, logs, and resources instead — markdown can't inline them.
Never list bare links: every item carries a short note explaining what it proves and how to read it. Prefer this
shape:

```md
## Evidence Index

### Screenshots

![Options root](screenshots/options-root.png)
The script list page rendered and the view toggle is visible, proving the `/` route mounted successfully.

![Settings](screenshots/settings.png)
The settings page shell and content are visible, proving `/settings` did not render blank or crash during mount.

### Videos

- [videos/page@abc.webm](videos/page@abc.webm) — Full page-viewport recording from the script list to the
  settings page; review it for the navigation and final stable state.

### Logs

- [console.log](console.log) — Browser console output captured during the run; confirms whether unexpected errors
  appeared.

### Resources

- [resources/import.yaml](resources/import.yaml) — Input file used by the import verification; keep it to
  reproduce the import flow.
```

### Verification record

Before running the browser, create a short verification record in the scenario directory, for example
`test-results/verify/<scenario>/report.md`. Keep the reusable template headings in English, but write the actual
record content in the user's language. Update it as the run proceeds instead of filling it in only at the end.

Use this shape:

```md
# Local E2E Verification Record: <scenario>

## Mode

`verify-change` | `reproduce-bug`

## Goals / Problem

- (verify)    What behavior should hold, and why it might not
- (reproduce) **Expected:** … **Actual:** …

## Reproduction Steps

1. …
2. …

## Minimal Reproduction

- Smallest script/page/steps that trigger it (link `resources/…`)

## Task List

- [ ] Prerequisite checks passed
- [ ] Built and loaded the real extension
- [ ] Opened target page and confirmed stable anchor
- [ ] Saved screenshots, videos, and logs
- [ ] Recorded the verdict in Result

## Execution Log

| Step | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Open options page | Pending | - | - |

## Result

- **Verdict:** PASS / FAIL — (verify) does the behavior hold? (reproduce) did it reproduce?
- **Observed:** the summary line / asserted value / screenshot that backs the verdict
- (reproduce) Scratch asserts the **desired** behavior (stays red) or the **current buggy** contract
  (passes green; the fix must flip it) — say which

## Blockers

- None

## Evidence Index

Embed screenshots inline, link videos / logs / resources, and annotate every item — see the shape above.
```

Fill `Result` at the end — the honest verdict, per *Step 5 — Report honestly* below. Execution Log `Status`
moves `Pending` → `Pass` / `Fail` / `Blocked`.

In `verify-change` mode, drop the `Reproduction Steps` / `Minimal Reproduction` sections. In `reproduce-bug`
mode, fill `Expected`/`Actual` and keep those sections so the record stands on its own — a later reader or AI
should understand and re-trigger the bug from `report.md` alone, without reading the code.

Keep the checklist factual:

- Start with unchecked tasks that describe what you intend to verify.
- Check items only after the corresponding command/assertion has actually passed.
- If a step is blocked, leave its checkbox unchecked and add a concrete entry under `Blockers`: what failed,
  where it failed, and what evidence was captured.

### Minimal template (drive a UI page)

Save as e.g. `e2e/scratch/verify-options.spec.ts`:

```ts
import { test, expect } from "../fixtures";
import { openOptionsPage } from "../utils";

test("verify: options page opens and renders the script list area", async ({ context, extensionId }) => {
  const page = await openOptionsPage(context, extensionId);

  // 1) Drive the real UI: click, fill forms, and navigate according to the feature under verification.
  // 2) Observe real behavior and use assertions/logs as evidence before drawing a conclusion.
  await expect(page.locator("body")).toBeVisible();
  console.log("[verify] options url =", page.url());

  // Keep evidence for review and debugging.
  await page.screenshot({ path: "test-results/verify/options-page/screenshots/options.png", fullPage: true });
});
```

If you need video evidence, enable it explicitly for the run. The shared fixture writes videos only when
`E2E_RECORD_VIDEO_DIR` is set:

```bash
E2E_RECORD_VIDEO_DIR=test-results/verify/options-page/videos \
  pnpm exec playwright test --config playwright.scratch.config.ts -g "options page"
```

Playwright finalizes `.webm` files when pages/contexts close at the end of the test. A single extension run can
produce multiple videos because the harness may open setup pages as well as the page under verification; keep all
of them beside the screenshots for the same scenario.

This `recordVideo` wiring lives in the **shared** `e2e/fixtures.ts` only. A Step 3 scratch that copies
gm-api.spec's inline two-phase fixture (below) does **not** read `E2E_RECORD_VIDEO_DIR` — either add
`recordVideo: { dir }` to your own `launchPersistentContext(...)`, or rely on screenshots + logs as evidence.

### Run only your scratch script

A dedicated config keeps scratch scripts **out of the main suite/CI** while still letting you run them:

```bash
# run every script in e2e/scratch/
pnpm exec playwright test --config playwright.scratch.config.ts

# run one, filtering by test title (regex) — quote it
pnpm exec playwright test --config playwright.scratch.config.ts -g "options page"
```

Why two configs: [`playwright.config.ts`](../playwright.config.ts) sets `testIgnore: ["**/scratch/**"]`, so
`pnpm run test:e2e` and CI **never** pick up scratch scripts; [`playwright.scratch.config.ts`](../playwright.scratch.config.ts)
points `testDir` at `e2e/scratch/` so you can run them on demand. Scratch files are git-ignored.

## Step 3 — Verify actual script *execution* (GM APIs, injection)

The shared `e2e/fixtures.ts` is enough to drive extension pages, but to make a userscript **actually inject and
run in a page** you need two extra things, both already solved in [`e2e/gm-api.spec.ts`](../e2e/gm-api.spec.ts) —
copy that file's inline fixture and helpers into your scratch script rather than re-deriving them:

1. **Enable the `userScripts` permission.** It is an *optional* MV3 permission (see `manifest.json`
   `optional_permissions`). `gm-api.spec.ts` enables it with a **two-phase launch**: first launch toggles
   `developerPrivate.updateExtensionConfiguration({ userScriptsAccess: true })`, then it relaunches the same
   user-data dir with scripts enabled.
2. **Auto-approve permission prompts.** GM APIs that need a grant open a `confirm.html` page;
   `gm-api.spec.ts`'s `autoApprovePermissions(context)` listens for it and clicks "permanent allow".

### The in-page self-test pattern

The canonical way to verify GM APIs / injection is a userscript that **runs assertions in the page and prints a
summary line**, which the harness parses from the console. The bundled scripts in
[`example/tests/`](../example/tests/) (e.g. `gm_api_sync_test.js`, `gm_api_async_test.js`,
`inject_content_test.js`, `sandbox_test.js`, `window_message_test.js`) do exactly this. The exact line varies by
script — what matters is that each emits a `通过`/`Passed` and a `失败`/`Failed` count the harness can parse:

```
总计: 12 | 通过: 12 | 失败: 0        # inject_content_test.js / sandbox_test.js (combined line)
总测试数: 12 / 通过: 12 / 失败: 0     # gm_api_sync_test.js / gm_api_async_test.js (counts on separate lines)
Total: 12 | Passed: 12 | Failed: 0   # window_message_test.js (English)
```

Collect and assert on it from your scratch script (the regex below matches all three layouts):

```ts
const logs: string[] = [];
let passed = -1;
let failed = -1;
page.on("console", (msg) => {
  const text = msg.text();
  logs.push(text);
  const pass = text.match(/(通过|Passed)[:：]\s*(\d+)/);
  const fail = text.match(/(失败|Failed)[:：]\s*(\d+)/);
  if (pass) passed = parseInt(pass[2], 10);
  if (fail) failed = parseInt(fail[2], 10);
});
// ...navigate to the target page, then:
expect(failed, logs.join("\n")).toBe(0);
expect(passed).toBeGreaterThan(0);
```

To verify a *new* GM API or behavior, write a small self-test userscript in the same style (assert in-page,
print `通过`/`失败` counts) and install it with `installScriptByCode`. Keep the userscript inside your scratch
script or a git-ignored file — it is verification scaffolding, not a committed example.

### When the behavior needs an external trigger (popup menu, action)

The self-test pattern only covers what a userscript can observe *in the page*. Some behavior is fired from
extension UI — e.g. a `GM_registerMenuCommand` menu is triggered from the popup. Two facts make that drivable:

- **Don't try to click the rendered popup button.** A standalone popup page resolves *its own* tab as the
  active one (`getCurrentTab()` → `chrome.tabs.query({ active: true, lastFocusedWindow: true })` in
  [`src/pkg/utils/utils.ts`](../src/pkg/utils/utils.ts)), so it never lists your test tab's menus.
- **Send the same SW message the button sends, from any extension page.** ScriptCat clients talk to the
  Service Worker via `chrome.runtime.sendMessage({ action, data })`, where `action` is `<client-prefix>/<method>`
  (e.g. `serviceWorker/popup/menuClick`) and the reply is wrapped as `{ code, data }` — payload is `res.data`,
  a truthy `code` means error (see [`packages/message/client.ts`](../packages/message/client.ts)). Read the tab
  coordinates you need (`tabId`/`frameId`/`documentId`) from a prior `getPopupData` call.

```ts
// from a chrome-extension:// page (e.g. options.html); poll until the async registration shows up
const res = await chrome.runtime.sendMessage({
  action: "serviceWorker/popup/getPopupData",
  data: { tabId, url },
});
const script = res.data.scriptList.find((s) => s.menus.some((m) => m.name === "your-menu"));
await chrome.runtime.sendMessage({
  action: "serviceWorker/popup/menuClick",
  data: { uuid: script.uuid, menus: script.menus }, // menus carry the target tabId/frameId/documentId
});
```

This drives the real SW → content → sandbox → callback path, behaviorally identical to the popup button (which
discards the DOM event and calls the same message). State the substitution in `report.md`.

**Local-server gotcha.** If your scratch starts a local HTTP server (for `@match` targets, mock responses, CSP
pages) and closes it *inside* the test, call `server.closeAllConnections()` before `server.close()`. Otherwise
`close()` blocks on the browser's keep-alive socket — which only drops on context teardown — and the test hangs
to its timeout.

## Step 4 — When it fails: the five-context debug map

A feature can break in any of ScriptCat's five isolated contexts. Match the symptom to where its logs live (deep
model in [`ARCHITECTURE.md`](./ARCHITECTURE.md)):

| Symptom | Where to look |
| --- | --- |
| CRUD, permissions, routing, chrome API calls | **Service Worker** — `chrome://extensions` → ScriptCat → *Inspect views: service worker* |
| Script not injecting / GM bridge to page | **Content** + **Inject** — the **target page**'s DevTools console |
| Background / scheduled script, DOM-needing GM APIs | **Offscreen** — `dist/ext/src/offscreen.html` context |
| Cron scheduling, `with`-sandboxed execution | **Sandbox** — `dist/ext/src/sandbox.html` context |

In a scratch script, capture the page console (`page.on("console", …)`), take screenshots
(`await page.screenshot({ path: "test-results/verify/<scenario>/screenshots/…png" })`), and write any manual
notes to `test-results/verify/<scenario>/`. Playwright's automatic failure artifacts also go under
`test-results/` because [`playwright.config.ts`](../playwright.config.ts) sets `outputDir: "test-results"`.
The local default keeps Playwright video recording off; CI records retried failures only.

Key extension URLs (replace `<id>` with `extensionId`):

| Page | URL |
| --- | --- |
| Options / dashboard | `chrome-extension://<id>/src/options.html` |
| Popup | `chrome-extension://<id>/src/popup.html` |
| Script editor | `chrome-extension://<id>/src/options.html#/script/editor` |
| Install flow | `chrome-extension://<id>/src/install.html?url=<encoded userscript url>` |

## Step 5 — Report honestly

Verification only counts if the result is reported as observed (this mirrors the engineering principle: evidence
before assertions).

- If it works, say so and state *what you ran* and *what you observed* (the summary line, the screenshot, the
  asserted value, and any video/report path).
- If it fails or you could not verify a path, **say that plainly** with the console/output — do not soften it,
  do not claim success you did not see.
- If you were **reproducing a bug**, state plainly whether it reproduced. If it did, the failing observation
  (error, assertion diff, error screenshot) *is* the evidence — record it and move on to the failing-test → fix
  cycle. If it did not reproduce, say so and note what you tried, instead of implying the bug is gone.
  - Two honest framings for the scratch assertion: assert the **desired** behavior (the scratch stays *red* and
    directly shows the gap), or assert the **current buggy contract** (the scratch passes *green* while the bug
    is present, giving a deterministic re-runnable record) and note that the fix must flip it. Pick one and say
    which in `report.md`; never dress up a red run as green.
- Never weaken an assertion or skip a check to make a scratch run "pass".

## Maintaining this guide

When the harness, scripts, or paths change, keep this doc true to the branch (see
[`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md)). Quick checks:

```bash
ls e2e/fixtures.ts e2e/utils.ts e2e/gm-api.spec.ts playwright.scratch.config.ts
grep -n "testIgnore" playwright.config.ts
grep -n "e2e/scratch/" .gitignore
ls example/tests/
grep -n "lastFocusedWindow" src/pkg/utils/utils.ts     # getCurrentTab → standalone popup resolves its own tab
grep -n "res.data" packages/message/client.ts          # SW reply envelope { code, data }
```

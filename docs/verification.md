# Functional Verification Guide

> **What this owns.** How to *confirm a change actually works* — or *reproduce a reported bug* — by driving the
> **real built extension** end-to-end, written so an AI coding tool (Claude, Codex, …) or a human can do it
> without inventing a workflow. Both modes use the same harness; the per-scenario `report.md` (below) is the
> consultable record of what was verified or reproduced. This is deliberately **lightweight**: one-shot scratch
> scripts and local-only evidence — kept out of Git and never deleted as part of a run; cleanup is the user's call.
>
> **What this is NOT.** It is *not* the test-suite reference. The mechanics of Vitest unit tests and the
> permanent Playwright E2E suite live in [develop.md § Testing](./develop.md#testing); the TDD-first principle
> and engineering rules live in [AGENTS.md § Engineering Principles](../AGENTS.md#engineering-principles). Read
> those for writing committed tests.

## When to skip this guide

This guide is **workflow routing**, not a TDD blanket exception — it applies when a change needs the built
extension, real Chrome APIs, or cross-context behavior to observe. Skip it (and rely on typecheck + the
relevant committed test instead) for:

- Doc-only, comment-only, or type-only changes with no runtime behavior to observe.
- Pure logic that a targeted unit test already exercises completely (a parser, a utility function, a reducer) —
  write/run that test instead of driving a browser for it.
- Any change fully reproducible and provable by a targeted committed test without the built extension.

If you're unsure whether a change needs the built extension, the deciding question is: *does this depend on
cross-context wiring or a real browser API that a unit test can't exercise?* If no, a targeted unit test is
the whole verification; don't reach for this guide's scratch-script workflow just to "be thorough."

## The one rule: verification ≠ growing the E2E suite

The full E2E suite is **heavy** (two-phase browser launch, real network fetches, multi-minute timeouts). When
you only want to *check that a feature works*, do not pay that cost and do not leave anything behind:

- ❌ **Never** run the whole suite (`pnpm run test:e2e`) just to verify one thing *during casual verification*.
  This rule scopes this guide's workflow — it is not a release/CI policy; CI and pre-release gates run the full
  suite as their own separate, deliberate check.
- ❌ **Never** add a permanent `e2e/*.spec.ts` as part of casual verification.
- ✅ Write a **throwaway scratch script** under `e2e/scratch/` (git-ignored), run it, and keep any evidence local.

Promoting a scenario into the permanent suite is a *separate, deliberate* decision — only when it deserves
permanent regression coverage. That path is owned by [`DEVELOP.md`](./develop.md), not this guide.

**Reproducing a bug you intend to fix is *not* "casual verification."** A scratch reproduction is the *确定 bug
存在* step in [`../AGENTS.md`](../AGENTS.md)'s TDD / Confirm-before-you-fix policy. In the general case it
confirms the bug is real but is not itself the required test — promote it into a committed failing test before
fixing. Under that policy's infeasible-automated-coverage exception (criteria in
[`references/develop-testing.md`](./references/develop-testing.md#when-tdd-doesnt-apply)), this scratch
reproduction — its `report.md`, screenshots, and observations — *is* the required evidence; no committed test
is needed. `AGENTS.md` owns the governing principle; `references/develop-testing.md` owns the exception
criteria — don't expect the exception boundary spelled out in `AGENTS.md` itself.

Choose the reproduction method by what the bug depends on: a failing unit test for pure logic/parser/utility
bugs; this guide's scratch-script workflow (above) when it depends on the built extension, browser APIs, or
cross-context behavior.

## Prerequisite gate (cheap signals first, proportional to risk)

Driving a browser is the *last* check, not the first. Confirm the cheap signals are green before you build —
but scale which signals proportionally, not mechanically:

```bash
pnpm run typecheck                        # tsc --noEmit — always
pnpm test -- --run path/to/file.test.ts   # targeted unit test(s) for the change — the default
pnpm test                                 # full Vitest suite — only when the change is broad/risky,
                                           # touches shared code, or a repo gate/CI requires it
```

Typecheck plus the targeted relevant test is the default prerequisite — it is not a requirement to run the
full Vitest suite before every scratch verification. Run the broader suite when the change's blast radius
isn't confirmed to be local (shared utilities, config, public interfaces) or when project policy requires it
for the change type.

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

Surface these resources in `report.md` — short text fixtures pasted into a fenced block, anything large or
binary as a relative link such as `[Exported backup](resources/backup.zip)`. Keep secrets and real credentials
out of the resource directory; sanitize them before saving evidence, and again before pasting any of it inline.

`report.md` is read to decide whether the implementation is correct, so embed the evidence instead of linking
it: screenshots as `![alt](screenshots/….png)`, videos as `<video src="videos/….webm" controls width="720">`
alongside stills of the deciding moments, and the log lines or short fixtures that carry the verdict as fenced
blocks. Scrolling the report should be enough to reach a verdict without opening a side file. Keep a bare link
only for what cannot render inline — archives, binaries, a full log capture — and never list one bare: every
item carries a short note explaining what it proves and how to read it.

### Create `report.md` before you run the browser

Before running the browser, create `test-results/verify/<scenario>/report.md` following the Evidence Index
shape in the [verification record template](./references/verification-report-template.md). Fill it in as you
go — don't reconstruct the run from memory afterward.

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

> Scratch copying the inline fixture won't read `E2E_RECORD_VIDEO_DIR` — see [gotchas](./references/verification-debugging.md#common-gotchas).

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
extension UI — e.g. a `GM_registerMenuCommand` menu is triggered from the popup.

> Why not click the popup button? See [gotchas](./references/verification-debugging.md#common-gotchas).

One fact makes that drivable:

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

> Local server hangs on `close()`? See [gotchas](./references/verification-debugging.md#common-gotchas).

> Hit a failure or a hang? See [debugging & common gotchas](./references/verification-debugging.md).

### Verifying a UI change across light/dark theme

The theme is stored in `localStorage` under the key `lightMode` with value `"light"` / `"dark"` / `"auto"`
(see [`src/pages/components/theme-provider.tsx`](../src/pages/components/theme-provider.tsx) and
[`src/pages/common.ts`](../src/pages/common.ts), which reads the same key during pre-render to avoid a theme
flash). Setting this key **before** the page's own scripts run — e.g. via Playwright's `context.addInitScript`
— is what makes the theme apply on first paint instead of flashing the default and then switching.

Before relying on this in a scratch script, confirm it actually behaves that way for an `chrome-extension://`
page in your Playwright setup — `addInitScript` timing relative to an extension page's own bootstrap can differ
from a normal web page, so verify with a quick throwaway run rather than assuming it. Once confirmed for a
scenario, capture one screenshot per theme (`light` and `dark`) as separate evidence — a single theme's
screenshot doesn't demonstrate the other renders correctly.

## Step 4 — Report honestly

Verification only counts if the result is reported as observed (this mirrors the engineering principle: evidence
before assertions).

- If it works, say so and state *what you ran* and *what you observed* (the summary line, the screenshot, the
  asserted value, and any video/report path).
- If it fails or you could not verify a path, **say that plainly** with the console/output — do not soften it,
  do not claim success you did not see.
- If you were **reproducing a bug**, state plainly whether it reproduced. If it did, the failing observation
  (error, assertion diff, error screenshot) *is* the evidence. In the general case, promote it into a committed
  failing test before fixing (the failing-test → fix cycle). Under
  [develop-testing.md § When TDD doesn't apply](./references/develop-testing.md#when-tdd-doesnt-apply)'s
  infeasible-automated-coverage exception, keep this scratch reproduction as the evidence instead — fix the
  code, then re-run the *same* reproduction script to confirm it now passes. If it did not reproduce, say so
  and note what you tried, instead of implying the bug is gone.
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

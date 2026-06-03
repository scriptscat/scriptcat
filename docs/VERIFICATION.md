# 功能验证指南 / Functional Verification Guide

> **What this owns.** How to *confirm a change actually works* by driving the **real built extension**
> end-to-end — written so an AI coding tool (Claude, Codex, …) or a human can do it without inventing a
> workflow. This is deliberately **lightweight**: one-shot, throwaway scripts you run and discard.
>
> **What this is NOT.** It is *not* the test-suite reference. The mechanics of Vitest unit tests and the
> permanent Playwright E2E suite live in [`DEVELOP.md`](./DEVELOP.md) → *Testing*; the TDD-first principle and
> engineering rules live in [`../AGENTS.md`](../AGENTS.md). Read those for writing committed tests.

## The one rule: verification ≠ growing the E2E suite

The full E2E suite is **heavy** (two-phase browser launch, real network fetches, multi-minute timeouts). When
you only want to *check that a feature works*, do not pay that cost and do not leave anything behind:

- ❌ **Never** run the whole suite (`pnpm run test:e2e`) just to verify one thing.
- ❌ **Never** add a permanent `e2e/*.spec.ts` as part of casual verification.
- ✅ Write a **throwaway scratch script** under `e2e/scratch/` (git-ignored), run it, then delete it.

Promoting a scenario into the permanent suite is a *separate, deliberate* decision — only when it deserves
permanent regression coverage. That path is owned by [`DEVELOP.md`](./DEVELOP.md), not this guide.

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
  `openOptionsPage`, `openPopupPage`, `openInstallPage`, `openEditorPage`, `installScriptByCode`,
  and a ready `sampleUserScript`.

### Minimal template (drive a UI page)

Save as e.g. `e2e/scratch/verify-options.spec.ts`:

```ts
import { test, expect } from "../fixtures";
import { openOptionsPage } from "../utils";

test("验证：选项页能打开并渲染脚本列表区", async ({ context, extensionId }) => {
  const page = await openOptionsPage(context, extensionId);

  // 1) 驱动真实 UI——点击、填表、导航，按你要验证的功能来。
  // 2) 观察真实行为，用断言或日志给出结论（证据先于结论）。
  await expect(page.locator("body")).toBeVisible();
  console.log("[verify] options url =", page.url());

  // 失败时留证据，便于排查。
  await page.screenshot({ path: "test-results/verify-options.png" });
});
```

### Run only your scratch script

A dedicated config keeps scratch scripts **out of the main suite/CI** while still letting you run them:

```bash
# run every script in e2e/scratch/
pnpm exec playwright test --config playwright.scratch.config.ts

# run one, filtering by test title (regex) — quote it
pnpm exec playwright test --config playwright.scratch.config.ts -g "选项页"
```

Why two configs: [`playwright.config.ts`](../playwright.config.ts) sets `testIgnore: ["**/scratch/**"]`, so
`pnpm run test:e2e` and CI **never** pick up scratch scripts; [`playwright.scratch.config.ts`](../playwright.scratch.config.ts)
points `testDir` at `e2e/scratch/` so you can run them on demand. When you are done verifying, **delete the
script** (the directory is git-ignored, so nothing leaks regardless).

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

## Step 4 — When it fails: the five-context debug map

A feature can break in any of ScriptCat's five isolated contexts. Match the symptom to where its logs live (deep
model in [`ARCHITECTURE.md`](./ARCHITECTURE.md)):

| Symptom | Where to look |
| --- | --- |
| CRUD, permissions, routing, chrome API calls | **Service Worker** — `chrome://extensions` → ScriptCat → *Inspect views: service worker* |
| Script not injecting / GM bridge to page | **Content** + **Inject** — the **target page**'s DevTools console |
| Background / scheduled script, DOM-needing GM APIs | **Offscreen** — `dist/ext/src/offscreen.html` context |
| Cron scheduling, `with`-sandboxed execution | **Sandbox** — `dist/ext/src/sandbox.html` context |

In a scratch script, capture the page console (`page.on("console", …)`) and take screenshots
(`await page.screenshot({ path: "test-results/…png" })`) so failures leave evidence.

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
  asserted value).
- If it fails or you could not verify a path, **say that plainly** with the console/output — do not soften it,
  do not claim success you did not see.
- Never weaken an assertion or skip a check to make a scratch run "pass".

## Maintaining this guide

When the harness, scripts, or paths change, keep this doc true to the branch (see
[`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md)). Quick checks:

```bash
ls e2e/fixtures.ts e2e/utils.ts e2e/gm-api.spec.ts playwright.scratch.config.ts
grep -n "testIgnore" playwright.config.ts
grep -n "e2e/scratch/" .gitignore
ls example/tests/
```

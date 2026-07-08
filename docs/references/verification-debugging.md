# Debugging & common gotchas

## Five-context debug map

A feature can break in any of ScriptCat's five isolated contexts. Match the symptom to where its logs live (deep
model in [`ARCHITECTURE.md`](../architecture.md)):

| Symptom | Where to look |
| --- | --- |
| CRUD, permissions, routing, chrome API calls | **Service Worker** — `chrome://extensions` → ScriptCat → *Inspect views: service worker* |
| Script not injecting / GM bridge to page | **Content** + **Inject** — the **target page**'s DevTools console |
| Background / scheduled script, DOM-needing GM APIs | **Offscreen** — `dist/ext/src/offscreen.html` context |
| Cron scheduling, `with`-sandboxed execution | **Sandbox** — `dist/ext/src/sandbox.html` context |

In a scratch script, capture the page console (`page.on("console", …)`), take screenshots
(`await page.screenshot({ path: "test-results/verify/<scenario>/screenshots/…png" })`), and write any manual
notes to `test-results/verify/<scenario>/`. Playwright's automatic failure artifacts also go under
`test-results/` because [`playwright.config.ts`](../../playwright.config.ts) sets `outputDir: "test-results"`.
The local default keeps Playwright video recording off; CI records retried failures only.

## Key extension URLs

Key extension URLs (replace `<id>` with `extensionId`):

| Page | URL |
| --- | --- |
| Options / dashboard | `chrome-extension://<id>/src/options.html` |
| Popup | `chrome-extension://<id>/src/popup.html` |
| Script editor | `chrome-extension://<id>/src/options.html#/script/editor` |
| Install flow | `chrome-extension://<id>/src/install.html?url=<encoded userscript url>` |

## Common gotchas

The `E2E_RECORD_VIDEO_DIR` → `recordVideo` wiring lives in the **shared** `e2e/fixtures.ts` only. A Step 3 scratch that copies
gm-api.spec's inline two-phase fixture does **not** read `E2E_RECORD_VIDEO_DIR` — either add
`recordVideo: { dir }` to your own `launchPersistentContext(...)`, or rely on screenshots + logs as evidence.

**Don't try to click the rendered popup button.** A standalone popup page resolves *its own* tab as the
active one (`getCurrentTab()` → `chrome.tabs.query({ active: true, lastFocusedWindow: true })` in
[`src/pkg/utils/utils.ts`](../../src/pkg/utils/utils.ts)), so it never lists your test tab's menus.

**Local-server gotcha.** If your scratch starts a local HTTP server (for `@match` targets, mock responses, CSP
pages) and closes it *inside* the test, call `server.closeAllConnections()` before `server.close()`. Otherwise
`close()` blocks on the browser's keep-alive socket — which only drops on context teardown — and the test hangs
to its timeout.

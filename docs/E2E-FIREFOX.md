# Firefox MV3 E2E 指南 / Firefox MV3 E2E Guide

> **What this owns.** The **Firefox MV3** end-to-end suite: how ScriptCat is loaded into a real Firefox and
> driven end-to-end (install a userscript → run it → verify GM APIs), and the Firefox-specific hurdles that make
> it work. The Chrome/Chromium E2E suite (Playwright, `e2e/*.spec.ts`) and the general testing mechanics live in
> [`DEVELOP.md`](./DEVELOP.md) → *Testing*; lightweight throwaway verification lives in
> [`VERIFICATION.md`](./VERIFICATION.md). This is the committed, rerunnable Firefox suite.

> **Status:** ScriptCat MV3 does not *officially* support Firefox yet (`scripts/pack.js` keeps
> `PACK_FIREFOX = false`). This suite exists to drive the Firefox build end-to-end and guard the parts that
> already work.

## Why not Playwright

The Chrome E2E suite drives the extension with Playwright + `--load-extension`. **That does not work for
Firefox:** Playwright's Firefox cannot render *any* `moz-extension://` UI page — `page.goto`, a DNR redirect,
and the extension's own `tabs.create` all leave the tab at `about:blank` (Playwright issues
[#3792](https://github.com/microsoft/playwright/issues/3792) /
[#2644](https://github.com/microsoft/playwright/issues/2644)). Without the extension UI you cannot drive the
install page, so the Firefox suite uses **Selenium WebDriver + geckodriver** (Marionette), which renders
`moz-extension://` pages normally.

## Prerequisites

- **A build at `dist/ext`** — run `pnpm run build` (or `pnpm run dev`) first. The runner derives the Firefox
  build from it.
- **A real Firefox ≥ 136** on the machine (the MV3 `userScripts` API landed in Firefox 136; the generated
  manifest sets `strict_min_version: "136.0"`). geckodriver drives your system Firefox.
- Dev dependencies `selenium-webdriver` + `geckodriver` (already in `package.json`). The `geckodriver` npm
  package downloads its binary on demand; no manual install.

## Running

```bash
pnpm run build            # produce dist/ext (skip if already built)
pnpm run test:e2e:firefox # build dist/firefox, drive Firefox, run gm_api_sync, assert
```

Environment flags:

| Var | Effect |
| --- | --- |
| `HEADED=1` | Show the Firefox window instead of headless. |
| `NO_CSP=1` | Serve the target page **without** CSP; then a clean 29/29 is required (no failures allowed). |

Exit code `0` = pass. Screenshots are written to `test-results/ff-gm-sync-*.png` (install page, installed list,
result box), which is git-ignored.

## What it does

The runner ([`e2e/firefox/gm-api-sync.mjs`](../e2e/firefox/gm-api-sync.mjs)) is the Firefox counterpart of the
Chrome "GM_ sync API tests" in [`e2e/gm-api.spec.ts`](../e2e/gm-api.spec.ts):

1. **Build the Firefox add-on** ([`build-ext.mjs`](../e2e/firefox/build-ext.mjs)) — copy `dist/ext` → `dist/firefox`
   and apply the same manifest transform as `scripts/pack.js` (drop `background.service_worker`, delete
   `sandbox`, add `browser_specific_settings.gecko`).
2. **Launch Firefox** ([`driver.mjs`](../e2e/firefox/driver.mjs)) with ScriptCat installed as a temporary add-on.
3. **Start a mock server** ([`mock-server.mjs`](../e2e/firefox/mock-server.mjs)) that serves the target page
   (with `script-src 'none'` CSP by default), the mocked GM endpoints (`/get`, `/favicon.ico`, `/bytes/N`, …),
   and the patched userscript. The userscript is `example/tests/gm_api_sync_test.js`, patched the same way the
   Chrome suite patches it (strip integrity hashes, `jsdelivr`→`unpkg`, rewrite `httpbun`/`@connect` to the
   local mock).
4. **Install** the userscript through ScriptCat's **real install page**
   (`moz-extension://<uuid>/src/install.html?url=…`) — click `[data-testid=install-primary]`.
5. **Run** — open the target page, auto-approve the runtime permission prompts (`confirm.html`), and read the
   `通过`/`失败` summary the script renders.

## The one thing that makes it work: install the add-on *unpacked*

Selenium's `driver.installAddon(dir, true)` **zips** the directory before installing. From a zipped temporary
add-on, Firefox's content process cannot load content-script *source files* — you get
`IPDL protocol Error: Received an invalid file descriptor` → `Unable to load script: .../src/scripting.js`.
`src/scripting.js` is ScriptCat's ISOLATED content bridge (registered via `chrome.scripting.registerContentScripts`);
when it fails to load, the SW ↔ content ↔ inject GM chain never connects and **every userscript silently fails
to run** (no logs, no error).

The fix ([`driver.mjs`](../e2e/firefox/driver.mjs)): install **unpacked** by POSTing the directory path to
geckodriver's raw endpoint `POST /session/{id}/moz/addon/install` with `{ path: <dir>, temporary: true }`.
Inline-code `userScripts.register` (ScriptCat's inject/content bridges) is unaffected — only file-based
`scripting.registerContentScripts` breaks when zipped.

Other Firefox-specific setup handled by the driver:

- **Pin the moz-extension UUID** via the `extensions.webextensions.uuids` pref so install/options URLs are known
  up front.
- **Pre-grant permissions** by writing `<profile>/extension-preferences.json` = `{ "<gecko-id>": { "permissions":
  ["userScripts"], "origins": ["<all_urls>"] } }` so ScriptCat can register userScripts and inject without an
  interactive grant.
- **Match pattern** — the Chrome suite keeps `?gm_api_sync` in `@match`; Firefox match patterns do not match the
  query string, so the userscript is patched to `@match http://127.0.0.1/*` (scoped by the per-run port).

## Results & the known CSP gap

On a normal (non-CSP) page the userscript passes **29/29** — every GM API works on Firefox. On the
`script-src 'none'` CSP page (the faithful, default target) it is **28/29**: the one failure is
`GM_addElement - 创建元素`, because `GM_addElement("script", { textContent })`'s injected inline script does
**not** bypass the page CSP on Firefox (it does on Chrome), so `unsafeWindow.foo === "bar"` fails.

The runner encodes this as a small allowlist (`KNOWN_CSP_GAPS`) so the suite stays green while still failing on
any **new** regression; if ScriptCat gains CSP bypass on Firefox the set just shrinks. Run with `NO_CSP=1` to
require a clean 29/29.

## Layout

```
e2e/firefox/
  build-ext.mjs     # dist/ext → dist/firefox (Firefox manifest transform)
  driver.mjs        # Selenium + geckodriver launch; unpacked temp-add-on install
  mock-server.mjs   # GM API mock server + userscript patchers (mirrors e2e/gm-api.spec.ts)
  gm-api-sync.mjs   # the test: install via UI, run gm_api_sync, assert, screenshot
```

The suite is **not** part of the Playwright run (`playwright.config.ts` ignores `**/firefox/**`); it is driven
only by `pnpm run test:e2e:firefox`.

## Troubleshooting

- **`Process (pid=…) unexpectedly closed with status 0`** — a transient Firefox launch flake; the driver retries
  once. If it persists, kill stray `firefox` / `geckodriver` processes left by interrupted runs.
- **Script installs but never runs** (bare target page, no result box) — almost always the *zipped-add-on*
  content-script failure above; confirm the add-on is installed unpacked.
- **`dist/ext not found`** — run `pnpm run build` first.

# Build pipeline & manifest

## Build Pipeline & Manifest

### Rspack

[`rspack.config.ts`](../../rspack.config.ts) emits one bundle per context/page. Entry points:

```
context bundles : service_worker · offscreen · sandbox · content · inject · scripting
shared          : common (pre-React bootstrap, e.g. early theme init — see src/pages/common.ts)
UI pages (React): popup · options · install · batchupdate · confirm · import
workers         : editor.worker · ts.worker · json.worker (Monaco) · linter.worker
```

For the exact current set, check [`rspack.config.ts`](../../rspack.config.ts)'s `entry` block directly — this
list is a snapshot and can drift when an entry is added or removed.

Output goes to `dist/ext/src/[name].js` (cleaned each build). Notable behavior:

- **Path aliases** mirror `tsconfig.json`: `@App → src`, `@Packages → packages` (the `@Tests → tests` alias is
  test-only — defined in `vitest.config.ts` / `tsconfig.json`, not in the Rspack build).
- **Dev vs prod** via `NODE_ENV`: dev enables watch + inline source maps (skipped when `NO_MAP=true`, needed
  for incognito); prod minifies with SWC + Lightning CSS and drops debug.
- **Code splitting** pulls big libs into named `lib_*` chunks (react, monaco, radix-ui, dnd-kit, eslint, message),
  but **never splits** `service_worker`, `content`, `inject`, `scripting`, or the workers — MV3 requires those
  to be single self-contained files.
- **`CopyRspackPlugin`** copies [`src/manifest.json`](../../src/manifest.json) — its `transform` rewrites the beta
  name (dev/beta) and, for react-tools builds, the CSP — and copies `_locales` and logos. The **version is not**
  stamped here; that happens at pack time (see [Packaging — `pnpm run pack`](#packaging--pnpm-run-pack)).
  **`HtmlRspackPlugin`** generates the page HTML shells.

The dist layout:

```
dist/ext/
├── manifest.json                 # version-stamped, browser-specialized at pack time
├── assets/  _locales/
└── src/
    ├── service_worker.js content.js inject.js scripting.js offscreen.js sandbox.js common.js
    ├── popup.html/.js options.html/.js install.html/.js …
    ├── offscreen.html sandbox.html
    └── lib_*.js  editor.worker.js ts.worker.js json.worker.js linter.worker.js
```

### Manifest (MV3)

[`src/manifest.json`](../../src/manifest.json) highlights:

- `background.service_worker` (Chrome) **and** `background.scripts` (Firefox fallback) point at the same bundle.
- `permissions` include `userScripts`, `declarativeNetRequest`, `offscreen`, `scripting`, `cookies`,
  `webRequest`, `unlimitedStorage`, …; `optional_permissions` hold `background` + `userScripts`.
- `host_permissions: ["<all_urls>"]`, `incognito: "split"` (Chrome; the Firefox variant overrides this to
  `"spanning"` — see below).
- `sandbox.pages` declares `src/sandbox.html`. The Firefox package adds that page's
  `content_security_policy.sandbox` during browser-specific manifest generation; the shared source manifest and
  Chrome package do not contain this Firefox-only CSP. `web_accessible_resources` exposes `install.html` so a
  `.user.js` page can hand off to the install flow.

### Packaging — `pnpm run pack`

[`scripts/pack.js`](../../scripts/pack.js) drives release packaging: it derives the version (special-casing
alpha/beta into internal version codes), runs the production build, then **emits browser-specific manifests** —
the Chrome variant removes the Firefox `background.scripts` fallback and removes `userScripts` from
`optional_permissions` while retaining it in required `permissions`; the Firefox variant adds its sandbox CSP,
makes `userScripts` optional-only, drops `service_worker` and the Chrome-only `debugger` / `offscreen`
permissions, and keeps `sandbox` (its sandbox iframe is a real manifest sandbox page there — see
[architecture.md § Chrome vs Firefox: the offscreen split](../architecture.md#chrome-vs-firefox-the-offscreen-split)),
adds `webRequestBlocking` to `optional_permissions` (for the experimental keep-alive loop), sets
`incognito: "spanning"` (Firefox has no `"split"` mode), adds `browser_specific_settings` (Gecko ID, min
Firefox 154.0a1 — Nightly, for `sandbox`-manifest support), and filters Chrome-only permissions. By default it
writes the Chrome zip and a `.crx` signed with `dist/scriptcat.pem` (which you must supply locally); ScriptCat
MV3 officially supports Firefox, so `PACK_FIREFOX` is `true` by default and the Firefox zip is built too.

## Workspace Packages

`pnpm` workspace packages under [`packages/`](../../packages):

| Package | Purpose |
|---|---|
| [`message`](../../packages/message) | The cross-context RPC + pub/sub layer (see [Message Passing](../architecture.md#message-passing)). Ships its own mocks. |
| [`filesystem`](../../packages/filesystem) | Pluggable FS adapters for sync/backup — WebDAV, cloud drives (OneDrive, Google Drive, Dropbox, Baidu, S3), and zip archives. |
| [`cloudscript`](../../packages/cloudscript) | Cloud-script integration. |
| [`eslint`](../../packages/eslint) | The ESLint config + globals shipped to the in-editor linter for userscripts (`CAT_*`, `GM_*`, `CATRetryError`, …). |
| [`chrome-extension-mock`](../../packages/chrome-extension-mock) | A mock `chrome.*` + message bus for Vitest. |

Project-local ESLint rules live in [`eslint-rules/`](../../eslint-rules); the headline one,
`require-last-error-check`, enforces that `chrome.*` callbacks inspect `chrome.runtime.lastError` (wired in
[`eslint.config.mjs`](../../eslint.config.mjs)).

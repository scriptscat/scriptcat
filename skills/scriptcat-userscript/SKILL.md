---
name: scriptcat-userscript
description: "Write, fix and debug userscripts for ScriptCat (Tampermonkey-compatible): page scripts that run on matching sites (@match), background scripts that keep running without a page (@background) and scheduled scripts (@crontab); metadata, @grant and the GM_* / GM.* / CAT_* APIs, user config, retries. When the sctl CLI is connected, install the script into the user's ScriptCat and verify it in their real browser. Use whenever the user wants a userscript, 油猴脚本, 后台脚本, 定时脚本, a .user.js file or a ScriptCat script written, changed or debugged. Not for developing the ScriptCat extension itself, and not for managing installed scripts without changing their code (that is the sctl skill)."
---

# Writing ScriptCat userscripts

ScriptCat runs Tampermonkey-style userscripts and adds two kinds of its own: background scripts and scheduled
scripts, which run in the extension's background sandbox instead of a web page. Most Tampermonkey knowledge
carries over; the differences below are the ones that break scripts.

**Authority.** The API surface is `scriptcat.d.ts` — in this repository `src/types/scriptcat.d.ts`, otherwise
<https://raw.githubusercontent.com/scriptscat/scriptcat/main/src/types/scriptcat.d.ts>. Working examples live in
<https://github.com/scriptscat/scriptcat/tree/main/example>. The developer docs at <https://docs.scriptcat.org/docs/dev/>
can lag behind the types; when they disagree, trust the types.

## 1. Pick the script type

| The script must… | Type | Key metadata |
|---|---|---|
| Change, read or automate a web page | Page script | `@match` / `@include`, `@run-at` |
| Keep running while the browser is open, with no page (listeners, polling, a menu in the popup) | Background script | `@background` |
| Run on a schedule (check-in, sync, report, periodic fetch) | Scheduled script | `@crontab <expr>` |

Background and scheduled scripts have **no web page**: no `document` of any site, no `unsafeWindow` page, no
`GM_getTab`/`GM_saveTab`. To touch a page from the background, open it with `GM_openInTab` and let a page
script do the DOM work, or fetch data with `GM_xmlhttpRequest` instead of scraping a rendered page.

## 2. Start from the right skeleton

These match the templates ScriptCat's own "new script" uses.

```js
// ==UserScript==
// @name         Example page script
// @namespace    https://example.com/your-namespace
// @version      0.1.0
// @description  What it does, in one line
// @author       You
// @match        https://example.com/*
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  "use strict";
  // ...
})();
```

```js
// ==UserScript==
// @name         Example background script
// @namespace    https://example.com/your-namespace
// @version      0.1.0
// @description  What it does, in one line
// @author       You
// @background
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// ==/UserScript==

return new Promise((resolve, reject) => {
  // ... resolve() when the work is really finished, reject(err) on failure
});
```

A scheduled script is the background skeleton with `@crontab * * once * *` (or another expression) in place of
`@background`. Background and scheduled bodies are wrapped in a function by ScriptCat, so a top-level `return`
is legal there.

## 3. Rules that break scripts when ignored

**Identity and updates**

- `@name` + `@namespace` identify a script. Keep both stable once the user has installed it; changing either
  makes a different script. Bump `@version` on every change you hand back.
- A page script cannot become a background or scheduled script (or the reverse) under the same `@name` +
  `@namespace`: ScriptCat rejects that install with a script type mismatch. Give a temporary script of the other
  type its own `@name`.

**Permissions**

- Every API needs a `@grant` line (`@grant GM_xmlhttpRequest`, …). An ungranted API is simply undefined at
  runtime. Granting `GM_foo` also exposes `GM.foo` and vice versa — only when the names match exactly:
  `GM.xmlHttpRequest` needs its own `@grant GM.xmlHttpRequest` (`@grant GM_xmlhttpRequest` does not expose it).
- `GM_info` needs no grant. `unsafeWindow` needs no grant either, but only exists in the sandbox (any grant
  other than `none`, or no `@grant` line at all); `@grant unsafeWindow` is harmless.
- `@grant none` runs the script without the sandbox: `window` is the page's own window, and the only API is
  `GM_info` / `GM.info` — no other GM API and **no `unsafeWindow`** (referencing it throws a `ReferenceError`).
  Use it only for scripts that need nothing but the page.
- With any other grant — and also with no `@grant` line at all, unlike Tampermonkey — the script is sandboxed:
  its `window` is not the page's. Reach page globals (a site's own JS objects, variables it defines) through
  `unsafeWindow`.
- Declare every host you request with `@connect <host>` (it also covers the host's subdomains; `@connect self`
  covers subdomains of the page's host; requests to exactly the page's host need nothing). For a host that is not
  covered, `GM_xmlhttpRequest` is **refused** ("This domain is not a part of the @connect list") as soon as the
  script has any `@connect` line, unless the user allowed that host before; only a script with no `@connect` at
  all asks the user instead. `GM_download` in native mode always asks, and `GM_cookie` throws for a host outside
  `@connect`.

**Page timing and SPAs**

- `@run-at`: `document-start` (as early as possible), `document-end` (DOM parsed), `document-idle` (the
  default; everything loaded), `document-body` (wait until `<body>` exists), `context-menu` (run when the user
  picks the script from the page's right-click menu). Only the first value counts, and an unknown value silently
  falls back to the default.
- Add `@early-start` together with `document-start` when the script must beat the page's own scripts, and wait
  for `CAT_scriptLoaded()` before relying on the full API.
- Single-page apps change the URL without reloading, so a page script runs once and then misses later views.
  Listen with `@grant window.onurlchange` and `window.addEventListener("urlchange", e => …)`, and use a
  `MutationObserver` for content that renders late. Never assume an element exists at injection time — wait
  for it.
- `@noframes` keeps the script out of iframes; without it, a `*://*/*` match also runs inside every iframe.
- `@inject-into content` runs in the content-script world: unaffected by the page's CSP, but `unsafeWindow`
  is then not the page's `window`. The default is `page`.
- `GM_addStyle` and `GM_addElement` bypass the page's CSP; prefer them over creating `<style>`/`<script>` by
  hand. Exception: on Firefox a `<script>` injected with `GM_addElement` is still subject to the page's CSP.

**Storage**

- `GM_setValue` stores JSON-like data only (no class instances). Setting `undefined` deletes the key
  (Tampermonkey stores it instead).
- Writes are asynchronous. Before `window.close()` or the end of a background run, `await GM.setValue(...)` /
  `await GM.setValues(...)` so the write is not lost.
- `@storageName <name>` lets several scripts share one value store; `GM_addValueChangeListener` sees writes
  from the other scripts (and from other tabs) — a simple cross-script channel.

**Background and scheduled scripts**

- Return a `Promise` and settle it **after** the last asynchronous step. Once it resolves or rejects, ScriptCat
  treats the run as finished and later GM calls from that run are not guaranteed to work. ScriptCat wraps the
  body in an `async` function, so a body that returns nothing is marked complete as soon as its synchronous part
  (and any top-level `await`) finishes — pending callbacks and timers do not keep the run open.
- `resolve(value)` is logged as success, `reject(err)` as an error; the script list then shows the run status
  as error, and the message is in the log.
- To retry, `reject(new CATRetryError("reason", seconds))` (or a `Date`). `CATRetryError` is undefined under
  `@grant none`; it exists with any other grant or with no `@grant` line. The retry queue is checked every 5
  seconds, so a retry fires up to 5 seconds late; keep run time plus retry delay shorter than the cron interval
  so runs do not overlap.
- Write exactly one `@crontab` line. Every line is scheduled at runtime, but installation validates and the script
  list shows only the first, and one invalid extra line stops all of the script's jobs. Use 5 fields (`min hour
  day month weekday`); a 6-field form with seconds exists but is not recommended. The `once` extension limits a
  field's period to one run, counted when the run **starts** — a failed run uses up the period too, so retry
  failures with `CATRetryError`: `* * once * *` = at most once a day, `* once * * *` = at most once an hour,
  `* once(9-17) * * *` = once in each hour from 9 to 17. Full cron and `once` rules:
  [references/background.md](references/background.md).
- Log with `GM_log(message, "debug" | "info" | "warn" | "error")`: it lands in ScriptCat's log, the only place
  a background script's output shows up — ScriptCat's Logs page (filter by the script's `name` or `uuid`), or
  `sctl logs`. The script list shows only the run status (running / error / stopped) and a scheduled script's
  next run time. Release builds do not store `debug`, so log anything someone must read at `info` or above.

**User configuration**

- A `/* ==UserConfig== … ==/UserConfig== */` YAML block after the header gives the script a settings form in
  ScriptCat. Read a value with `GM_getValue("group.key")`. Format: [references/userconfig.md](references/userconfig.md).

## 4. API lookup

[references/api.md](references/api.md) lists every GM and CAT API ScriptCat implements, with the grant name, the
cases where ScriptCat differs from Tampermonkey, and which APIs are unavailable in the background. Read it
before using an API you are unsure about, then check the exact signature in `scriptcat.d.ts`.

[references/patterns.md](references/patterns.md) has ready-made building blocks: waiting for an element,
single-page-app route changes, a persistent menu switch, cross-origin requests, styles, localisation, and a
background run with retry.

## 5. Install and verify

Writing the file is half the job; the other half is seeing it run.

First run the static check bundled with this skill (Node 18+, no dependencies; paths are relative to this
skill's directory):

```sh
node scripts/check.mjs my-script.user.js   # exit 1 = errors that will break the script at runtime
```

It reports `error|warn <rule> <file>:<line> <message>`: APIs used without their `@grant`, GM APIs or
`unsafeWindow` under `@grant none`, a page script without `@match`, invalid `@crontab` expressions, request hosts
missing from `@connect`, and similar. Fix every error; read each warning and fix it or say why it does not apply.
It is a static check — it cannot tell whether the script does what the user asked.

- **sctl is available** (`sctl status` shows ScriptCat connected): install it into the user's ScriptCat and
  verify it in their browser, following [references/dev-loop.md](references/dev-loop.md). It also covers
  scouting the target page before you write code, iterating on a local file without an approval per change, and
  running background and scheduled scripts and reading their logs (`sctl run` / `sctl logs`). That loop runs inside the user's real browser, so the sctl skill's rules apply
  too — read it first if it is installed.
- **No sctl:** save the code as `<name>.user.js` and tell the user to install it — drag the file onto the
  ScriptCat dashboard, or create a new script in ScriptCat and paste the code. Say which page to open (page
  script) or where to look (background: the run status in the script list, and the script's output on
  ScriptCat's Logs page).

Whichever path you take, report what you actually observed: "installed and the button appears on
example.com" is a result; "should work" is not.

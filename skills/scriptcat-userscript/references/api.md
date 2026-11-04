# API reference

Everything ScriptCat implements, by grant. Exact signatures: `scriptcat.d.ts` (`src/types/scriptcat.d.ts` in this
repository, or <https://raw.githubusercontent.com/scriptscat/scriptcat/main/src/types/scriptcat.d.ts>). A grant
that is not listed here does nothing in ScriptCat.

`@grant GM_foo` also exposes `GM.foo` (and the reverse) when the rest of the name is identical, case included. `GM.*` variants return Promises; prefer them in new
code and `await` them. `GM_info` needs no grant; `unsafeWindow` needs none either but does not exist under
`@grant none`.

## Storage

| Grant | Notes |
|---|---|
| `GM_getValue` / `GM_setValue` / `GM_deleteValue` / `GM_listValues` | JSON-like values only. `setValue(k, undefined)` deletes the key (Tampermonkey stores it). Writes are async: `await GM.setValue` before closing a window or settling a background run |
| `GM_getValues` / `GM_setValues` / `GM_deleteValues` | Batch forms. `getValues({a: 0})` takes defaults; `getValues(["a"])` takes keys |
| `GM_addValueChangeListener` / `GM_removeValueChangeListener` | Listener `(name, oldValue, newValue, remote)`; `remote` is true for writes from another tab or script. With a shared `@storageName` this is a cross-script channel |

## Network and files

| Grant | Notes |
|---|---|
| `GM_xmlhttpRequest` / `GM.xmlHttpRequest` (two separate grants) | Cross-origin, bypasses CSP, can set `user-agent`, `origin`, `referer`, `cookie`, `host`. Hosts not in `@connect` require user approval. `anonymous: true` with `cookie` sends only that cookie. `responseType: "stream"` is basic. `redirect` replaces the old `maxRedirects` |
| `GM_download` | Returns a handle with `abort()`. **Differs from Tampermonkey:** the default `native` mode honours `@connect` (undeclared hosts prompt the user); `downloadMode: "browser"` does not. A blob URL downloads directly — background scripts can produce files this way |
| `GM_cookie` (`GM.cookie.list/set/delete`) | Requires `@connect <host>` and user approval. Uses the cookie store of the window the script runs in (normal or incognito). `sameSite` unsupported |
| `CAT_fetchBlob(url)` | Fetch a blob URL into a `Blob` (pairs with stream responses) |
| `CAT_createBlobUrl(blob)` | Blob URL whose lifetime ScriptCat manages |
| `CAT_fetchDocument(url)` | Fetch and parse a URL into a `Document` |
| `CAT_fileStorage(action, details)` | `list` / `upload` / `download` / `delete` / `config` on the cloud storage the user configured in ScriptCat; files live under `app/<script uuid>/` unless `baseDir` is set |
| `GM_getResourceText` / `GM_getResourceURL` | Read `@resource name url` entries. Binary resources: use `getResourceURL` (base64 data URL, or `true` as second argument for a blob URL) |

## Page

| Grant | Notes |
|---|---|
| `GM_addStyle(css)` | Returns the `<style>` element; bypasses CSP |
| `GM_addElement([parent,] tag, attrs)` | Inserts an element; bypasses CSP for `<script>`/`<style>` (on Firefox an injected `<script>` is still subject to the page's CSP) |
| `window.onurlchange` | Enables the `urlchange` event for single-page apps: `window.addEventListener("urlchange", e => e.url)` |
| `window.close` / `window.focus` | Let the script close or focus its own tab |
| `GM_setClipboard(data, info)` | No completion callback |

## Tabs and UI

| Grant | Notes |
|---|---|
| `GM_openInTab(url, options)` | Options `active` (default true), `insert`, `setParent`, `pinned`, `incognito`, `useOpen` (`window.open`, for custom protocols like `vscode://`). Returns a handle with `close()` and `onclose` |
| `GM_closeInTab(id)` | Close a tab opened by `GM_openInTab` |
| `GM_getTab` / `GM_saveTab` / `GM_getTabs` | Per-tab storage that lives until the tab closes. Not available in background scripts |
| `GM_registerMenuCommand(name, fn, options)` | Menu in ScriptCat's popup and the page's context menu. Same `name` is shown once unless `individual: true`; pass `id` to update an entry; `autoClose: false` keeps the popup open; `nested: false` lifts it one level in the context menu; an empty `name` with no listener is a separator. Works in background scripts |
| `GM_unregisterMenuCommand(id)` | |
| `CAT_registerMenuInput(name, fn, options)` / `CAT_unregisterMenuInput` | Menu entry that asks the user for a value first (`inputType`: `text`/`number`/`boolean`, `title`, `inputLabel`, `inputDefaultValue`, `inputPlaceholder`) |
| `GM_notification(details)` | `progress` and up to two `buttons` (not on Firefox). Reuse a `tag` to update a notification; `timeout` closes it |
| `GM_closeNotification(id)` / `GM_updateNotification(id, details)` | ScriptCat-only; `updateNotification` not on Firefox |
| `CAT_userConfig()` | Open the script's user-config form (see [userconfig.md](userconfig.md)) |

## Logging and lifecycle

| Grant | Notes |
|---|---|
| `GM_log(message, level?)` | Level `debug`/`info`/`warn`/`error`. Goes to ScriptCat's run log — the place to look for background-script output |
| `CAT_scriptLoaded()` | Promise that resolves once an `@early-start` script is fully loaded; read `GM_info.userLanguage` after it |

`GM_info` carries the script metadata (`GM_info.script`), `scriptMetaStr`, `scriptHandler` (`"ScriptCat"`),
`version`, and `userLanguage` (ScriptCat's UI language, e.g. `"zh-CN"` — use it to localise the script's own
text). `CATRetryError` is a global in background scripts (see [background.md](background.md#retry)).

## Agent APIs

`CAT.agent.conversation`, `.dom`, `.model`, `.opfs`, `.skills`, `.task` — each a separate grant — expose
ScriptCat's built-in AI agent to scripts. Their contracts are large; read the `CATAgent*` namespaces in
`scriptcat.d.ts` and <https://docs.scriptcat.org/docs/dev/agent/> before using them.

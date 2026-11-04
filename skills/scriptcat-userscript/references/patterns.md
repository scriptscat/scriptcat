# Patterns

Small building blocks that come up in most scripts. Each one lists the grants it needs; merge them into the
script's header. Signatures: `scriptcat.d.ts`.

## Wait for an element

Pages render late and re-render often. Wait instead of assuming the element exists at injection time. No grant.

```js
function waitFor(selector, { root = document, timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const found = root.querySelector(selector);
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    observer.observe(root === document ? document.documentElement : root, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`waitFor timed out: ${selector}`));
    }, timeout);
  });
}

const button = await waitFor("#toolbar");
```

To act on every matching element that ever appears (list items, feed entries), keep the observer running and mark
handled nodes, e.g. with `el.dataset.myScript = "1"`, instead of disconnecting.

## Single-page apps

The script runs once per real page load; an SPA changes views without one. Grant: `window.onurlchange`.

```js
function onRoute(url) {
  if (new URL(url).pathname.startsWith("/watch")) enhanceWatchPage();
}
onRoute(location.href);
if (window.onurlchange === null) {
  window.addEventListener("urlchange", (e) => onRoute(e.url));
}
```

`window.onurlchange === null` means the feature is available (it relies on the browser's Navigation API). Combine
with `waitFor`: the new view's DOM usually arrives after the URL changes.

## A menu switch that remembers its state

Grants: `GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`.

```js
const MENU_ID = "toggle-enabled";
function renderMenu() {
  const enabled = GM_getValue("enabled", true);
  GM_registerMenuCommand(
    enabled ? "✅ Enabled (click to disable)" : "⛔ Disabled (click to enable)",
    () => {
      GM_setValue("enabled", !enabled);
      renderMenu();
    },
    { id: MENU_ID, autoClose: false }
  );
}
renderMenu();
```

Registering again with the same `id` replaces the entry's label and listener instead of adding a second entry.
The menu shows in ScriptCat's popup.

## Cross-origin request

Grants: `GM_xmlhttpRequest`; header: `@connect api.example.com` for every host you call (a subdomain matches
its parent's `@connect`). Wrapping the callback API keeps the code linear:

```js
function request(details) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      ...details,
      onload: (res) =>
        res.status >= 200 && res.status < 300 ? resolve(res) : reject(new Error(`HTTP ${res.status}`)),
      onerror: () => reject(new Error("network error")),
      ontimeout: () => reject(new Error("timeout")),
    });
  });
}

const res = await request({ url: "https://api.example.com/items", responseType: "json", timeout: 15000 });
const items = res.response;
```

The browser's cookies for the target site are sent unless `anonymous: true`. Requests to the page's own host
need no `@connect`.

## Styles

Grant: `GM_addStyle`. It returns the `<style>` element and is not blocked by the page's CSP.

```js
const style = GM_addStyle(`
  .my-script-badge { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; }
`);
// style.remove() to undo
```

Prefix your own classes (`my-script-…`) so they do not collide with the site's.

## Localise the script's own text

No grant: `GM_info.userLanguage` is ScriptCat's interface language, e.g. `"zh-CN"`. It can be empty (in an
`@early-start` script, read it after `await CAT_scriptLoaded()`), so fall back to the browser's language.

```js
const MESSAGES = {
  en: { hello: "Hello" },
  "zh-CN": { hello: "你好" },
};
const lang = GM_info.userLanguage || navigator.language;
const t = (key) => (MESSAGES[lang] ?? MESSAGES[lang.split("-")[0]] ?? MESSAGES.en)[key];
```

## Background or scheduled run with retry

Grants: `GM_xmlhttpRequest`, `GM_setValue`, `GM_log`, plus `@connect` for the host. `CATRetryError` needs no
grant.

```js
return (async () => {
  GM_log("check-in started", "info");
  let res;
  try {
    res = await request({ url: "https://api.example.com/checkin", method: "POST", responseType: "json" });
  } catch (err) {
    // Temporary failure: try again in 10 minutes. A plain reject would use up a `once` period.
    throw new CATRetryError(`check-in failed: ${err.message}`, 600);
  }
  await GM.setValue("lastCheckin", { at: Date.now(), result: res.response });
  GM_log("check-in done", "info");
  return res.response.message; // logged as the run's result
})();
```

`request` is the helper from [Cross-origin request](#cross-origin-request). Throwing inside the `async` function
rejects the returned Promise, which is what ScriptCat reads. Settle only after the last `await`; see
[background.md](background.md) for the lifecycle and retry rules.

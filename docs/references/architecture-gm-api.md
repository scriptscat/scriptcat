# GM API system

## The GM API System

The `GM_*` / `GM.*` functions a userscript calls are not one function — each is a small client that forwards
across contexts to a privileged handler, then streams the result back. The implementation is split:

- **Content side** ([`src/app/service/content/gm_api/`](../../src/app/service/content/gm_api)) — what runs *near*
  the userscript. Synchronous-feeling APIs (`GM_getValue`, `GM_log`) and the client half of async ones
  (`GM_xmlhttpRequest`, `GM_setValue`). Built on `GM_Base`, which owns the messaging plumbing.
- **Service-worker side** ([`src/app/service/service_worker/gm_api/`](../../src/app/service/service_worker/gm_api))
  — the privileged half: permission verification, cross-origin requests, DNR rule building.
- **Offscreen side** ([`src/app/service/offscreen/gm_api.ts`](../../src/app/service/offscreen/gm_api.ts)) —
  DOM-dependent operations for background scripts (page-context XHR, `window.open`, clipboard).
- **Values** flow through `ValueService` and are broadcast so every tab running the same script sees updates.

### Registration: the `@GMContext.API` decorator

APIs are declared with a decorator that maps a method to the `@grant` that unlocks it
([`gm_context.ts`](../../src/app/service/content/gm_api/gm_context.ts)):

```ts
function GMContextApiSet(grant, fnKey, api, param) { /* apis.get(grant).push({ fnKey, api, param }) */ }

class GMContext {
  static API(param: ApiParam = {}) {
    return (target, propertyName, descriptor) => {
      const follow = param.follow ?? propertyName;        // the real @grant
      GMContextApiSet(follow, propertyName, descriptor.value, param);
      if (param.alias) GMContextApiSet(param.alias, param.alias, descriptor.value, param); // GM_x ↔ GM.x
    };
  }
}
```

When a script context is built, ScriptCat reads the script's `@grant` list and installs exactly the matching
APIs onto the script's `GM` object. On the SW side a parallel `@PermissionVerify.API` decorator wraps handlers
with permission checks before they run.

### End-to-end: `GM_xmlhttpRequest`

```
userscript GM_xmlhttpRequest(details)            // inject realm
   └─ content/gm_api/gm_xhr.ts                    // client: resolve url/data, open a MessageConnect
        └─ ExtensionMessage "GM_xmlhttpRequest"   // → service worker
             └─ service_worker/gm_api/gm_api.ts   // @PermissionVerify.API gate
                  ├─ buildDNRRule(...)            // declarativeNetRequest: spoof headers/referer
                  └─ fetch/XHR strategy           // real cross-origin request
        ◄─ streamed chunks over the MessageConnect
   ◄─ response object reassembled → details.onload(resp)
```

The **persistent connection** (`MessageConnect`, opened via `connect()`) matters here: the response is streamed
back in chunks rather than returned by a single request/reply, which is how progress events and large bodies
work.

### Adding a GM API (sketch)

1. Add the method to the content `GMApi` with `@GMContext.API({ alias: "GM.foo" })`; for sync APIs return
   directly, for async ones forward via `sendMessage`/`connect`.
2. If it needs privilege (network, cookies, tabs), add the handler on the SW `GMApi` with
   `@PermissionVerify.API(...)`.
3. If it needs DOM, route through the offscreen GM API instead.
4. Register the `@grant` so the linter and the context builder recognize it (see
   [`packages/eslint`](../../packages/eslint)).

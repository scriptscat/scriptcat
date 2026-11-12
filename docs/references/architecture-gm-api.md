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
- **Values** flow through `ValueService` and are pushed to every frame running a script with the same storage
  name; see [Value updates](#value-updates).

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

### Value updates

`GM_setValue` / `GM_setValues` are saved by `ValueService.setValues`
([`service_worker/value.ts`](../../src/app/service/service_worker/value.ts)) under a per-storage-name lock. Each
save gets a new, increasing `revision`, stored on the `Value` record and sent with the update. Updates reach
other frames over one value Port per content-script frame
([`content/value_port.ts`](../../src/app/service/content/value_port.ts) ↔
[`service_worker/value_port.ts`](../../src/app/service/service_worker/value_port.ts)); the SW keeps the
storage-name → Port index in memory only.

- **Writer receipt.** The writer's own update comes back in the `GM_setValue` RPC response, not only through
  the Port. The Port push for the same update id is then ignored, so the writer neither waits on a lost push
  nor fires its listeners twice.
- **Subscription and resync.** The Port is dropped whenever the SW stops, and is reopened when a page is
  restored from bfcache. On every (re)connect the frame sends, per storage name, the last `revision` it knows and the script uuids it
  runs. `ValueService.subscribeSnapshot` registers the Port and reads the stored revision inside the same
  write lock, so a concurrent save is either included in the reply or pushed to the newly registered Port.
  If the revisions differ, the reply carries a snapshot of each script's values. The frame buffers pushes
  until that reply arrives and drops any push whose revision is not newer than what it already has.
- **Listener semantics after a gap.** If the scripts are still loading, the snapshot replaces the values they
  will start with. Once they are running, `runtime/valueSync` compares the snapshot with the cached values key
  by key and fires `GM_addValueChangeListener` once per changed key with `remote = true`. Intermediate values
  missed during the gap are not replayed.
- **Reconnect policy.** A Port that was acknowledged and stayed up for at least a second reconnects
  immediately when it drops. Otherwise the frame retries with backoff, so a SW that keeps failing cannot cause
  a tight reconnect loop. Once the extension context is invalidated (reload, update, uninstall), the frame
  stops reconnecting.

### Adding a GM API (sketch)

1. Add the method to the content `GMApi` with `@GMContext.API({ alias: "GM.foo" })`.
2. **Pick the transport by shape, not by habit** — check the nearest existing API of the same shape before
   choosing:
   - **Single request/reply** (a value lookup, a one-shot action) → `sendMessage`.
   - **Streaming/progress, a large response, or a persistent bidirectional exchange** (e.g.
     `GM_xmlhttpRequest`'s chunked response above) → `connect()` (`MessageConnect`).
3. If it needs privilege (network, cookies, tabs), add the handler on the SW `GMApi`
   ([`src/app/service/service_worker/gm_api/`](../../src/app/service/service_worker/gm_api)) with
   `@PermissionVerify.API(...)`.
4. If it needs DOM, route through the offscreen GM API instead:
   [`src/app/service/offscreen/gm_api.ts`](../../src/app/service/offscreen/gm_api.ts).
5. Register the `@grant` so the linter and the context builder recognize it. The grant/compat map is
   specifically [`packages/eslint/compat-grant.js`](../../packages/eslint/compat-grant.js) — not that package's
   other tables (`compat-headers.js`, or `linter-config.ts`, which holds `rules`/`globals`/`env` and no grant
   data).

### Agent/CAT API is the same recipe with dotted grants

The Agent subsystem's `CAT.agent.*` surface (`src/app/service/content/gm_api/cat_agent.ts` — see
[`architecture-agent.md`](./architecture-agent.md)) goes through the *same* registration path as the
traditional GM API: `@GMContext.API` on the content side
([`cat_agent.ts`](../../src/app/service/content/gm_api/cat_agent.ts)), `@PermissionVerify.API` on the SW side
([`gm_agent.ts`](../../src/app/service/service_worker/gm_api/gm_agent.ts)), and a registered grant in
[`compat-grant.js`](../../packages/eslint/compat-grant.js). What differs is the naming and transport
shape — the grant is dotted (`CAT.agent.conversation`) and bound with `follow:` rather than `alias:`, the SW
handlers set `dotAlias: false`, and conversation chat streams over `connect()` instead of `sendMessage`. Copy
the nearest existing `CAT.agent.*` method rather than a `GM_*` one.

# ScriptCat Architecture & Internals

> **Audience.** Contributors who work on **ScriptCat itself** — the browser extension — not script authors.
> If you want to *write* userscripts, read [docs.scriptcat.org](https://docs.scriptcat.org/) instead.
>
> **Scope.** This document is the deep-dive companion to [`AGENTS.md`](../AGENTS.md) (terse contributor
> guide + conventions) and [`CONTRIBUTING.md`](../CONTRIBUTING.md) (setup + PR workflow). It explains *how the
> pieces fit together and why*: the multi-process model, message passing, the service/data layers, the GM API
> system, script execution, and the build pipeline. File references use repo-relative paths and are clickable.

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [The Five Contexts (Process Model)](#2-the-five-contexts-process-model)
3. [Message Passing](#3-message-passing)
4. [The Service Layer](#4-the-service-layer)
5. [The Data Layer (`Repo<T>` + DAOs)](#5-the-data-layer-repot--daos)
6. [The GM API System](#6-the-gm-api-system)
7. [Script Execution](#7-script-execution)
8. [Build Pipeline & Manifest](#8-build-pipeline--manifest)
9. [Workspace Packages](#9-workspace-packages)
10. [Extending ScriptCat — Recipes](#10-extending-scriptcat--recipes)
11. [Testing the Internals](#11-testing-the-internals)

---

## 1. The Big Picture

ScriptCat is a **Manifest V3** browser extension that runs Tampermonkey-compatible userscripts, plus its own
**background** and **scheduled** script types that have no Tampermonkey equivalent. MV3 fragments an extension
into several sandboxed JavaScript realms that cannot share memory; ScriptCat therefore runs as a small
**distributed system** of cooperating contexts that talk over message channels.

Three ideas explain almost everything in the codebase:

- **Contexts are processes.** Each entry point (`service_worker`, `content`, `inject`, `offscreen`, `sandbox`)
  is an isolated realm. They never share objects — only serializable messages.
- **One message layer, several transports.** [`packages/message`](../packages/message) abstracts
  `chrome.runtime`, `postMessage`, and DOM `CustomEvent` behind a single RPC + pub/sub API, so services are
  written against interfaces (`Server`/`Group`/`Client`/`IMessageQueue`), not raw browser APIs.
- **Services are constructor-injected.** Domain logic lives in services that receive their `Group`,
  `IMessageQueue`, and DAOs through the constructor and register message handlers in an `init()` method. This
  is what makes the system testable with the mock message bus.

```
                                ┌───────────────────────────────────────────────┐
                                │              SERVICE WORKER                     │
                                │  central hub: script CRUD, chrome.* APIs,       │
                                │  permission checks, resource cache, routing     │
                                │  Server("serviceWorker") + MessageQueue         │
                                └───────┬───────────────────────────────┬─────────┘
                ExtensionMessage        │                               │   ServiceWorkerMessageSend (Chrome)
                (chrome.runtime)        │                               │   / EventPageOffscreenManager (Firefox)
                                        ▼                               ▼
                          ┌──────────────────────┐         ┌──────────────────────────┐
                          │     CONTENT SCRIPT    │         │     OFFSCREEN DOCUMENT    │
                          │  bridges SW ↔ inject  │         │  DOM-capable background   │
                          │  Server("content")    │         │  Server("offscreen")      │
                          └──────────┬───────────┘         └─────────────┬────────────┘
                       CustomEventMessage                        WindowMessage
                       (DOM CustomEvent)                         (window.postMessage)
                                     ▼                                   ▼
                          ┌──────────────────────┐         ┌──────────────────────────┐
                          │     INJECT SCRIPT     │         │       SANDBOX (iframe)    │
                          │  page realm,          │         │  with(){} script eval,    │
                          │  unsafeWindow access  │         │  cron scheduling          │
                          │  Server("inject")     │         │  Server("sandbox")        │
                          └──────────────────────┘         └──────────────────────────┘

         MessageQueue (pub/sub) broadcasts state changes across ALL contexts.
```

---

## 2. The Five Contexts (Process Model)

Each context is a separate bundle (see [§8](#8-build-pipeline--manifest)) with its own entry file in `src/`.

| Context | Entry | Realm / capabilities | Bootstraps |
|---|---|---|---|
| **Service Worker** | [`src/service_worker.ts`](../src/service_worker.ts) | No DOM. Owns `chrome.*` privileged APIs, storage, permissions, routing. | `ExtensionMessage(true)` → `Server("serviceWorker")` + `MessageQueue` → `ServiceWorkerManager` |
| **Content** | [`src/content.ts`](../src/content.ts) | Isolated content-script world. Bridges SW and the page. | `CustomEventMessage` channel to inject + `Server("content")` → `ScriptRuntime` |
| **Inject** | [`src/inject.ts`](../src/inject.ts) | Page (`MAIN`) world. Has `unsafeWindow`; runs page userscripts. | `CustomEventMessage` to content + `Server("inject")` |
| **Offscreen** | [`src/offscreen.ts`](../src/offscreen.ts) | DOM-capable background page (Blobs, clipboard, DOM scraping, local storage). | `ExtensionMessage()` + `WindowMessage(window, sandbox)` → `OffscreenManager` |
| **Sandbox** | [`src/sandbox.ts`](../src/sandbox.ts) | `sandbox`ed iframe inside offscreen. Evaluates background/scheduled scripts; runs cron. | `WindowMessage(window, parent)` + `Server("sandbox")` → `SandboxManager` |

There is also a sixth bundle, [`src/scripting.ts`](../src/scripting.ts), injected via `chrome.userScripts` /
`chrome.scripting` to carry the compiled page-script payload (see [§7](#7-script-execution)).

### Service-worker bootstrap

[`src/service_worker.ts`](../src/service_worker.ts) is the canonical example of how a context wires itself up:

```ts
const message = new ExtensionMessage(true);          // backgroundPrimary = true
const server = new Server("serviceWorker", message); // RPC listener, action prefix "serviceWorker/"
const messageQueue = new MessageQueue();             // pub/sub broadcast bus

const hasOffscreenDocument = typeof chrome.offscreen?.createDocument === "function";
if (hasOffscreenDocument) {
  const offscreen = new ServiceWorkerMessageSend();  // Chrome: talk to the real offscreen document
  new ServiceWorkerManager(server, messageQueue, offscreen).initManager();
  setupOffscreenDocument();                          // chrome.offscreen.createDocument(...)
} else {
  const offscreen = new EventPageOffscreenManager(message); // Firefox MV3: event page IS the DOM env
  new ServiceWorkerManager(server, messageQueue, offscreen).initManager();
}
```

### Chrome vs Firefox: the offscreen split

This is the most important platform divergence to understand. MV3 service workers have **no DOM**, but
ScriptCat needs DOM for things like `DOMParser`, Blobs, and clipboard. Chrome solves this with the
**Offscreen API** (a hidden document). Firefox MV3 has no offscreen API, so its background **event page**
already has DOM and plays the offscreen role directly.

- **Chrome:** SW → Offscreen uses [`ServiceWorkerMessageSend`](../packages/message/window_message.ts) (it
  finds the offscreen client via `clients.matchAll()` and `postMessage`s it); Offscreen → SW replies over
  `ExtensionMessage` (`chrome.runtime`).
- **Firefox:** [`EventPageOffscreenManager`](../src/app/service/offscreen/event_page_manager.ts) substitutes
  for the offscreen document; `service_worker.ts` emits `preparationOffscreen` immediately because the DOM
  environment is already live.

Services never see this difference: they receive an `IOffscreenSend` and call `.init()`.

---

## 3. Message Passing

Everything cross-context flows through [`packages/message`](../packages/message). It provides **two
communication styles** over **several transports**.

### 3.1 Transports

| Class | File | Connects | Underlying API |
|---|---|---|---|
| `ExtensionMessage` | [`extension_message.ts`](../packages/message/extension_message.ts) | SW ↔ Content / Inject / Offscreen | `chrome.runtime.sendMessage` / `onConnect` (+ `onUserScript*` on Firefox) |
| `CustomEventMessage` | [`custom_event_message.ts`](../packages/message/custom_event_message.ts) | Content ↔ Inject | DOM `CustomEvent` dispatch (bypasses page tampering) |
| `WindowMessage` | [`window_message.ts`](../packages/message/window_message.ts) | Offscreen ↔ Sandbox | `window.postMessage` |
| `ServiceWorkerMessageSend` | [`window_message.ts`](../packages/message/window_message.ts) | SW → Offscreen (Chrome) | `clients.matchAll()` + `postMessage` |
| `MessageQueue` | [`message_queue.ts`](../packages/message/message_queue.ts) | All contexts (broadcast) | `chrome.runtime.sendMessage` + local `EventEmitter3` |
| `MockMessage` | [`mock_message.ts`](../packages/message/mock_message.ts) | Tests | in-memory `EventEmitter3` |

All transports implement the small `Message` / `MessageSend` / `MessageConnect` interfaces in
[`types.ts`](../packages/message/types.ts), so higher layers don't care which one they got.

### 3.2 Style 1 — Request/Reply RPC (`Server` / `Group` / `Client`)

A request/reply call is identified by an **action string** like `"script/install"`.

- [`Server`](../packages/message/server.ts) listens on a transport and routes by **action prefix**. The SW
  creates `new Server("serviceWorker", message)`, so it only handles actions beginning with `serviceWorker/`.
- [`Group`](../packages/message/server.ts) namespaces handlers. `server.group("script")` returns a group whose
  `.on("install", fn)` registers the full action `script/install`. Groups can nest and carry **middleware**
  (`group.use(fn)`), which is how `RuntimeService` delays handling until initialization finishes.
- [`Client`](../packages/message/client.ts) is the caller side. It sends an action + params and awaits the
  reply.

Replies are wrapped in a uniform envelope: `{ code: 0, data }` on success or `{ code: -1, message }` on error,
so the calling side can reject the promise on failure.

```ts
// SW side — register
class ValueService {
  init(/* … */) {
    this.group.on("getScriptValue", this.getScriptValue.bind(this));
    this.group.on("setScriptValues", this.setScriptValues.bind(this));
  }
}
// Caller side — invoke
const value = await client.do("value/getScriptValue", { uuid });
```

### 3.3 Style 2 — Pub/Sub broadcast (`MessageQueue`)

[`MessageQueue`](../packages/message/message_queue.ts) is a fire-and-forget bus for **state changes** that any
context may care about. `publish(topic, data)` both `chrome.runtime.sendMessage`s the payload to every context
*and* emits locally; `subscribe(topic, fn)` registers a listener and returns an unsubscribe function; `emit` is
local-only (no broadcast). `group(name)` namespaces topics and supports middleware.

This is how data stays consistent without shared memory. For example, when a script is deleted the SW
`publish`es `deleteScripts`, and `ValueService` reacts by garbage-collecting orphaned values:

```ts
this.mq.subscribe<TDeleteScript[]>("deleteScripts", async (data) => {
  for (const { storageName } of data) {
    const stillUsed = await this.scriptDAO.find((_, s) => getStorageName(s) === storageName);
    if (stillUsed.length === 0) await this.valueDAO.delete(storageName);
  }
});
```

**Rule of thumb:** use **RPC** when you need an answer; use **MessageQueue** to announce that something
changed.

### 3.4 Testing the bus

[`MockMessage`](../packages/message/mock_message.ts) implements the full `Message` interface with an in-memory
`EventEmitter3` and no browser APIs, so message-driven services can be unit-tested. Tests wire it up directly —
e.g. [`tests/utils.ts`](../tests/utils.ts) builds the SW/offscreen mock buses from it. The separate `chrome.*`
mock ([`@Packages/chrome-extension-mock`](../packages/chrome-extension-mock)) is what
[`tests/vitest.setup.ts`](../tests/vitest.setup.ts) registers globally.

---

## 4. The Service Layer

Services live under `src/app/service/<context>/` — **split by the context they run in** — and hold the domain
logic. They are deliberately "dumb plumbing on the outside, smart logic on the inside": construction is pure DI,
wiring happens once in a manager, and message handlers are registered in `init()`.

```
src/app/service/
├── service_worker/   script.ts · value.ts · resource.ts · runtime.ts · popup.ts · subscribe.ts
│                     synchronize.ts · system.ts · permission_verify.ts · clipboard.ts · download.ts
│                     gm_api/ (SW-side GM handlers) · index.ts (ServiceWorkerManager)
├── content/          script_runtime.ts · script_executor.ts · exec_script.ts · create_context.ts · gm_api/
├── offscreen/        background-script runner, gm_api, event_page_manager.ts
└── sandbox/          runtime.ts (background/scheduled eval + cron)
```

### 4.1 The DI pattern

Every service takes its collaborators through the constructor — never `new`s them internally. A representative
signature ([`script.ts`](../src/app/service/service_worker/script.ts)):

```ts
class ScriptService {
  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly group: Group,            // RPC namespace for "script/*"
    private readonly mq: IMessageQueue,        // broadcast bus
    private readonly valueService: ValueService,
    private readonly resourceService: ResourceService,
    private readonly scriptDAO: ScriptDAO      // data access
  ) {}

  init() {
    this.group.on("getAllScripts", this.getAllScripts.bind(this));
    this.group.on("install", this.installScript.bind(this));
    this.group.on("enable", this.enableScript.bind(this));
    // … ~20 more handlers
  }
}
```

Two consequences worth internalizing:

- **Depend on narrow interfaces** (`IMessageQueue`, not `MessageQueue`) so tests can pass `MockMessage`.
- **No work in the constructor.** Handler registration and subscriptions belong in `init()`, called by the
  manager after the whole graph is built (this avoids ordering hazards between mutually dependent services).

### 4.2 Wiring: `ServiceWorkerManager`

[`src/app/service/service_worker/index.ts`](../src/app/service/service_worker/index.ts) is the composition
root for the SW context. It builds DAOs, hands each service its own `group("name")` namespace and the shared
`mq`, then calls `init()`:

```ts
const scriptDAO = new ScriptDAO();
scriptDAO.enableCache();

const resource = new ResourceService(this.api.group("resource"), this.mq); resource.init();
const value    = new ValueService(this.api.group("value"), this.mq);
const script   = new ScriptService(systemConfig, this.api.group("script"), this.mq, value, resource, scriptDAO);
script.init();
const runtime  = new RuntimeService(systemConfig, this.api.group("runtime"), this.offscreenSend, this.mq,
                                    value, script, resource, scriptDAO, localStorageDAO); runtime.init();
const popup    = new PopupService(this.api.group("popup"), this.mq, runtime, scriptDAO, systemConfig); popup.init();
value.init(runtime, popup);   // late-bound cross deps resolved after construction
// … synchronize, subscribe, system
```

The `group("name")` call is what gives each service its action prefix (`resource/*`, `value/*`, `script/*`, …)
on the single `serviceWorker` `Server`. Other contexts have their own managers (`OffscreenManager`,
`SandboxManager`, `ScriptRuntime` for content/inject) following the same shape.

---

## 5. The Data Layer (`Repo<T>` + DAOs)

Persistence is a thin generic over `chrome.storage.local` with an optional in-memory cache, in
[`src/app/repo/repo.ts`](../src/app/repo/repo.ts).

### 5.1 `Repo<T>`

```ts
export abstract class Repo<T> {
  useCache = false;
  constructor(protected prefix: string) {
    if (!prefix.endsWith(":")) this.prefix += ":";   // every key is "<prefix>:<key>"
  }
  enableCache() { this.useCache = true; }            // load-once, serve from memory
  protected joinKey(key: string) { return this.prefix + key; }
  protected _save(key, val): Promise<T> { /* cache or storage */ }
  get(key): Promise<T | undefined>;
  gets(keys): Promise<(T | undefined)[]>;
  getRecord(keys): Promise<Partial<Record<string, T>>>;
  find(filter?): Promise<T[]>;  findOne(filter?): Promise<T | undefined>;  all(): Promise<T[]>;
  update(key, val): Promise<T | false>;  updates(keys, val);
  delete(key): Promise<void>;  deletes(keys): Promise<void>;
}
```

Design notes:

- **Key scheme:** entities are stored under `"<prefix>:<key>"` so a single `chrome.storage.local` namespace
  holds every entity type without collisions. `find`/`all` scan the prefix.
- **Cache:** `enableCache()` switches reads/writes to a process-local cache that mirrors storage — used for
  hot collections (scripts) to avoid repeated async reads. A subclass that overrides `joinKey` can hash keys
  (e.g. resources keyed by URL via a UUID-v5 namespace).
- **Storage errors are logged, not thrown** — `chrome.runtime.lastError` is checked and reads continue, since
  a transient storage hiccup should not crash the worker.

### 5.2 The DAOs

| DAO | File | Entity | Notes |
|---|---|---|---|
| `ScriptDAO` | [`scripts.ts`](../src/app/repo/scripts.ts) | `Script` (metadata) | Cached; companion `ScriptCodeDAO` stores source separately to keep metadata reads small; dedup via `searchExistingScript` |
| `ValueDAO` | [`value.ts`](../src/app/repo/value.ts) | `Value` (GM storage) | Keyed by storage name (per-script or shared `@storageName`) |
| `ResourceDAO` | [`resource.ts`](../src/app/repo/resource.ts) | `Resource` (`@require`/`@resource`) | Overrides `joinKey` to hash URLs; `CompiledResourceDAO` caches compiled deps with a version namespace |
| `PermissionDAO` | [`permission.ts`](../src/app/repo/permission.ts) | `Permission` | Composite key `<uuid>:<permission>:<value>` |
| `SubscribeDAO` | [`subscribe.ts`](../src/app/repo/subscribe.ts) | `Subscribe` | Keyed by feed URL |
| `FaviconDAO`, `LocalStorageDAO`, `ExportDAO` | `src/app/repo/*.ts` | misc | Same `Repo<T>` pattern |
| `LoggerDAO` | [`logger.ts`](../src/app/repo/logger.ts) | `Logger` | Extends `DAO<T>` (Dexie/IndexedDB), **not** `Repo<T>` — logs need indexed queries |

### 5.3 Adding an entity is tiny

```ts
export interface MyEntity { id: string; data: Record<string, unknown>; createtime: number; }

export class MyEntityDAO extends Repo<MyEntity> {
  constructor() { super("myentity"); }            // → keys "myentity:<id>"
  save(e: MyEntity) { return this._save(e.id, e); }
  findById(id: string) { return this.get(id); }
}
```

Then create it in the manager (`enableCache()` if hot), and expose operations via `group.on(...)`.

---

## 6. The GM API System

The `GM_*` / `GM.*` functions a userscript calls are not one function — each is a small client that forwards
across contexts to a privileged handler, then streams the result back. The implementation is split:

- **Content side** ([`src/app/service/content/gm_api/`](../src/app/service/content/gm_api)) — what runs *near*
  the userscript. Synchronous-feeling APIs (`GM_getValue`, `GM_log`) and the client half of async ones
  (`GM_xmlhttpRequest`, `GM_setValue`). Built on `GM_Base`, which owns the messaging plumbing.
- **Service-worker side** ([`src/app/service/service_worker/gm_api/`](../src/app/service/service_worker/gm_api))
  — the privileged half: permission verification, cross-origin requests, DNR rule building.
- **Offscreen side** ([`src/app/service/offscreen/gm_api.ts`](../src/app/service/offscreen/gm_api.ts)) —
  DOM-dependent operations for background scripts (page-context XHR, `window.open`, clipboard).
- **Values** flow through `ValueService` and are broadcast so every tab running the same script sees updates.

### 6.1 Registration: the `@GMContext.API` decorator

APIs are declared with a decorator that maps a method to the `@grant` that unlocks it
([`gm_context.ts`](../src/app/service/content/gm_api/gm_context.ts)):

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

### 6.2 End-to-end: `GM_xmlhttpRequest`

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

### 6.3 Adding a GM API (sketch)

1. Add the method to the content `GMApi` with `@GMContext.API({ alias: "GM.foo" })`; for sync APIs return
   directly, for async ones forward via `sendMessage`/`connect`.
2. If it needs privilege (network, cookies, tabs), add the handler on the SW `GMApi` with
   `@PermissionVerify.API(...)`.
3. If it needs DOM, route through the offscreen GM API instead.
4. Register the `@grant` so the linter and the context builder recognize it (see
   [`packages/eslint`](../packages/eslint)).

---

## 7. Script Execution

There are three execution paths; all share one **compilation** step.

### 7.1 Compilation — the `with(){}` sandbox wrapper

[`src/app/service/content/utils.ts`](../src/app/service/content/utils.ts) wraps user code so that global lookups
go through a controlled context object instead of the page's real globals:

```ts
// compileScriptCodeByResource(): the emitted wrapper
[
  "with(arguments[0]||this.$){",   // arguments[0] = the GM context (sandbox) / this.$ = one-shot Proxy
  preCode,                          // @require dependencies, concatenated
  "return(async function(){",       // async → user code may use top-level await
  code,                             // the user's script body
  "}).call(this);}",
].join("\n");
// then wrapped in try/catch and compiled with `new Function(code)`
```

Key points:

- `with(arguments[0]||this.$)` makes every bare identifier resolve against the GM context first. The context is
  a `Proxy` that intercepts reads, so the script sees `unsafeWindow`, the granted `GM_*` functions, and a
  controlled view of globals — not the raw page scope.
- Context and script name are passed as **unnamed `arguments`** (`arguments[0]`, `arguments[1]`) so user code
  can't shadow them by declaring variables of the same name.
- `.call(this)` preserves `this` because `chrome.userScripts` invokes the function free-standing (an arrow
  function would capture the wrong `this`).

### 7.2 Path A — Page scripts → `chrome.userScripts`

Normal userscripts run in the page. The SW builds a `RegisteredUserScript` from the script's `@match`/`@include`
patterns and registers the compiled payload (the `scripting` bundle) with `chrome.userScripts.register`, in the
`MAIN` or `USER_SCRIPT` world as required. At document time the content/inject pair
([`script_runtime.ts`](../src/app/service/content/script_runtime.ts),
[`exec_script.ts`](../src/app/service/content/exec_script.ts)) evaluates the compiled function with the GM
context.

### 7.3 Path B — Background scripts → Offscreen → Sandbox

`@background` scripts have no page. The SW asks the Offscreen document to host them, and the Offscreen forwards
evaluation into the **Sandbox iframe** ([`src/app/service/sandbox/runtime.ts`](../src/app/service/sandbox/runtime.ts)).
The sandbox wraps execution in `BgExecScriptWarp`, which supplies managed `setTimeout`/`setInterval` and
`CATRetryError` semantics so long-lived scripts can be cleanly torn down and retried.

### 7.4 Path C — Scheduled scripts → cron in Sandbox

`@crontab` scripts are background scripts triggered by a schedule. The sandbox parses the cron expression with
the `cron` library and keeps a `Map<uuid, CronJob[]>`; each fire runs the same `BgExecScriptWarp` path as
background scripts, with a retry list for transient failures.

---

## 8. Build Pipeline & Manifest

### 8.1 Rspack

[`rspack.config.ts`](../rspack.config.ts) emits one bundle per context/page. Entry points:

```
context bundles : service_worker · offscreen · sandbox · content · inject · scripting
UI pages (React): popup · options · install · batchupdate · confirm · import
workers         : editor.worker · ts.worker (Monaco) · linter.worker
```

Output goes to `dist/ext/src/[name].js` (cleaned each build). Notable behavior:

- **Path aliases** mirror `tsconfig.json`: `@App → src`, `@Packages → packages` (the `@Tests → tests` alias is
  test-only — defined in `vitest.config.ts` / `tsconfig.json`, not in the Rspack build).
- **Dev vs prod** via `NODE_ENV`: dev enables watch + inline source maps (skipped when `NO_MAP=true`, needed
  for incognito); prod minifies with SWC + Lightning CSS and drops debug.
- **Code splitting** pulls big libs into named `lib_*` chunks (react, monaco, radix-ui, dnd-kit, eslint, message),
  but **never splits** `service_worker`, `content`, `inject`, `scripting`, or the workers — MV3 requires those
  to be single self-contained files.
- **`CopyRspackPlugin`** copies [`src/manifest.json`](../src/manifest.json) — its `transform` rewrites the beta
  name (dev/beta) and, for react-tools builds, the CSP — and copies `_locales` and logos. The **version is not**
  stamped here; that happens at pack time (see [§8.3](#83-packaging--pnpm-run-pack)). **`HtmlRspackPlugin`**
  generates the page HTML shells.

The dist layout:

```
dist/ext/
├── manifest.json                 # version-stamped, browser-specialized at pack time
├── assets/  _locales/
└── src/
    ├── service_worker.js content.js inject.js scripting.js offscreen.js sandbox.js
    ├── popup.html/.js options.html/.js install.html/.js …
    ├── offscreen.html sandbox.html
    └── lib_*.js  editor.worker.js ts.worker.js linter.worker.js
```

### 8.2 Manifest (MV3)

[`src/manifest.json`](../src/manifest.json) highlights:

- `background.service_worker` (Chrome) **and** `background.scripts` (Firefox fallback) point at the same bundle.
- `permissions` include `userScripts`, `declarativeNetRequest`, `offscreen`, `scripting`, `cookies`,
  `webRequest`, `unlimitedStorage`, …; `optional_permissions` hold `background` + `userScripts`.
- `host_permissions: ["<all_urls>"]`, `incognito: "split"`.
- `sandbox.pages` declares `src/sandbox.html`; `web_accessible_resources` exposes `install.html` so a
  `.user.js` page can hand off to the install flow.

### 8.3 Packaging — `pnpm run pack`

[`scripts/pack.js`](../scripts/pack.js) drives release packaging: it derives the version (special-casing
alpha/beta into internal version codes), runs the production build, then **emits browser-specific manifests** —
the Chrome variant strips the Firefox `scripts`/CSP bits, while the Firefox variant drops `service_worker` and
`sandbox`, adds `browser_specific_settings` (Gecko ID, min Firefox 136), and filters Chrome-only permissions.
By default it writes the Chrome zip and a `.crx` signed with `dist/scriptcat.pem` (which you must supply
locally); the Firefox zip is gated behind the `PACK_FIREFOX` flag (`false` by default — testers flip it locally).

---

## 9. Workspace Packages

`pnpm` workspace packages under [`packages/`](../packages):

| Package | Purpose |
|---|---|
| [`message`](../packages/message) | The cross-context RPC + pub/sub layer (this doc, [§3](#3-message-passing)). Ships its own mocks. |
| [`filesystem`](../packages/filesystem) | Pluggable FS adapters for sync/backup — WebDAV, cloud drives (OneDrive, Google Drive, Dropbox, Baidu, S3), and zip archives. |
| [`cloudscript`](../packages/cloudscript) | Cloud-script integration. |
| [`eslint`](../packages/eslint) | The ESLint config + globals shipped to the in-editor linter for userscripts (`CAT_*`, `GM_*`, `CATRetryError`, …). |
| [`chrome-extension-mock`](../packages/chrome-extension-mock) | A mock `chrome.*` + message bus for Vitest. |

Project-local ESLint rules live in [`eslint-rules/`](../eslint-rules); the headline one,
`require-last-error-check`, enforces that `chrome.*` callbacks inspect `chrome.runtime.lastError` (wired in
[`eslint.config.mjs`](../eslint.config.mjs)).

---

## 10. Extending ScriptCat — Recipes

Map a change onto the existing extension points instead of inventing new structure:

- **A new cross-context message (RPC).** Pick the owning service, add `this.group.on("myAction", handler)` in
  its `init()`, and call it from the other context with a `Client`. No new transport, no new wiring.
- **A new broadcast event.** `this.mq.publish("myTopic", payload)` where state changes; `this.mq.subscribe(...)`
  wherever it matters. Use this, not RPC, for "X changed" notifications.
- **A new persisted entity.** Subclass `Repo<T>` ([§5.3](#53-adding-an-entity-is-tiny)), construct it in the
  manager, expose ops via `group.on`.
- **A new service.** Constructor-inject `Group` + `IMessageQueue` + DAOs; register handlers in `init()`;
  instantiate it in the relevant manager with its own `group("name")`.
- **A new GM API.** Decorate the method with `@GMContext.API` on the content side, add a privileged/offscreen
  handler if needed, register the `@grant` ([§6.3](#63-adding-a-gm-api-sketch)).

Follow the engineering principles in [`AGENTS.md`](../AGENTS.md): fix root causes (no `as any` / swallowed
errors), prefer direct replacement over adapter sandwiches, and keep scope tight — three similar lines beat a
premature abstraction.

---

## 11. Testing the Internals

- **Unit (Vitest + jsdom).** Co-locate `*.test.ts` next to source. `chrome.*` is mocked via
  [`@Packages/chrome-extension-mock`](../packages/chrome-extension-mock) (`tests/vitest.setup.ts`); message-bus
  behavior uses `MockMessage`. Run one file: `pnpm test -- --run path/to/file.test.ts`.
- **TDD first.** Write the failing test before the implementation. When a test fails, fix the code — don't edit
  the test to pass.
- **E2E (Playwright).** `e2e/*.spec.ts`, one worker, real Chromium. `pnpm run test:e2e` (first run:
  `pnpm run test:e2e:install`).
- **Before a PR:** lint + the relevant suite — owned by [`DEVELOP.md`](./DEVELOP.md) → *Testing*.

The DI + interface design is what makes this tractable: because services receive `IMessageQueue` and DAOs by
constructor, a test builds a service with `MockMessage` and an in-memory DAO and exercises handlers directly,
with no browser.

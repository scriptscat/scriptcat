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

- [The Big Picture](#the-big-picture)
- [The Five Contexts (Process Model)](#the-five-contexts-process-model)
- [Message Passing](#message-passing)
- [Service layer](./references/architecture-services.md)
- [Data layer (backend taxonomy: Repo\<T\> / DAO\<T\> / OPFSRepo)](./references/architecture-data.md)
- [GM API system](./references/architecture-gm-api.md)
- [Script execution](./references/architecture-execution.md)
- [Build pipeline & manifest](./references/architecture-build.md)
- [Agent subsystem](./references/architecture-agent.md)
- [Extending ScriptCat — Recipes](#extending-scriptcat--recipes)
- [Testing the Internals](#testing-the-internals)

---

## The Big Picture

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
- **Domain logic lives in services, wired explicitly.** Shared collaborators (a `Group`, `IMessageQueue`,
  another service, a DAO owned elsewhere) typically come in through the constructor; message handlers and
  subscriptions are registered through an explicit lifecycle method — commonly `init()`, though content and
  Agent code have their own equivalents. The exact dependency set and lifecycle shape vary by service and
  context — see [service layer](./references/architecture-services.md) for the real variance and the
  exceptions, rather than assuming one uniform constructor/`init()` template. This explicit-wiring style is
  what makes the system testable with the mock message bus.

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

         MessageQueue (pub/sub) broadcasts state changes among the contexts that instantiate it — currently
         Service Worker, Offscreen, and UI pages (see architecture-services.md for the exact list); content,
         inject, and sandbox don't hold a MessageQueue instance.
```

---

## The Five Contexts (Process Model)

Each context is a separate bundle (see [Build pipeline & manifest](./references/architecture-build.md)) with its own entry file in `src/`.

| Context | Entry | Realm / capabilities | Bootstraps |
|---|---|---|---|
| **Service Worker** | [`src/service_worker.ts`](../src/service_worker.ts) | No DOM. Owns `chrome.*` privileged APIs, storage, permissions, routing. | `ExtensionMessage(true)` → `Server("serviceWorker")` + `MessageQueue` → `ServiceWorkerManager` |
| **Content** | [`src/content.ts`](../src/content.ts) | Isolated content-script world. Bridges SW and the page. | `CustomEventMessage` channel to inject + `Server("content")` → `ScriptRuntime` |
| **Inject** | [`src/inject.ts`](../src/inject.ts) | Page (`MAIN`) world. Has `unsafeWindow`; runs page userscripts. | `CustomEventMessage` to content + `Server("inject")` |
| **Offscreen** | [`src/offscreen.ts`](../src/offscreen.ts) | DOM-capable background page (Blobs, clipboard, DOM scraping, local storage). | `ExtensionMessage()` + `WindowMessage(window, sandbox)` → `OffscreenManager` |
| **Sandbox** | [`src/sandbox.ts`](../src/sandbox.ts) | `sandbox`ed iframe inside offscreen. Evaluates background/scheduled scripts; runs cron. | `WindowMessage(window, parent)` + `Server("sandbox")` → `SandboxManager` |

There is also a sixth bundle, [`src/scripting.ts`](../src/scripting.ts), injected via `chrome.userScripts` /
`chrome.scripting` to carry the compiled page-script payload (see [Script execution](./references/architecture-execution.md)).

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

## Message Passing

Everything cross-context flows through [`packages/message`](../packages/message). It provides **two
communication styles** over **several transports**.

### Transports

| Class | File | Connects | Underlying API |
|---|---|---|---|
| `ExtensionMessage` | [`extension_message.ts`](../packages/message/extension_message.ts) | SW ↔ Content / Inject / Offscreen | `chrome.runtime.sendMessage` / `onConnect` (+ `onUserScript*` on Firefox) |
| `CustomEventMessage` | [`custom_event_message.ts`](../packages/message/custom_event_message.ts) | Content ↔ Inject | DOM `CustomEvent` dispatch (bypasses page tampering) |
| `WindowMessage` | [`window_message.ts`](../packages/message/window_message.ts) | Offscreen ↔ Sandbox | `window.postMessage` |
| `ServiceWorkerMessageSend` | [`window_message.ts`](../packages/message/window_message.ts) | SW → Offscreen (Chrome) | `clients.matchAll()` + `postMessage` |
| `MessageQueue` | [`message_queue.ts`](../packages/message/message_queue.ts) | Broadcast among the contexts that instantiate it — SW, Offscreen, UI pages | `chrome.runtime.sendMessage` + local `EventEmitter3` |
| `MockMessage` | [`mock_message.ts`](../packages/message/mock_message.ts) | Tests | in-memory `EventEmitter3` |

All transports implement the small `Message` / `MessageSend` / `MessageConnect` interfaces in
[`types.ts`](../packages/message/types.ts), so higher layers don't care which one they got.

### Style 1 — Request/Reply RPC (`Server` / `Group` / `Client`)

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

### Style 2 — Pub/Sub broadcast (`MessageQueue`)

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

### Testing the bus

[`MockMessage`](../packages/message/mock_message.ts) implements the full `Message` interface with an in-memory
`EventEmitter3` and no browser APIs, so message-driven services can be unit-tested. Tests wire it up directly —
e.g. [`tests/utils.ts`](../tests/utils.ts) builds the SW/offscreen mock buses from it. The separate `chrome.*`
mock ([`@Packages/chrome-extension-mock`](../packages/chrome-extension-mock)) is what
[`tests/vitest.setup.ts`](../tests/vitest.setup.ts) registers globally.

---

## Agent Subsystem

The Agent subsystem (`src/app/service/agent/`) is an AI-agent layer built **on top of** the five contexts
above — it is not a sixth execution context. `AgentService` is assembled inside `ServiceWorkerManager`
(`src/app/service/service_worker/index.ts`) from a set of narrower services (chat, task, skill, model, MCP,
background session, sub-agent, compact, DOM automation, OPFS); a content-side `CAT.agent.*` API
(`src/app/service/content/gm_api/cat_agent.ts`) exposes conversations to user scripts; offscreen and sandbox
are used for skill-script execution the same way regular background/scheduled scripts are. The UI (chat/task
pages) and userscript-driven conversations share the same streaming/tool-loop boundary in
`core/tool_registry.ts` / `service_worker/tool_loop_orchestrator.ts` — there is one tool loop, not a separate
implementation per caller. Full write-up, including the global vs. per-session tool registries, LLM
streaming/retry/compact flow, background-session/sub-agent/scheduled-task lifecycle, storage backend choices,
and the page/offscreen/sandbox delegation boundaries: [`references/architecture-agent.md`](./references/architecture-agent.md).

---

## Extending ScriptCat — Recipes

Map a change onto the existing extension points instead of inventing new structure:

- **A new cross-context message (RPC).** Pick the owning service, add `this.group.on("myAction", handler)` in
  its `init()`, and call it from the other context with a `Client`. No new transport, no new wiring.
- **A new broadcast event.** `this.mq.publish("myTopic", payload)` where state changes; `this.mq.subscribe(...)`
  wherever it matters. Use this, not RPC, for "X changed" notifications.
- **A new persisted entity.** Pick a backend by matching an existing entity with the same data-size/query/lifecycle
  needs — `Repo<T>`, `DAO<T>`, or `OPFSRepo` (see [data layer](./references/architecture-data.md#adding-an-entity))
  — then copy the nearest entity of that *same backend, in the same subsystem* for ownership and construction:
  they don't all follow "construct in the manager, expose via `group.on`." Some context-service `Repo<T>`
  entities do (e.g. `scriptDAO` built in `ServiceWorkerManager` and exposed through RPC); some Agent entities
  don't — `AgentModelService` constructs its own `AgentModelRepo` internally by default rather than taking one
  from a manager, and `AgentChatRepo` is a module-level singleton (`export const agentChatRepo = ...`) imported
  directly rather than manager-constructed or exposed via `group.on`. Only route through the manager +
  `group.on` when the entity is genuinely owned by a context composition root and needs to be reachable over
  RPC.
- **A new service.** First decide what kind: a context service (owned by one of `content/`, `offscreen/`,
  `sandbox/`, `service_worker/`), an Agent/core component, or another cross-cutting subsystem — these do
  **not** share one constructor shape. Then copy the nearest existing service of that kind. See
  [service layer § Adding a service](./references/architecture-services.md#adding-a-service) for the decision
  path; don't default to a `Group` + `IMessageQueue` + DAOs constructor for everything.
- **A new GM API.** Decorate the method with `@GMContext.API` on the content side, add a privileged/offscreen
  handler if needed, register the `@grant` (see [GM API system](./references/architecture-gm-api.md#adding-a-gm-api-sketch)).

Follow the engineering principles in [`AGENTS.md`](../AGENTS.md): fix root causes (no `as any` / swallowed
errors), prefer direct replacement over adapter sandwiches, and keep scope tight — three similar lines beat a
premature abstraction.

---

## Testing the Internals

- **Unit (Vitest + happy-dom).** Co-locate `*.test.ts` next to source. `chrome.*` is mocked via
  [`@Packages/chrome-extension-mock`](../packages/chrome-extension-mock) (`tests/vitest.setup.ts`). For the
  message layer, keep the two pieces separate: `MockMessage` fakes the `Message` **transport** for `Server`/
  `Group` RPC tests (`new Server("test", new MockMessage(...))`); a service's `IMessageQueue` dependency is
  tested with a real `MessageQueue` instance (`new MessageQueue()`, with individual methods like `publish`
  swapped for a spy when a test needs to assert on it) or a narrow fake written against `IMessageQueue` — not
  `MockMessage`, which solves a different problem (see
  [architecture-services.md](./references/architecture-services.md) for the detailed distinction). Run one
  file: `pnpm test -- --run path/to/file.test.ts`.
- **TDD.** See [AGENTS.md § Engineering Principles](../AGENTS.md#engineering-principles) for the write-failing-
  test-first principle and [develop-testing.md § When TDD doesn't apply](./references/develop-testing.md#when-tdd-doesnt-apply)
  for the narrow exceptions — this section only covers architecture-specific test mechanics, not the policy
  itself.
- **E2E (Playwright).** `e2e/*.spec.ts`, one worker, real Chromium. `pnpm run test:e2e` (first run:
  `pnpm run test:e2e:install`).
- **Before a PR:** lint + the relevant suite — owned by [references/develop-testing.md](./references/develop-testing.md) → *Testing*.

The DI + interface design is what makes this tractable: because many services take `IMessageQueue`/DAOs
through the constructor (dependency set varies — see [architecture-services.md](./references/architecture-services.md)),
a test builds a service with a real `MessageQueue` (or a narrow fake) and an in-memory DAO and exercises
handlers directly, with no browser. `MockMessage` is for the separate case of testing `Server`/`Group` RPC
routing, not for standing in as a service's `IMessageQueue`.

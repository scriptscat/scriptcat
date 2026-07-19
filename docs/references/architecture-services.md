# Service layer

## The Service Layer

`src/app/service/` holds two kinds of things, not one uniform pattern:

- **Context services** — `content/`, `offscreen/`, `sandbox/`, `service_worker/` — split by the runtime context
  they execute in. Shared or externally-owned collaborators (other services, the message `Group`, DAOs another
  service also needs) are typically constructor-injected; whether a service also constructs its own *local*
  DAO/helper internally varies per service — see below. Manager-level wiring happens once, and message
  handlers/subscriptions are registered through an explicit lifecycle method — commonly `init()`, but not
  always: content additionally has `contentInit()` (`ScriptRuntime` registers `runtime/addElement` there,
  called by the content entry point before `init()`), and Agent code has its own equivalents (see
  [`architecture-agent.md`](./architecture-agent.md)). Check the specific file, don't assume `init()` is the
  only place registration happens.
- **Cross-cutting subsystems** — `agent/` (see [`architecture-agent.md`](./architecture-agent.md); spans all
  five contexts rather than living in one) and `extension/` (extension-wide environment helpers, e.g.
  `extension_env.ts`) — plus `queue.ts` (shared `MessageQueue` **payload/type** definitions, e.g.
  `TInstallScript`, `TDeleteScript` — not the `MessageQueue` implementation itself, which lives in
  [`packages/message/message_queue.ts`](../../packages/message/message_queue.ts) and is instantiated by the
  contexts that actually need pub/sub — currently Service Worker
  ([`src/service_worker.ts`](../../src/service_worker.ts)), Offscreen
  ([`src/app/service/offscreen/base.ts`](../../src/app/service/offscreen/base.ts)), and UI pages subscribing
  to broadcasts ([`src/pages/store/global.ts`](../../src/pages/store/global.ts)) — not content, inject, or
  sandbox, which don't instantiate it. Run
  `git grep -n -E 'new MessageQueue\s*\(' -- src packages | grep -vE '\.(test|spec)\.[cm]?[jt]sx?:'` for
  the current set rather than trusting this list to stay exhaustive — a plain `"new MessageQueue"` search also
  matches `new MessageQueueGroup(...)` in `packages/message/message_queue.ts` and every test file that
  constructs its own instance, neither of which are production instantiation sites.

```
src/app/service/
├── agent/            cross-cutting: core/ (provider-agnostic) + service_worker/ (composed services) —
│                     see architecture-agent.md
├── extension/         extension_env.ts (cross-cutting environment helpers)
├── queue.ts           shared MessageQueue payload/type definitions (not the implementation)
├── service_worker/    representative entry points: script.ts · value.ts · resource.ts · runtime.ts ·
│                      popup.ts · subscribe.ts · synchronize.ts · system.ts · permission_verify.ts ·
│                      clipboard.ts · download.ts · gm_api/ (SW-side GM handlers) · index.ts (ServiceWorkerManager)
│                      — for the exact current set, run `git ls-tree --name-only HEAD src/app/service/service_worker/`
├── content/          script_runtime.ts · script_executor.ts · exec_script.ts · create_context.ts · gm_api/
├── offscreen/        background-script runner, gm_api.ts, event_page_manager.ts, html_extractor.ts
└── sandbox/          runtime.ts (background/scheduled eval + cron)
```

### The DI pattern — and its real variance

Shared collaborators (the `Group`, `IMessageQueue`, another service, a DAO owned elsewhere) come in through the
constructor rather than being reached for via a singleton/import. A representative signature
([`script.ts`](../../src/app/service/service_worker/script.ts)):

```ts
class ScriptService {
  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly group: Group,            // RPC namespace for "script/*"
    private readonly mq: IMessageQueue,        // broadcast bus
    private readonly valueService: ValueService,
    private readonly resourceService: ResourceService,
    private readonly scriptDAO: ScriptDAO      // data access
  ) {
    // local setup omitted here — see below: the real constructor does real work
  }

  init() {
    this.group.on("getAllScripts", this.getAllScripts.bind(this));
    this.group.on("install", this.installScript.bind(this));
    this.group.on("enable", this.enableScript.bind(this));
    // … many more handlers
  }
}
```

That's a trimmed illustration, not a literal copy of `script.ts` — don't infer an exact handler count from it
(counts drift; check `git grep -c "this.group.on" src/app/service/service_worker/script.ts` for the current
one) or assume the constructor body is empty.

**Don't over-read the constructor as "never `new` internally, constructor never does work."** Several services
break both of those:

- [`ScriptService`](../../src/app/service/service_worker/script.ts) itself: alongside the injected
  `scriptDAO`, it self-constructs `ScriptCodeDAO`, `LocalStorageDAO`, `CompiledResourceDAO`, `TrashScriptDAO`,
  and `SubscribeDAO` as field initializers, and its real constructor body sets up a logger, enables caching on
  two of those DAOs, and builds a `ScriptUpdateCheck` helper.
- [`ResourceService`](../../src/app/service/service_worker/resource.ts) constructs its own `ResourceDAO` as a
  field initializer and does real setup in the constructor body (logger, `enableCache()`).
- [`SubscribeService`](../../src/app/service/service_worker/subscribe.ts) self-constructs `SubscribeDAO` *and*
  `ScriptDAO` as field initializers, alongside constructor-injecting `Group`, `mq`, and `ScriptService`.

**There is no "shared DAO type ⇒ same instance" invariant to rely on.** `ScriptService` builds its own
`SubscribeDAO`; `SubscribeService` builds a *separate* `SubscribeDAO` instance, and its own `ScriptDAO` rather
than reusing the `scriptDAO` the manager passes to `ScriptService`/`RuntimeService`/`PopupService`. The
existing choices are case-by-case, not governed by one rule — don't assume either "always inject" or "always
self-construct." When you're deciding for a new service, weigh cache ownership (does another service need the
same in-memory cache state?), lifetime (does it need to outlive this service?), and test substitution (does a
test need to swap it for a fake?) — but that's design guidance for your decision, not a documented reason
behind each existing instance; check the nearest existing service for the pattern it actually uses.

**`MockMessage` is not an `IMessageQueue` substitute.** It implements the lower-level `Message` transport
(used to build a `Server`/`Group` for RPC in tests, e.g. `new Server("test", new MockMessage(...))`); the
`IMessageQueue` a service receives is still a real `MessageQueue` instance in tests (`new MessageQueue()`),
with individual methods like `publish` swapped for a spy (`vi.fn()`) when a test needs to assert on it. If you
need a lightweight `IMessageQueue` fake, write one against that narrow interface — don't reach for
`MockMessage`, which solves a different problem.

### Wiring: `ServiceWorkerManager`

[`src/app/service/service_worker/index.ts`](../../src/app/service/service_worker/index.ts) is the composition
root for the SW context. It creates a `group("name")` namespace **for the services that need one** and passes
the shared `mq` **to the services that need pub/sub** — not every service gets both: `LogService` is
constructed with `(group, systemConfig)` and no `mq`, and `AgentService` is constructed with
`(group, this.offscreenSend, resource)`, no `mq` at all. Then it calls `init()` on the services that have one:

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
const log      = new LogService(this.api.group("log"), systemConfig); log.init();              // no mq
const agent    = new AgentService(this.api.group("agent"), this.offscreenSend, resource); agent.init(); // no mq
// … synchronize, subscribe, system
```

The `group("name")` call is what gives each service its action prefix (`resource/*`, `value/*`, `script/*`, …)
on the single `serviceWorker` `Server`. Other contexts have their own composition roots
(`OffscreenManager`, `SandboxManager`, `ScriptRuntime` for content/inject) that play a similar
"wire dependencies, register handlers" role, but they are **not** built to the same dependency/initialization
shape as `ServiceWorkerManager` or each other: `OffscreenManager`'s constructor wraps a `WindowMessage` +
`Server` + `ServiceWorkerClient` into a shared base class; `SandboxManager` builds its own `Server` and hands
it to a single `Runtime`; and `ScriptRuntime` (content/inject) additionally owns lifecycle methods the others
don't have, such as `contentInit()` and `externalMessage()`. Read each manager's own file rather than assuming
it mirrors `ServiceWorkerManager`.

### Agent composition is different — by design

Context services take *shared* collaborators through the constructor and register handlers through an explicit
lifecycle method (the DI pattern above — commonly `init()`, sometimes another one like content's
`contentInit()`), but the exact dependency set — and whether a service also self-constructs a local
DAO/helper — varies per service (see the `ResourceService`/`SubscribeService` examples above); "`Group` +
`IMessageQueue` + DAOs" is shorthand for "shared collaborators come in via constructor," not a fixed parameter
list or a ban on any internal construction. The Agent subsystem's sub-services (`ChatService`, `AgentTaskService`, `SkillService`,
`AgentModelService`, `MCPService`, etc. — see [`architecture-agent.md`](./architecture-agent.md)) are composed
by `AgentService` instead of each independently owning a `Group`, and each takes only the narrower interface
it actually needs (e.g. `AgentModelService` takes a `Group` and its own `AgentModelRepo`; `SubAgentService`
takes a small `SubAgentOrchestrator` interface). When adding to the Agent subsystem, follow the pattern of the
nearest existing sub-service rather than a context service's constructor shape.

## Adding a service

First decide what you're adding:

- **A context service** (owned by exactly one of `content/`, `offscreen/`, `sandbox/`, `service_worker/`) —
  follow the DI pattern and manager wiring above; copy the nearest existing service in that context.
- **An Agent/core component or cross-cutting subsystem** — copy the nearest existing file under
  `agent/core/` or `agent/service_worker/` and follow its narrower-interface style (see
  [`architecture-agent.md`](./architecture-agent.md)), or extend `extension/` for extension-wide environment
  concerns.

Guessing the wrong shape (e.g. forcing a full `Group`/`IMessageQueue`/DAO constructor onto an Agent
sub-service) creates an adapter sandwich the codebase doesn't otherwise have — copy the nearest neighbor
instead of the generic template.

# Service layer

## The Service Layer

`src/app/service/` holds two kinds of things, not one uniform pattern:

- **Context services** — `content/`, `offscreen/`, `sandbox/`, `service_worker/` — split by the runtime context
  they execute in. Shared or externally-owned collaborators (other services, the message `Group`, DAOs another
  service also needs) are typically constructor-injected; whether a service also constructs its own *local*
  DAO/helper internally varies per service — see below. Manager-level wiring happens once, and message
  handlers/cross-service subscriptions are registered in `init()`.
- **Cross-cutting subsystems** — `agent/` (see [`architecture-agent.md`](./architecture-agent.md); spans all
  five contexts rather than living in one) and `extension/` (extension-wide environment helpers, e.g.
  `extension_env.ts`) — plus `queue.ts` (the shared `MessageQueue` wiring used across contexts).

```
src/app/service/
├── agent/            cross-cutting: core/ (provider-agnostic) + service_worker/ (composed services) —
│                     see architecture-agent.md
├── extension/         extension_env.ts (cross-cutting environment helpers)
├── queue.ts           shared MessageQueue wiring
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
  ) {}

  init() {
    this.group.on("getAllScripts", this.getAllScripts.bind(this));
    this.group.on("install", this.installScript.bind(this));
    this.group.on("enable", this.enableScript.bind(this));
    // … ~20 more handlers
  }
}
```

But **don't over-read this as "never `new` internally, constructor never does work"** — several services break
both of those:

- [`ResourceService`](../../src/app/service/service_worker/resource.ts) constructs its own `ResourceDAO` as a
  field initializer (`resourceDAO: ResourceDAO = new ResourceDAO()`) and does real setup in the constructor
  body (`this.logger = LoggerCore.logger().with(...)`, `this.resourceDAO.enableCache()`).
- [`SubscribeService`](../../src/app/service/service_worker/subscribe.ts) likewise self-constructs
  `SubscribeDAO` and `ScriptDAO` as field initializers, alongside constructor-injecting `Group`, `mq`, and
  `ScriptService`.

The actual rule: a DAO/helper that's **local to one service** and nobody else needs is fine to construct
internally; a DAO/service that's **shared across services** (like the `scriptDAO` passed into `ScriptService`
above) gets injected so every owner points at the same instance and tests can substitute it. `init()` is where
handler registration, cross-service subscriptions, and any wiring that depends on the *whole* object graph
being built go — not a blanket "no work in the constructor" rule; a constructor doing local, self-contained
setup (logger, own-DAO cache flag) is normal. Depend on narrow interfaces (`IMessageQueue`, not
`MessageQueue`) so tests can pass `MockMessage`. Check the nearest existing service before assuming either
extreme.

### Wiring: `ServiceWorkerManager`

[`src/app/service/service_worker/index.ts`](../../src/app/service/service_worker/index.ts) is the composition
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

### Agent composition is different — by design

Context services take *shared* collaborators through the constructor and register handlers in `init()` (the DI
pattern above), but the exact dependency set — and whether a service also self-constructs a local DAO/helper —
varies per service (see the `ResourceService`/`SubscribeService` examples above); "`Group` + `IMessageQueue` +
DAOs" is shorthand for "shared collaborators come in via constructor," not a fixed parameter list or a ban on
any internal construction. The Agent subsystem's sub-services (`ChatService`, `AgentTaskService`, `SkillService`,
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

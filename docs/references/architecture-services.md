# Service layer

## The Service Layer

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

### The DI pattern

Every service takes its collaborators through the constructor — never `new`s them internally. A representative
signature ([`script.ts`](../../src/app/service/service_worker/script.ts)):

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

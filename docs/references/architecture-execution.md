# Script execution

## Script Execution

There are three execution paths; all share one **compilation** step.

### Compilation — the `with(){}` sandbox wrapper

[`src/app/service/content/utils.ts`](../../src/app/service/content/utils.ts) wraps user code so that global lookups
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
  a descriptor-based pseudo-window that projects `unsafeWindow`, the granted `GM_*` functions, and a controlled
  view of globals — not the raw page scope. It is a compatibility projection rather than a security membrane.
- Context and script name are passed as **unnamed `arguments`** (`arguments[0]`, `arguments[1]`) so user code
  can't shadow them by declaring variables of the same name.
- The wrapper installs the body as a temporary method and removes it in the same expression. This preserves the
  userscript `this` without resolving mutable page `call`, `apply`, or `bind` properties.

### Path A — Page scripts → `chrome.userScripts`

The SW compiles enabled userscripts and registers each payload through `chrome.userScripts` with its match, world,
and run-time settings. It also registers the `inject.js` and `content.js` runners there for the `MAIN` and
`USER_SCRIPT` paths. Separately, `scripting.js` is registered through `chrome.scripting` as a document-start
content script that supplies the page bridge. At document time the content/inject pair
([`script_runtime.ts`](../../src/app/service/content/script_runtime.ts),
[`exec_script.ts`](../../src/app/service/content/exec_script.ts)) evaluates the compiled function with the GM
context. The `USER_SCRIPT` content path obtains its matched scripts directly from the service worker over
`ExtensionMessage` after a bootstrap-token handoff. The MAIN `inject` path uses a native extension port for GM RPC
when available. `PageMessage` carries page-visible bootstrap traffic, the whitelisted `external.Scriptcat` API,
and a restricted MAIN fallback used only when native channel setup is unavailable or fails. That fallback can start
only scripts without GM grants or private values, configuration, or resources. Supported MAIN execution handles, GM RPC,
events, and value updates use the native extension channel; the compatibility page-bridge RPC path validates its
execution handle and grant before forwarding. The restricted fallback does not establish an authenticated
extension origin, so it must reject privileged scripts and execution bindings. `CustomEventMessage` carries the
content bootstrap handoff and synchronous DOM references. Neither page-visible bridge establishes an
authenticated extension origin, so consumers must validate its payloads before acting on them.

After the MAIN page-load gate selects the restricted fallback, it ignores later page-visible bootstrap events. A
previously established native port can still reconnect through its separate disconnect handler. If that reconnect
delivers a native `pageLoad` after a matching fallback execution has started, the same UUID, flag, and compiled
revision let the executor add the trusted binding without running the script body again.

MAIN `@early-start` scripts retain upstream's synchronous execution before `pageLoad`. The page event supplies only
the script flag; the executor accepts the generated wrapper only when its captured source, closure manifest, and
document match. The closure-private preinject manifest omits stored values and user configuration while retaining
declared resources; the page event exposes only the flag. Brokered GM calls wait for a matching UUID, flag, and
compiled revision from `pageLoad`; `ScriptExecutor` drops value/event packets that reach it for an early script before
that binding is installed instead of queuing them. For a registered user-script session, the service worker
separately buffers matching value updates while its connection is not ready and flushes them after sending
`pageLoad`. Empty-script reconciliation is accepted only by the authenticated native page-load handler; page-visible
fallback scripts do not reconcile or invalidate early state. Synchronous DOM helpers and resource getters retain
their early-start behavior before that binding arrives. If a registration is stale, disabled, or removed, its body
and declared resource reads may already have affected the page before this check; invalidation cannot undo those
page effects.

### Path B — Background scripts → Offscreen → Sandbox

`@background` scripts have no page. The SW asks the Offscreen document to host them, and the Offscreen forwards
evaluation into the **Sandbox iframe** ([`src/app/service/sandbox/runtime.ts`](../../src/app/service/sandbox/runtime.ts)).
The sandbox wraps execution in `BgExecScriptWarp`, which supplies managed `setTimeout`/`setInterval` and
`CATRetryError` semantics so long-lived scripts can be cleanly torn down and retried.

### Path C — Scheduled scripts → cron in Sandbox

`@crontab` scripts are background scripts triggered by a schedule. The sandbox parses the cron expression with
the `cron` library and keeps a `Map<uuid, CronJob[]>`; each fire runs the same `BgExecScriptWarp` path as
background scripts, with a retry list for transient failures.

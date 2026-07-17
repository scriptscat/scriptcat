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
  a `Proxy` that intercepts reads, so the script sees `unsafeWindow`, the granted `GM_*` functions, and a
  controlled view of globals — not the raw page scope.
- Context and script name are passed as **unnamed `arguments`** (`arguments[0]`, `arguments[1]`) so user code
  can't shadow them by declaring variables of the same name.
- `.call(this)` preserves `this` because `chrome.userScripts` invokes the function free-standing (an arrow
  function would capture the wrong `this`).

### Path A — Page scripts → `chrome.userScripts`

Normal userscripts run in the page. The SW builds a `RegisteredUserScript` from the script's `@match`/`@include`
patterns and registers the compiled payload (the `scripting` bundle) with `chrome.userScripts.register`, in the
`MAIN` or `USER_SCRIPT` world as required. At document time the content/inject pair
([`script_runtime.ts`](../../src/app/service/content/script_runtime.ts),
[`exec_script.ts`](../../src/app/service/content/exec_script.ts)) evaluates the compiled function with the GM
context.

### Path B — Background scripts → Offscreen → Sandbox

`@background` scripts have no page. The SW asks the Offscreen document to host them, and the Offscreen forwards
evaluation into the **Sandbox iframe** ([`src/app/service/sandbox/runtime.ts`](../../src/app/service/sandbox/runtime.ts)).
The sandbox wraps execution in `BgExecScriptWarp`, which supplies managed `setTimeout`/`setInterval` and
`CATRetryError` semantics so long-lived scripts can be cleanly torn down and retried.

### Path C — Scheduled scripts → cron in Sandbox

`@crontab` scripts are background scripts triggered by a schedule. The sandbox parses the cron expression with
the `cron` library and keeps a `Map<uuid, CronJob[]>`; each fire runs the same `BgExecScriptWarp` path as
background scripts, with a retry list for transient failures.

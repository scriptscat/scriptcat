# Script execution

## Script Execution

There are three execution paths; all share one **compilation** step.

### Compilation — the `with(){}` sandbox wrapper

[`src/app/service/content/utils.ts`](../../src/app/service/content/utils.ts) wraps user code so that global lookups
go through a controlled context object instead of the page's real globals:

```ts
with (arguments[0] || this.$) { // arguments[0] = GM context; this.$ = one-shot Proxy
  // @require dependencies, concatenated
  return async function () {    // user code may use top-level await
    // userscript body
  };
}
```

The generated code is wrapped in `try/catch` and compiled with `new Function`. `compileScript()` invokes the
returned async function with captured `nativeCall` (`Reflect.apply`), preserving userscript `this` without
consulting page-modifiable `call`, `apply`, or `bind` properties.

Key points:

- `with(arguments[0]||this.$)` makes every bare identifier resolve against the GM context first. The context is
  a descriptor-based pseudo-window that projects `unsafeWindow`, the granted `GM_*` functions, and a controlled
  view of globals — not the raw page scope. It is a compatibility projection rather than a security membrane.
- The code and script name are passed through unnamed `arguments` (`arguments[0]`, `arguments[1]`) so user code
  cannot shadow them by declaring variables with the same names.

### MAIN-world wrapper and early start

The MAIN registration mounts the generated wrapper with an ordinary `window[flag] = wrapper` assignment.
[`compilePreInjectScript()`](../../src/app/service/content/utils.ts) also dispatches a page-visible `performance`
event whose detail contains the script flag. Page code can observe, replace, or delete these mounts and events;
neither surface establishes an authenticated origin.

Before execution, [`ScriptExecutor`](../../src/app/service/content/script_executor.ts) checks the candidate function
with captured native `Function.prototype.toString` against the generated wrapper source, then passes its build token
through the trusted invocation path to read closure-held metadata. It verifies that the metadata UUID and flag match
the registered script before executing the wrapper. The wrapper mount and event do not grant GM capability.

An early-start wrapper may run its page-side body before the authoritative page-load list arrives. Pre-inject
metadata redacts `value`, `config`, `userConfig`, and `userConfigStr`; privileged requests that cross to the broker
wait on the early context's load gate. Reconciliation requires the same UUID, flag, and compiled `scriptRevision`;
scripts with grants or context-menu behavior also require a valid execution binding. On success, the executor
refreshes script information and `GM_info` before resolving the load gate. A missing or stale script, or an invalid
binding, invalidates the context and settles the pending load wait so waiting broker requests stop without being
sent. Early contexts absent from the authoritative list are invalidated as well.

### Path A — Page scripts → `chrome.userScripts`

The SW compiles enabled userscripts and registers each payload through `chrome.userScripts` with its match, world,
and run-time settings. It also registers the `inject.js` and `content.js` runners there for the `MAIN` and
`USER_SCRIPT` paths. Separately, `scripting.js` is registered through `chrome.scripting` as a document-start
content script that supplies the page bridge. At document time the content/inject pair
([`script_runtime.ts`](../../src/app/service/content/script_runtime.ts),
[`exec_script.ts`](../../src/app/service/content/exec_script.ts)) evaluates the compiled function with the GM
context. The `USER_SCRIPT` content path obtains its matched scripts directly from the service worker over
`ExtensionMessage` after a bootstrap-token handoff. The MAIN `inject` path deliberately has one cross-world
transport: `PageEventMessage`, carried by a random event name on `performance`. It carries authoritative
pageLoad data, MAIN event/value updates, the whitelisted `external.Scriptcat` API, and GM RPC through the isolated
`scripting` broker. Before forwarding privileged GM RPC, [`PageRpcRegistry`](../../src/app/service/content/page_rpc.ts)
validates the request shape, active execution handle, request sequence, and granted API; the Service Worker then
resolves canonical identity again from the handle and real sender. The handle identifies a binding but is not an
authorization secret.
`CustomEventMessage` carries the content bootstrap handoff and synchronous DOM references. Neither page-visible
bridge establishes an authenticated extension origin, so consumers must validate its payloads before acting on
them.

### Path B — Background scripts → Offscreen/EventPage → Sandbox

`@background` scripts have no page. Chromium uses the Offscreen document as the DOM-capable parent; Firefox uses
the MV3 event page in the same role. Both create the sandbox iframe only after installing
[`SandboxChannelHost`](../../packages/message/sandbox_message_channel.ts), so the bootstrap receiver always exists
before the child can start.

The sandbox creates its own `MessageChannel`. It keeps one port inside the trusted `sandbox.ts` module closure,
wires [`MessagePortMessage`](../../packages/message/message_port_message.ts), `Server("sandbox")`, and
[`Runtime`](../../src/app/service/sandbox/runtime.ts), then transfers only the peer port to the parent. The
one-time transfer uses Window `postMessage` because that is the cross-frame bootstrap mechanism; it contains no
script/GM payload. The parent requires the message source to be the exact sandbox `contentWindow`, accepts exactly
one port, removes its Window `"message"` listener, and thereafter sends pageLoad-equivalent lifecycle data, GM
request/reply traffic, value/event updates, and skill-script requests only through the private port.

This split matters because untrusted `@background`/`@crontab` code executes in the sandbox Window and can use
that Window's ordinary event APIs. A global Window-message transport would therefore let one background script
passively observe other sandbox traffic. A private `MessagePort` is reference-scoped: a userscript that never
receives the port cannot subscribe to or inject packets into that channel. The port is a transport-isolation
capability, not the final GM authorization boundary; existing broker/Service Worker permission and identity checks
still apply.

Receiving the transferred port is also the parent's sandbox-readiness signal. The parent does not separately
poll/ping the iframe and does not mark an unavailable channel ready after a timeout. Once the port is attached,
the parent notifies the Service Worker, which replays enabled background/scheduled scripts and language state.

The sandbox wraps execution in `BgExecScriptWarp`, which supplies managed `setTimeout`/`setInterval` and
`CATRetryError` semantics so long-lived scripts can be cleanly torn down and retried.

### Path C — Scheduled scripts → cron in Sandbox

`@crontab` scripts are background scripts triggered by a schedule. The sandbox parses the cron expression with
the `cron` library and keeps a `Map<uuid, CronJob[]>`; each fire runs the same `BgExecScriptWarp` path as
background scripts, with a retry list for transient failures.

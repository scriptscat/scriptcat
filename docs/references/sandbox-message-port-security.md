# Private Offscreen/EventPage ↔ Sandbox MessagePort

This note documents the transport boundary used for background and scheduled userscripts.

## Problem statement

Background and scheduled userscripts execute inside `src/sandbox.html`. They receive a pseudo-window backed by
the real sandbox Window's event APIs, so an untrusted script can register `window.onmessage` /
`window.addEventListener("message", ...)`.

The previous `WindowMessage` transport placed all Offscreen/EventPage ↔ Sandbox envelopes on that same global
Window `"message"` bus. A background userscript could therefore passively observe other scripts' lifecycle
payloads, value/event callbacks, GM request/reply traffic, and skill-script execution payloads. Because
`WindowMessage` also accepted messages whose source was the current Window, the shared bus was also an
unnecessary injection surface.

The goal is not to make background userscripts mutually unobservable at the JavaScript-realm level in general.
The narrower invariant is:

> No untrusted userscript realm shares a global Window `"message"` transport with ScriptCat internal sandbox
> payloads.

## Common protocol on Chromium and Firefox

The parent differs by browser, but the sandbox protocol is identical.

### Chromium

```text
Service Worker
    │
    │ existing SW/Offscreen messaging
    ▼
Offscreen document
    │
    │ SandboxChannelHost
    │    1. install Window bootstrap listener
    │    2. create/attach sandbox iframe
    ▼
sandbox.html
```

### Firefox MV3

```text
Service Worker + EventPageOffscreenManager
    │
    │ in-process SW/offscreen bridge
    │
    │ SandboxChannelHost
    │    1. install Window bootstrap listener
    │    2. create/attach sandbox iframe
    ▼
sandbox.html
```

In both cases `sandbox.ts`:

1. creates a new `MessageChannel`;
2. constructs `MessagePortMessage` around `port1`;
3. wires `Server("sandbox")`, `Runtime`, logger and GM plumbing;
4. transfers only `port2` to the parent with one `parent.postMessage(..., [port2])` call.

The bootstrap envelope contains only protocol type/version. It contains no script, GM, value, event, token,
configuration, resource, or execution payload.

## Readiness semantics

Port transfer is also the readiness signal.

The parent accepts the bootstrap only when all of these are true:

- the event source is exactly the current sandbox iframe `contentWindow`;
- the envelope has exactly the expected own data fields;
- type/version match;
- exactly one transferred `MessagePort` is present.

After accepting the port the parent immediately removes its Window `"message"` bootstrap listener. All subsequent
traffic uses the private port.

Only then does `BackgroundEnvManagerBase` call
`preparationOffscreen({ verified: true })`, which causes the Service Worker to replay enabled background/scheduled
scripts and language state.

There is intentionally no second `preparationSandbox` RPC, no channel-health ping, and no timeout path that marks
an unavailable channel ready. The transport capability and the readiness fact are the same event.

This ordering also prevents an installed malicious background script from racing the trusted bootstrap: no
background userscript is replayed until after the parent already owns the transferred port and has removed the
Window listener.

## Confidentiality / injection properties

After bootstrap:

```text
parent trusted code  <====================>  sandbox trusted transport
                        private MessagePort

background userscript:
  window.onmessage          -> does not receive port traffic
  window.postMessage(...)   -> cannot inject into the private port
  no port reference         -> cannot subscribe or send
```

A `MessagePort` reference is therefore a transport-isolation capability. It is not treated as final authorization.
GM privilege still depends on the existing ScriptCat script context, grant checks, execution identity and
Service Worker validation.

## Same-realm prototype hardening

The sandbox transport and untrusted background userscripts ultimately execute in the same JavaScript realm.
Keeping the port reference private is not sufficient if trusted code performs later lookups through mutable DOM
prototypes.

For that reason `MessagePortMessage` captures/binds, before any userscript is replayed:

- `MessagePort.postMessage`;
- `MessagePort.addEventListener`;
- `MessagePort.removeEventListener`;
- `MessagePort.start`;
- `MessagePort.close`;
- the native `MessageEvent.prototype.data` getter.

Incoming packets are read through the captured `MessageEvent.data` getter rather than `event.data`. A malicious
background script that later replaces `MessageEvent.prototype.data` therefore cannot observe the private payload
when ScriptCat's handler reads it.

The wire envelope is still parsed with captured `Reflect.ownKeys` /
`Object.getOwnPropertyDescriptor` helpers so accessor/proxy envelopes are rejected before field access.

## Why not a random Window message key?

A random key would reduce casual observation but would still keep payloads on a shared global Window event type.
Any userscript could subscribe to every `"message"` event first and inspect the key after the first packet.
A private port removes the payload from that global event bus entirely.

## Why not chrome.runtime from sandbox?

The manifest sandbox page is intentionally outside the ordinary extension privileged API surface. The parent can
use extension messaging, but the sandbox should not be given a direct `chrome.runtime` capability merely to avoid
Window messaging.

A one-shot Window bootstrap that transfers a port is the narrow bridge:

```text
Window.postMessage:  capability transfer only
MessagePort:         all real sandbox traffic
```

## Structured-clone and async semantics

`MessagePort.postMessage` retains the useful properties of the old Window transport:

- asynchronous message delivery;
- structured-clone serialization;
- transferable support where needed;
- no synchronous CustomEvent reentrancy.

The change is transport visibility, not the higher-level `Message` / `MessageConnect` RPC contract.

## Failure and lifecycle tradeoffs

The design deliberately fails closed on readiness: if the iframe never transfers a valid port, the parent does not
announce a verified sandbox and does not replay privileged/background script state.

This is safer and simpler than the removed timeout-ready path, but it means an iframe load/bootstrap failure can
leave background execution unavailable until the parent context is recreated. If crash/reload recovery is added
later, it should create a new explicit channel lifecycle rather than re-opening a permanent global Window message
bus.

## Verification

The review branch contains:

- `packages/message/sandbox_message_channel.test.ts`
  - request/reply and `MessageConnect` behavior;
  - wrong source rejection;
  - one-port bootstrap;
  - Window listener removal;
  - accessor/proxy bootstrap rejection;
  - poisoned `MessageEvent.prototype.data` regression when the test DOM exposes the WebIDL getter.
- `src/app/service/offscreen/base.test.ts`
  - no Service Worker readiness before port attachment;
  - script/language replay only after private-channel readiness.
- `src/app/service/offscreen/event_page_manager.test.ts`
  - Firefox Event Page creates the iframe only after parent transport setup.
- `src/app/service/sandbox/index.test.ts`
  - no legacy readiness/health RPC.
- `e2e/sandbox-message-port.spec.ts`
  - a real Chromium background userscript installs `window.onmessage` and a `"message"` listener;
  - it also replaces the real browser `MessageEvent.prototype.data` getter with a snooping wrapper;
  - another background script is installed/enabled to force real parent→sandbox lifecycle and GM storage traffic;
  - the spy confirms that no internal envelope appears on the Window bus and the poisoned prototype getter never
    observes a private-port envelope.

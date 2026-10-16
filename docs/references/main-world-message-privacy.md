# MAIN-world message privacy and fallback policy

## Core value

Ordinary host-page JavaScript should not be able to enumerate ScriptCat's full cross-world traffic merely by registering a global `window.message` listener.

A random event name is **not authentication**. It does preserve an important privacy property: page code that does not know the per-document key has no wildcard API for subscribing to every custom event type on `performance`.

## Final transport split

| Path | Transport | Policy |
| --- | --- | --- |
| MAIN ↔ `scripting` | `PageEventMessage` over random-key `performance` CustomEvent | single path; no global `window.message` bus |
| MAIN privileged GM RPC | same bridge → isolated broker → Service Worker | authorization remains in broker/SW |
| MAIN pageLoad/value/event/external API | same keyed bridge | one lifecycle and one review boundary |
| USER_SCRIPT ↔ Service Worker | native `ExtensionMessage` / user-script port | browser-provided isolated transport |
| USER_SCRIPT listener unavailable | token-bound ordinary extension port | real browser-compatibility fallback |
| synchronous DOM node handoff | `CustomEventMessage` / MouseEvent relatedTarget | live DOM nodes are not structured-cloneable |
| Offscreen ↔ Sandbox | `WindowMessage` / `window.postMessage` | genuinely separate Window/frame transport |

## MAIN fallback complexity removed

This review branch intentionally removes:

- native MAIN runtime-port probing;
- the one-second native bootstrap timeout;
- MAIN reconnect-token loop;
- `createMainWorldPageLoadGate`;
- `pageLoadFallback` request/replay;
- the MAIN-only bootstrap token used to choose between native and page transports;
- the dedicated MAIN-fallback E2E scenario.

Those mechanisms implemented two transports for the same MAIN capability surface, making correctness depend on timing and doubling the data paths to audit.

## Security invariants retained

- Service Worker-issued execution handles stay bound to tab/frame/document/environment.
- `PageRpcRegistry` still checks handle, grant and sequence before forwarding page GM RPC.
- The Service Worker still resolves canonical script identity from the handle and real sender.
- Hostile accessor/proxy envelopes remain rejected by strict descriptor parsing.
- pageLoad/value/event DTOs keep the existing clone/shape validation.
- live `Document` transfer remains replaced by serialization.

## Threat-model boundary

The keyed event name reduces passive observability by ordinary page code. It must never be treated as a bearer capability or authorization secret. Privilege continues to depend on the isolated broker and Service Worker checks.

Review rule: **do not publish all ScriptCat MAIN traffic onto a browser-global event type that arbitrary page code can subscribe to without first discovering any ScriptCat-specific key.**

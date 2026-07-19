# Agent Subsystem

> Deep-dive companion to [`../architecture.md`](../architecture.md). The Agent subsystem is an AI-agent layer
> that runs **on top of** the five existing runtime contexts (service worker, content, inject, offscreen,
> sandbox) — it is not a sixth context. Its code lives under
> [`src/app/service/agent/`](../../src/app/service/agent/), split into a context-agnostic `core/` and a
> `service_worker/` composition layer, plus a content-side API surface and offscreen/sandbox delegation
> described below.

## Service-worker composition

[`AgentService`](../../src/app/service/agent/service_worker/agent.ts) is constructed once in
[`ServiceWorkerManager`](../../src/app/service/service_worker/index.ts) (`new AgentService(this.api.group("agent"),
this.offscreenSend, resource)`) and composes the narrower services below rather than being one large class.
Each sub-service takes only the dependencies it needs — not a single `Group`/`IMessageQueue`/DAO triple applied
uniformly:

| Service | File | Responsibility |
| --- | --- | --- |
| `ChatService` | `chat_service.ts` | Chat request lifecycle: builds the system prompt, wires a per-request `SessionToolRegistry`, delegates the tool loop to the orchestrator. |
| `AgentTaskService` | `task_service.ts` | CRUD + scheduling for `AgentTask` (cron-like triggers), runs tasks through the same tool-loop orchestrator. |
| `SkillService` | `skill_service.ts` | Skill install/update/list from `.md` or `.zip` sources (`parseSkillMd`/`parseSkillZip`), backed by `SkillRepo`. |
| `AgentModelService` | `model_service.ts` | Model config CRUD and default/summary-model selection, backed by `AgentModelRepo`. |
| `MCPService` | `mcp.ts` | Manages `MCPClient` connections per configured server and registers/unregisters their tools on the shared `ToolRegistry`. |
| `BackgroundSessionManager` | `background_session_manager.ts` | Tracks running background conversations (streaming state, listeners, pending `ask_user` prompts) so a UI can reattach to an in-flight session. |
| `SubAgentService` | `sub_agent_service.ts` | Runs a sub-agent conversation through the shared tool loop with a type-scoped tool exclusion list. |
| `CompactService` | `compact_service.ts` | Summarizes/compacts long conversation history via a dedicated compact prompt. |
| `AgentDomService` | `dom.ts` (+ `dom_cdp.ts` helpers) | Page automation — see below for the default-vs-trusted split. |
| `AgentOPFSService` | `opfs_service.ts` | Serves `CAT.agent.opfs` requests from both content scripts (no Blob support) and offscreen (Blob support), dispatched on whether the caller has a `sender`. |

(Class names verified via `git grep -n "export class" -- src/app/service/agent/service_worker/` — re-run that
before relying on a name here, since these are exactly the kind of detail that drifts.)

Message actions are namespaced under the `agent` group (`this.api.group("agent")`), the same RPC pattern
`architecture.md` describes for other services — the difference here is internal composition, not the wiring
into `Group`/`Server`.

## Tool registries

[`ToolRegistry`](../../src/app/service/agent/core/tool_registry.ts) is the **global** registry: tools it holds
persist for the process lifetime and are classified by `ToolSource` — `builtin` (permanent, e.g.
`web_fetch`/`web_search`/`opfs_*`/`tab_*`), `mcp` (from an `MCPService`-managed server), `skill` (skill
meta-tools: `load_skill`, `execute_skill_script`, `read_reference`), `session` (registered per conversation:
task tools, `ask_user`, `sub_agent`, `execute_script`), and `script` (user-script-supplied tools passed through
`conv.chat`, dispatched via a callback rather than stored in the map).

[`SessionToolRegistry`](../../src/app/service/agent/core/session_tool_registry.ts) wraps a read-only reference
to the global `ToolRegistry` with its own per-session `Map`. This exists because registering a same-named
builtin tool (task tools, `ask_user`, `sub_agent`) directly on the global registry would let concurrent
sessions clobber each other's closures — a session-scoped tool needs to stay bound to its own
`conversationId`/`sendEvent`. `getDefinitions()` merges session tools over parent tools (session shadows
parent); `execute()` builds the merged map and delegates to `parent.executeTools()` so shared behavior (e.g.
attachment persistence) isn't duplicated. A session's tools are reclaimed by garbage collection when the
session ends — no explicit `unregister` loop is required.

## LLM call: streaming, retry, compact, tool loop

[`ToolLoopOrchestrator`](../../src/app/service/agent/service_worker/tool_loop_orchestrator.ts) drives one
conversation turn: call the model, execute any tool calls the model requested, feed results back, and repeat
until the model stops calling tools or `maxIterations` is hit. It depends on injected `callLLM` and
`autoCompact` functions (rather than importing a concrete client) so tests can substitute spies.
[`retry_utils.ts`](../../src/app/service/agent/service_worker/retry_utils.ts)'s `isRetryableError` matches an
error message containing `429`, a `5xx` code, or a network-ish signal (`network`/`fetch`/`ECONNRESET`), then
excludes it if the message also matches `400`, `401`, `403`, or `404` — it does not blanket-exclude every 4xx
status, just those four specific codes (other 4xx codes simply don't match the retry-trigger pattern in
practice unless their message happens to contain one of the trigger substrings). `withRetry` then applies
exponential backoff, aborting immediately if the caller's `AbortSignal` fires. Context-window overflow triggers auto-compaction
(`compact_service.ts` / `core/compact_prompt.ts`) before the loop continues. Provider-specific request/response
shaping lives under `core/providers/` (`anthropic.ts`, `openai.ts`, `registry.ts`), keeping the orchestrator
provider-agnostic.

## Background session, sub-agent, and scheduled task lifecycle

- **Background session** — `BackgroundSessionManager` keeps a `RunningConversation` (streaming buffer, tool
  calls so far, pending `ask_user` state, abort controller) alive independent of whether a UI is currently
  listening, so a popup/options page can attach, detach, and reattach to the same in-flight run.
- **Sub-agent** — `SubAgentService` runs a nested conversation through the same `callLLMWithToolLoop` contract
  as the top-level chat, but resolves an exclusion list via `resolveSubAgentType`/`getExcludeToolsForType`
  (`core/sub_agent_types.ts`) so a sub-agent type doesn't get tools it shouldn't (e.g. spawning further
  sub-agents).
- **Scheduled task** — `AgentTaskService` persists `AgentTask` definitions (`AgentTaskRepo`) and run records
  (`AgentTaskRunRepo`), computing next-fire times via `core/task_scheduler.ts` and `pkg/utils/cron`; the
  service worker's `chrome.alarms` handler (`agentTaskScheduler`, wired in
  `src/app/service/service_worker/index.ts`) calls `agent.onSchedulerTick()` to drive due tasks through the
  same tool loop as interactive chat.

## Storage backends

The Agent subsystem does not use one persistence pattern; pick by data shape, matching
[`architecture-data.md`](./architecture-data.md):

- `Repo<T>` (`chrome.storage.local`) — `AgentModelRepo` (small config objects), `AgentTaskRepo` (task
  definitions).
- `OPFSRepo` (Origin Private File System) — `AgentChatRepo` (conversation history, can grow large and holds
  attachments), `AgentTaskRunRepo` (task run history), `SkillRepo` (skill `.md`/script bundles).
- `MCPServerRepo` (`Repo<T>`) — MCP server configs.

## Page / offscreen / sandbox delegation and permission boundaries

- **Content (`src/app/service/content/gm_api/cat_agent.ts`)** exposes the `CAT.agent.*` API to user scripts —
  `ConversationInstance` wraps a conversation and dispatches tool-call handlers registered by the calling
  script. This is a distinct API family from the traditional GM API (see
  [`architecture-gm-api.md`](./architecture-gm-api.md)); it does not follow the four-step `@GMContext.API`
  recipe used for GM grants.
- **DOM automation** runs from the service worker through a single `AgentDomService` (`dom.ts`), which handles
  every action (`navigate`, `readPage`, `screenshot`, `click`, `fill`, `scroll`, `waitFor`, `executeScript`,
  tab monitoring) and delegates to CDP helpers imported from `dom_cdp.ts` (`cdpClick`, `cdpFill`,
  `cdpScreenshot`, `cdpStartMonitor`/`cdpStopMonitor`/`cdpPeekMonitor`) where it needs `chrome.debugger`.
  `dom_cdp.ts` is a helper module `dom.ts` calls into, not an independent service with its own request path.
  The default-vs-trusted split is **not uniform across actions** — check each one:
  - **Navigation and tab bookkeeping** (`navigate`, `update`, `create`, `query`) always go through
    `chrome.tabs`, never CDP.
  - **`click`/`fill`** genuinely branch on the caller's `trusted` option: default mode drives them via
    `chrome.scripting.executeScript`, "trusted" mode delegates to CDP for real synthetic input
    (`isTrusted: true`), falling back to the non-trusted path if the CDP call fails.
  - **`screenshot`** has its own logic independent of any `trusted` flag: a `selector`-scoped capture always
    uses CDP; a background (non-active) tab tries CDP first and falls back to `chrome.tabs.captureVisibleTab`
    on failure; an active tab with no selector uses `chrome.tabs.captureVisibleTab` directly.
  - **Tab monitoring** (`startMonitor`/`stopMonitor`/`peekMonitor`) is unconditionally CDP-based — there is no
    non-CDP path for it at all.

  CDP attaches the debugger to a tab and carries the extra permission/user-visible-banner implications that
  come with `chrome.debugger`; how often that applies depends on which action you're looking at, not a single
  binary "default vs. trusted mode" switch.
- **OPFS access** is dispatched by caller: `AgentOPFSService.handleOPFSApi` checks whether the request has a
  `sender` (content script, no Blob support) or came over `postMessage` (offscreen, Blob support) and adjusts
  behavior accordingly, rather than assuming one execution context.
- **Skill scripts** execute through `core/skill_script_executor.ts`, delegating to the Sandbox the same way
  regular background/scheduled scripts do (see [`architecture-execution.md`](./architecture-execution.md)) —
  the Agent subsystem doesn't introduce a parallel script-execution path.

## Tests

Test file names in `service_worker/` don't all mirror their source file 1:1 — some group by behavior instead
(e.g. `background.test.ts` covers `background_session_manager.ts`, `retry.test.ts` covers `retry_utils.ts`,
`autocompact.test.ts` covers the compaction trigger path). At the time of writing, `agent.ts`, `task_service.ts`,
`compact_service.ts`, and `model_service.ts` don't have an obviously corresponding test file by name — don't
infer full coverage from this table; run `git ls-tree --name-only HEAD src/app/service/agent/service_worker/ |
grep test` for the current test inventory and compare it against the source list above before relying on
either "it's tested" or "it's untested." `core/` follows the same co-located `*.test.ts` convention and the
same caveat applies. Vitest conventions generally: see
[`../references/develop-testing.md`](./develop-testing.md).

## Extending the Agent subsystem

- **New tool** — add it under `core/tools/`, register it with the appropriate `ToolSource` (`builtin` at
  startup, `session` inside the relevant service's session setup), and give it a `ToolExecutor`. Don't register
  session-scoped tools on the global `ToolRegistry` — use `SessionToolRegistry` so sessions can't clobber each
  other.
- **New MCP-backed tool** — goes through `MCPService`, not manual registration; it already handles connecting,
  naming (`mcp_<server>_<tool>`), and cleanup.
- **New sub-agent type** — extend `core/sub_agent_types.ts` with its exclusion list rather than special-casing
  it in `SubAgentService`.

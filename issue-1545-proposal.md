# Technical Proposal — Issue #1545: Agent maxIterations Configuration, Context Compression & Loop Guard

> Issue: https://github.com/scriptscat/scriptcat/issues/1545
> Branch analyzed: `feat/ai-001`
> Status: proposal (no code changes yet)

The issue raises three pain points when using the built-in AI Agent for heavy tool-calling workloads (Webpack reverse-engineering, repeated `execute_script` probing):

1. The 50-iteration hard limit cannot be raised from the UI.
2. Token consumption is very high because full tool outputs are retained across dozens of rounds.
3. No loop guard pauses the agent when it repeats near-identical failing calls.

This document maps each ask against what already exists in the codebase, identifies the real gaps, and proposes a phased implementation.

---

## 1. Current implementation — findings

### 1.1 Iteration limits are real, hardcoded per entry point, and not exposed for UI chat

The unified loop lives in `ToolLoopOrchestrator.callLLMWithToolLoop()` — `src/app/service/agent/service_worker/tool_loop_orchestrator.ts:85` (`while (iterations < maxIterations)`). On exhaustion it persists an error message and emits `errorCode: "max_iterations"` (`tool_loop_orchestrator.ts:271-287`), which is exactly the error quoted in the issue.

Each caller supplies its own default:

| Entry point | Default | User-configurable today? | Source |
|---|---|---|---|
| UI chat (options panel) | **50** | **No** — UI never sends the param | `chat_service.ts:319` (`params.maxIterations \|\| 50`); the chat payload built in `src/pages/options/routes/Agent/Chat/hooks.ts:192-199` has no `maxIterations` field |
| Userscript `CAT.agent.conversation` (ephemeral) | 20 | Yes, via `ConversationCreateOptions.maxIterations` | `chat_service.ts:398`, `src/app/service/agent/core/types.ts:219-230` |
| Scheduled internal tasks | 10 | **Yes — already has a UI field** | `task_service.ts:170`, `src/pages/options/routes/Agent/Tasks/TaskFormDialog.tsx:176-184` |
| Sub-agents (researcher / page_operator / general) | 20 / 30 / 30 | No | `src/app/service/agent/core/sub_agent_types.ts:33,68,89` |

So the issue's request ("expose `maxIterations` in settings, inject into `ConversationCreateOptions`") is: (a) already satisfied for userscripts and scheduled tasks, (b) genuinely missing **only for the UI chat panel** — the highest-traffic path.

**Important correction to the issue's "Alternatives" section:** hitting the limit does *not* lose the conversation. All messages (including every tool round) are persisted via `chatRepo.appendMessage` during the loop, so sending another message (e.g. "继续") resumes with a fresh 50-iteration budget and full history. The perceived "must start a new conversation and lose everything" is a UX/communication gap, not a data loss — nothing in the UI tells the user this. This makes a "Continue" affordance on the `max_iterations` error extremely cheap and high-value.

### 1.2 Context compression exists, but is all-or-nothing, and the biggest token leak is elsewhere

What exists:

- **Auto-compact**: when `inputTokens / contextWindow ≥ 0.8`, the whole history is summarized by the LLM and replaced with a single `[Conversation Summary]` message (`tool_loop_orchestrator.ts:113-121`, `compact_service.ts:50-96`, window sizes from `core/model_context.ts`). It fires only at 80% — for a 200K-window model that is ~160K tokens *per subsequent request*, long after the cost pain the issue describes.
- **Per-tool truncation is inconsistent**: `get_tab_content` truncates at `maxLength` and can route through the summary model (`core/tools/tab_tools.ts:169-186`), but **`execute_script` returns `JSON.stringify(result)` unbounded** (`core/tools/execute_script.ts:61,70`). A script that returns a DOM dump or module map injects megabytes into the context, and it is then re-sent on *every* remaining iteration. This is precisely the issue's scenario.
- **Tool results are never pruned**: every round appends full results (`tool_loop_orchestrator.ts:166`) and the array only shrinks at the 80% compact cliff.

The largest single cost factor, however, is a **prompt-caching gap**: the Anthropic provider sets `cache_control` only on the system prompt and tool definitions (`core/providers/anthropic.ts:139-141,153-155`) — **never on conversation messages**. In a 50-iteration loop the ever-growing message history is billed at the full input rate on every round, roughly O(n²) tokens per task. A moving cache breakpoint on the last message would convert the shared prefix of each round into cache reads (~10% of the input price on Anthropic). This change alone likely delivers more savings than any summarization scheme, with zero behavior change.

### 1.3 A loop guard already exists — but only nudges the model, never the user

`src/app/service/agent/core/tool_call_guard.ts` runs every round (`tool_loop_orchestrator.ts:237-242`) with four heuristics: identical tool+args called twice, `execute_script` returning null 3× consecutively, `get_tab_content` on the same tab 3×, and any tool ≥5 times in the last 8 calls. On detection it injects a `[System Warning]` user message and emits a `system_warning` UI event (rendered at `ChatArea.tsx:377`).

Gap vs. the issue's ask: warnings only steer the LLM; if the model ignores them, tokens keep burning. There is no pause-and-confirm. The building blocks for one already exist: the `ask_user` tool (`core/tools/ask_user.ts`), the `askResolvers` plumbing in `chat_service.ts`, and the pending-question UI in `hooks.ts:169-174`.

---

## 2. Proposal

### Phase 1 — Configurable max iterations + "Continue" affordance (core ask, small)

**2.1 `AgentConfigRepo`.** Add a small repo following the existing `SearchConfigRepo` pattern (`core/tools/search_config.ts`, `chrome.storage.local`, key `agent_config`):

```ts
export type AgentGeneralConfig = {
  chatMaxIterations: number; // default 50, clamp 1–1000
};
```

Expose `getAgentConfig` / `saveAgentConfig` via `Group.on(...)` in `agent.ts` next to the existing `getSearchConfig`/`saveSearchConfig` handlers (`agent.ts:215-216`), and mirror them on `agentClient`.

**2.2 Wire into the chat path.** In `chat_service.ts:319`, resolve the limit as `params.maxIterations ?? config.chatMaxIterations ?? 50`. Explicit per-call values (userscripts, tasks, sub-agents) keep precedence; their defaults stay 20/10/20-30 — this setting governs UI chat only. (Optionally a later iteration can apply the same config as the *default* for `ConversationCreateOptions` when a script omits it, as the issue suggests, but that changes script-facing defaults and should be a separate, documented decision.)

**2.3 Settings UI.** New "Conversation" (对话) card on the Agent Settings page (`src/pages/options/routes/Agent/Settings/index.tsx`), one numeric `SettingsField` mirroring the task dialog's `task-max-iter` input. The description carries the cost warning the issue itself proposes ("调大此选项可能会增加单次任务的 Token 开销"). i18n keys go into `src/locales/<locale>/agent.json` for all 8 locales, following `docs/translation/README.md` — no `defaultValue` fallbacks (banned by `scriptcat/no-i18n-default-value`).

**2.4 "Continue" button on the `max_iterations` error.** In the chat error rendering (`MessageItem.tsx:73-76` / `ChatArea.tsx`), when the persisted message's error code is `max_iterations`, show a one-click "继续 / Continue" action that re-invokes the existing `sendMessage` with a fixed continue prompt. Because history is already persisted (see §1.1), this fully solves the "lost 30 rounds of reverse-engineering context" complaint without any unlimited mode.

**On "unlimited" mode:** recommend **not** shipping a literal unlimited option. A bounded cap (up to 1000) plus the Continue button plus Phase 3 checkpoints gives the same capability with a safety floor. Unbounded loops in a background session (`background_session_manager.ts`) with a stuck model have no natural stop.

### Phase 2 — Token diet (highest ROI first)

**2.5 Message-history prompt caching (do this first).** In `core/providers/anthropic.ts`, add a `cache_control: { type: "ephemeral" }` breakpoint to the content of the last message (and optionally the second-to-last, staying within Anthropic's 4-breakpoint limit alongside system + tools). Each loop iteration then pays cache-read for the entire shared prefix instead of full input price. No behavior change, no UI, immediately addresses "单次逆向流程调试花费近 3 元". OpenAI-compatible providers already benefit from automatic prefix caching; the stable message ordering required is already in place.

**2.6 Cap `execute_script` output at the source.** In `core/tools/execute_script.ts`, truncate the stringified result beyond a threshold (suggest 30 000 chars ≈ 8K tokens) with head + tail retention and an explicit marker (`…[truncated 412 kB — return a smaller value or write to OPFS via opfs_write]`), mirroring the `get_tab_content` precedent (`tab_tools.ts:169-186`). This is the single biggest defense for the issue's exact workload. Apply the same generic cap in `ToolLoopOrchestrator` before `messages.push({ role: "tool", ... })` as a backstop for MCP/skill tools. The *persisted* message keeps the (already produced) full text so the UI can still show it; only the LLM context is capped.

**2.7 Sliding-window elision of old tool results.** When building each round's request, replace `role: "tool"` contents older than the last K assistant turns (suggest K = 5) with a stub (`[tool result elided — re-run the tool if needed]`), keeping assistant text and tool-call names intact so the reasoning trail survives. Two constraints learned from the current code:

- **Prune the in-flight `messages` array only** — never the repo. Persistence and UI history stay complete (same separation `autoCompact` already uses).
- **Batch the elision at thresholds** (e.g. at 40% / 60% context usage), not every round — every prefix rewrite invalidates the Phase 2.5 prompt cache, so continuous pruning would cost more than it saves. Threshold-stepped pruning keeps long stable prefixes between rewrites.

Additionally, lower the compact trigger from 80% to ~70% and consider keeping the last K rounds verbatim after compact (today `autoCompact` replaces *everything* with the summary, `compact_service.ts:78-82`, dropping fresh tool state the model still needs).

### Phase 3 — Loop-guard escalation to the user (the issue's point 3)

**2.8 Escalating guard.** Extend `detectToolCallIssues` (or wrap it in the orchestrator) with a strike counter per conversation. Today each warning advances `guardStartIndex` and the loop continues unconditionally (`tool_loop_orchestrator.ts:237-242`). Proposed: after the 2nd guard hit in one run, pause the loop and ask the user via the existing `ask_user` machinery ("Agent 疑似陷入循环（已重复调用 execute_script N 次且结果相似），是否继续？[继续 / 停止]"). On "stop", end the run gracefully (persist partial result) instead of erroring.

**2.9 Iteration checkpoints.** Optional setting `iterationCheckpoint` (e.g. every 25 rounds): the loop pauses and asks "已连续执行 25 次工具调用，是否继续？" — matching the competitor behavior cited in the issue. Rules:

- **UI chat only.** Scheduled tasks (`task_service.ts`) and sub-agents must never block on a human; they keep hard caps.
- **Background sessions** (UI detached, `background_session_manager.ts`): auto-continue with a logged `system_warning`, or auto-stop per setting — an unanswerable question must not hang the service worker.

### Out of scope (rejected alternatives)

- **Similarity-based ML loop detection**: the existing four heuristics plus escalation cover the practical cases; embedding-based similarity adds latency and a model dependency for marginal gain.
- **Client-side token pre-counting** for exact budget UI: provider tokenizers differ; the existing `usage`-driven ratio is sufficient.

---

## 3. Compatibility & security

- All changes are additive. Existing defaults (50 / 20 / 10 / 20-30) are unchanged; the userscript API surface (`ConversationCreateOptions`) is untouched in Phase 1.
- Upper clamp (1000) plus checkpoint confirmations bound worst-case spend; the settings field carries the token-cost warning text the issue requested.
- Truncation caps reduce, never increase, what leaves the browser toward LLM providers.
- Cache breakpoints send no additional data; `cache: false` callers (e.g. compact runs, `compact_service.ts:71`) are unaffected.

## 4. Test plan (TDD, per `AGENTS.md`)

Failing tests first, BDD-style Chinese titles, extending existing suites:

1. `tool_loop_orchestrator` (`agent.test.ts` / new spec): reads config default when caller omits `maxIterations`; emits checkpoint `ask_user` at N; guard escalation pauses after 2nd strike; elision keeps last K tool results and repo messages intact.
2. `execute_script` truncation: oversized result capped with marker; small results untouched.
3. `anthropic` provider (`llm.test.ts` pattern): `cache_control` present on last message block when `cache !== false`, absent otherwise, ≤4 breakpoints total.
4. Settings UI (`Settings/index.test.tsx` pattern): field renders, clamps 1–1000, persists via `agentClient`.
5. Chat UI: `max_iterations` error renders Continue action; clicking resumes the conversation.

## 5. Suggested rollout

| Phase | Items | Size | User-visible effect |
|---|---|---|---|
| 1 | Config repo + settings field + wire-in + Continue button | S | Unblocks the issue author immediately |
| 2 | Cache breakpoints → execute_script cap → sliding window | M | 5–10× cost reduction on long tool loops |
| 3 | Guard escalation + iteration checkpoints | M | Stops dead loops before the budget burns |

Phases are independently shippable; Phase 2.5 (cache breakpoints) is the best effort-to-savings ratio in the whole proposal and could even ship first.

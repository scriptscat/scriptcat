# Repository Guidelines

This is the repo-wide contract for AI coding agents. It owns **engineering principles** and the **architecture quick-map** only. Concrete mechanics belong to the routed docs below. Compatibility instruction entry points reuse this file and do not maintain a second contract.

Use [`docs/README.md`](docs/README.md) as the document index. When a routed document owns a concern, follow that document and link to it rather than copying its content here.

## Route the task before acting

| Before you… | Read |
| --- | --- |
| write any code | [`docs/develop.md`](docs/develop.md) |
| review code or a pull request | [`docs/develop.md`](docs/develop.md) — plus [`docs/pull-request.md`](docs/pull-request.md) for PR-body rules |
| change a process/message/service/persistence boundary or add a subsystem | [`docs/architecture.md`](docs/architecture.md) — plus the relevant `docs/references/architecture-*.md` deep-dive |
| build or modify any page, dialog, or block | [`docs/design.md`](docs/design.md) — its Core Constraints apply to *every* UI change, not only new pages |
| add or change localized content | [`docs/translation.md`](docs/translation.md) — plus the matching `docs/references/terminology-<locale>.md` when one exists |
| add, edit, reorganize, or review any tracked contributor Markdown (this file, `docs/*`, `.github/*.md`, package- and source-local READMEs) | [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md) — *if you can't grep it on this branch, don't claim it* |
| open or update a pull request | [`docs/pull-request.md`](docs/pull-request.md) |
| manually confirm a feature works | [`docs/verification.md`](docs/verification.md) — a throwaway scratch script against the built extension, not the committed suite |

For a task that spans several rows, read each applicable owner before performing that part of the task; do not front-load unrelated docs just because they might become relevant later. For a task that fits none of them cleanly, inspect `docs/README.md` and the nearby implementation/tests before inventing a new rule or abstraction.

## Project Overview

ScriptCat — Manifest V3 browser extension that runs Tampermonkey-compatible user scripts. TypeScript + React 19 + Rspack. Package manager is **pnpm** (preinstall enforces). The presentation layer (`src/pages/`) is **shadcn/ui + Tailwind CSS v4** (migrated from Arco Design + UnoCSS).

## Engineering Principles

These are the repo-wide defaults. When a principle links to a narrow, explicit exception in its owning document, that exception is part of the same contract; unrelated or unlinked downstream prose does not silently override the principle.

- **Fix root causes, not symptoms — refactor over patch.** No `as any` / `// @ts-ignore` / try-catch swallow / defensive skips to make errors disappear (宁愿重构也不要打补丁). If a test fails, fix the code, not the test — the narrow exceptions (a wrong test contract; a test that never carried value) are in [`docs/references/develop-testing.md`](docs/references/develop-testing.md#writing-meaningful-tests-what-to-clean-up--not-write).
- **Confirm before you fix.** Before touching a reported bug, reproduce it and confirm it actually exists — never fix from assumption. Capture the reproduction, then fix, **in that order** (确定 bug 存在 → 写测试或记录验证证据 → 修复); how to reproduce and what counts as capture are in [`docs/verification.md`](docs/verification.md) and the TDD entry below.
- **TDD/BDD first, for changes that alter observable behavior.** Write failing tests **before** implementing new or changed behavior, using BDD-style `describe`/`it` titles (Chinese or English). Two narrow exceptions — neither a blanket file/task category — are in [`docs/references/develop-testing.md`](docs/references/develop-testing.md#when-tdd-doesnt-apply). (Runner, mocks, and how to run tests are in `docs/develop.md`.)
- **SOLID, high cohesion & low coupling — applied to the existing extension points.** Persistence is a small backend taxonomy (`Repo<T>` / `DAO<T>` / `OPFSRepo` / a few custom repos), not one pattern to default to — pick by matching an existing entity with the same needs; see [`docs/references/architecture-data.md`](docs/references/architecture-data.md#adding-an-entity). For messages, use `Group.on(...)`. Not every service takes the same constructor shape — context services vs. the Agent subsystem differ; see [`docs/references/architecture-services.md`](docs/references/architecture-services.md#adding-a-service). Depend on narrow interfaces (`IMessageQueue`, not `MessageQueue`).
- **Direct replacement over adapter sandwiches.** When swapping a backend/library, replace in place — no `interface Foo + LegacyImpl + NewImpl` unless both must coexist at runtime.
- **Scope discipline — stay in your lane.** Bug fix ≠ cleanup PR. Touch only the files the task requires; leave unrelated files untouched (不要动和任务不相干的文件). Don't add helpers, abstractions, validation, or backwards-compat shims you don't need today. Three similar lines beats a premature abstraction. Don't remove or narrow currently supported behavior just to simplify a fix — only do so when the task or an already-verified contract explicitly calls for that change. This rule also governs test cleanup — [`docs/references/develop-testing.md`](docs/references/develop-testing.md#scope--cleanup-boundary) operationalizes it for tests, it does not carve out an exception.
- **No dead code or `// removed` markers** — git remembers. Delete unused code outright.
- **Comments explain "why", not "what".** Do not use ephemeral review labels such as `finding N` or review-round identifiers in comments or test names. Permanent issue or PR references are allowed when useful, but must supplement—not replace—the explanation. Do not restate code, duplicate enclosing documentation, or leave stale comments after code changes. See [`docs/develop.md`](docs/develop.md#comment-discipline) for the full policy.

## Decision and review discipline

- **Evidence before conclusion.** A request or maintainer direction authorizes scoped work; it does not prove a reported bug, necessity, or correctness. Separate execution authority, stated context, observations, and the normative specification or accepted contract. State when a material claim is inferred, unverified, or contradicted.
- **Rationale before implementation summary.** For a material change, connect the observable problem or requirement, affected scope and consequence, why action is justified, the selected remedy, acceptance evidence, and remaining limitation. The diff shows what changed; it does not prove why the change was necessary.
- **Smallest justified semantic scope, not smallest diff.** A larger refactor is appropriate when it is the smallest sound root-cause repair. Do not call a solution minimal, best, or least risky without comparative support.
- **Claim strength follows evidence.** Source reasoning, an executed test, browser runtime, and an external integration run prove different scopes. A negative claim requires observation of the relevant channel through its closure window or a causal proof that the side effect cannot occur.
- **Agent readiness is bounded.** An agent must not present a material change as review-ready when acceptance fails, a critical contradiction or evidence gap remains, the scope is unjustified, or final-patch evidence is stale. An explicitly requested draft or investigation may proceed when labeled as such; report the blocker and the condition that would clear it.
- **Review coverage is semantic as well as physical.** Inspect every changed file and follow affected paths. Map material semantic families to representatives, disposition, highest-risk seam, and residual risk; distinguish confidence in a finding from completeness of the declared scope. On re-review, bind the current head and reconcile findings as still present, resolved, narrowed, stale, or new.
- **Findings need a witness and impact.** Report a finding only with a concrete trigger or proof path, a material consequence, a useful location, and an actionable contract to restore. Do not turn an unverified repository-specific assumption into a finding.

## Architecture

This is an orientation map, not an implementation manual. Use [`docs/architecture.md`](docs/architecture.md) and its referenced deep-dives before changing a boundary or adding a subsystem.

### Multi-Process Model

5 isolated contexts communicating via message passing:

```text
Service Worker (src/service_worker.ts)
  ├── ExtensionMessage ──────────────→ Content Script (src/content.ts)
  │                                        └── CustomEventMessage ──→ Inject Script (src/inject.ts)
  └── ServiceWorkerMessageSend ──────→ Offscreen (src/offscreen.ts)   (Chrome; Firefox uses EventPageOffscreenManager)
                                           └── WindowMessage ──→ Sandbox (src/sandbox.ts)
```

> SW → Offscreen uses `ServiceWorkerMessageSend` (`clients.matchAll()` + `postMessage`) on Chrome and
> `EventPageOffscreenManager` on Firefox MV3; Offscreen replies to SW over `ExtensionMessage`. `WindowMessage`
> is the Offscreen ↔ Sandbox channel.

- **Service Worker** — central hub: script CRUD, chrome APIs, permission verification, resource caching, message routing
- **Content** — bridges SW and inject script
- **Inject** — runs in page context with `unsafeWindow`
- **Offscreen** — DOM-capable background environment for background/scheduled scripts
- **Sandbox** — isolated execution via `with(arguments[0])`; cron scheduling

Execution paths: page scripts → `chrome.userScripts`; background → SW → Offscreen → Sandbox; scheduled → cron in Sandbox.

### Message Passing (`packages/message/`)

`ExtensionMessage` (chrome.runtime — SW ↔ Content / Inject / Offscreen), `WindowMessage` (postMessage — Offscreen ↔ Sandbox), `ServiceWorkerMessageSend` (`clients.matchAll()` + `postMessage` — SW → Offscreen on Chrome), `CustomEventMessage` (CustomEvent — Content ↔ Inject), `MessageQueue` (cross-context broadcast).

### Service & Data Layers

- Services live under `src/app/service/` as **context services** (`content/`, `offscreen/`, `sandbox/`, `service_worker/`) plus **cross-cutting subsystems** (`agent/`, `extension/`, `queue.ts`) — not one uniform shape. Details, inventory, "adding a service": [`docs/references/architecture-services.md`](docs/references/architecture-services.md).
- Persistence is a backend taxonomy (`Repo<T>` / `DAO<T>` / `OPFSRepo` / custom), not one pattern. Details, inventory, "adding an entity": [`docs/references/architecture-data.md`](docs/references/architecture-data.md).
- **GM API** split across content / SW / offscreen, each a `GMApi`; values via `ValueService`. Adding a new GM API: [`docs/references/architecture-gm-api.md`](docs/references/architecture-gm-api.md).
- **Agent subsystem** (`src/app/service/agent/`) is an AI-agent layer spanning the existing five contexts, not a sixth. Full write-up: [`docs/references/architecture-agent.md`](docs/references/architecture-agent.md).

### Browser Extension APIs (MV3)

`chrome.userScripts` (page injection), Offscreen API (DOM in background), Declarative Net Request (intercepts `.user.js` URLs to trigger install flow).

### Key Packages

`message/` (with mocks), `filesystem/` (WebDAV, cloud drive providers, zip export — see [`docs/cloud-sync.md`](docs/cloud-sync.md)), `cloudscript/`, `eslint/` (userscript lint config — `eslint-plugin-userscripts`-based `defaultConfig` for the in-app editor), `chrome-extension-mock/`.

The project's *own* custom ESLint rules live in `eslint-rules/` at the repo root, **not** in `packages/eslint/`; both are documented in [`docs/develop.md`](docs/develop.md#eslint-custom-rules).

## Completion checksum

Before claiming a task is complete, use the applicable owner docs above to verify the final state. This section is a handoff checklist, not a second copy of their mechanics; when a detail matters, the linked owner wins. If an item cannot be checked, report the limitation instead of upgrading the claim to “verified” or “all fixed.”

- **Owners:** every part of the task was checked against its applicable routed owner; documentation work follows [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md).
- **Evidence:** reproduction, tests, and manual evidence satisfy the applicable rules in [`docs/references/develop-testing.md`](docs/references/develop-testing.md) and [`docs/verification.md`](docs/verification.md), including any explicit exception used.
- **Contract & scope:** the final diff still matches the requested/verified behavior and the scope-discipline principles above; no unrelated compatibility layer or cleanup slipped in.
- **Extension point:** architecture-sensitive changes were checked against [`docs/architecture.md`](docs/architecture.md) and the relevant deep-dive instead of creating a parallel abstraction from memory.
- **Facts:** changed documentation claims were checked using the branch-aware process in [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md), not memory or untracked files.
- **Verification:** the checks required by the applicable owner docs were run, and any environment/tooling blocker is stated explicitly in the completion report or PR.

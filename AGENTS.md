# Repository Guidelines

This is the repo-wide contract for AI coding agents. It owns only engineering principles and the architecture
quick-map; concrete mechanics belong to the routed docs. Compatibility entry points reuse this file and have no
separate contract. Use [`docs/README.md`](docs/README.md) as the index and follow the owning doc instead of
duplicating its rules.

## Route the task before acting

| Before you… | Read |
| --- | --- |
| write code | [`docs/develop.md`](docs/develop.md) |
| review or report a branch/PR, or create/update a PR or publish its branch | [`docs/develop.md#revision-scope-and-publication-binding`](docs/develop.md#revision-scope-and-publication-binding) + [`docs/pull-request.md`](docs/pull-request.md) |
| change a process/message/service/persistence boundary or add a subsystem | [`docs/architecture.md`](docs/architecture.md) + the relevant `docs/references/architecture-*.md` |
| build or modify a page, dialog, or block | [`docs/design.md`](docs/design.md) — Core Constraints apply to every UI change |
| add or change localized content | [`docs/translation.md`](docs/translation.md) + matching `docs/references/terminology-<locale>.md` when present |
| add, edit, reorganize, or review tracked contributor Markdown (`AGENTS.md`, `docs/*`, `.github/*.md`, package/source-local READMEs) | [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md) — if you can't grep it on this branch, don't claim it |
| manually confirm a feature works | [`docs/verification.md`](docs/verification.md) — drive a throwaway session against the built extension, not the committed suite |

For tasks matching multiple rows, read every applicable owner before that work; do not front-load unrelated
docs. For tasks matching none, inspect `docs/README.md` and nearby implementation/tests before inventing a rule
or abstraction.

## DeepWiki Context

For unfamiliar subsystems, when `.deepwiki/index.md` exists, start there and open only the relevant linked pages;
don't bulk-load `.deepwiki/`. Treat it as background only: current code and the owning docs above are authoritative.

## Project Overview

ScriptCat is a Manifest V3 browser extension for Tampermonkey-compatible user scripts, built with TypeScript,
React 19, and Rspack. **pnpm** is required by `preinstall`. The presentation layer (`src/pages/`) uses shadcn/ui
and Tailwind CSS v4 (migrated from Arco Design + UnoCSS).

## Engineering Principles

These are repo-wide defaults. A linked, narrow exception in its owning doc is part of the contract; unrelated
downstream prose does not override it.

- **Fix root causes, not symptoms — refactor over patch.** No `as any`, `// @ts-ignore`, swallowed errors, or
  defensive skips or try-catch swallowing (宁愿重构也不要打补丁). When a test fails, fix the code rather than the test, except for a wrong
  test contract or valueless test as defined in
  [`docs/references/develop-testing.md`](docs/references/develop-testing.md#writing-meaningful-tests-what-to-clean-up--not-write).
- **Confirm before fixing.** Reproduce and confirm a reported bug before changing it; capture the reproduction
  first (确定 bug 存在 → 写测试或记录验证证据 → 修复). Use [`docs/verification.md`](docs/verification.md) and
  the TDD principle in this section for the evidence standard.
- **TDD/BDD first for observable behavior.** Write a failing `describe`/`it` test before implementation, with
  Chinese or English titles. The two narrow, non-blanket exceptions are in
  [`docs/references/develop-testing.md`](docs/references/develop-testing.md#when-tdd-doesnt-apply); runner,
  mocks, and how to run tests are in [`docs/develop.md`](docs/develop.md).
- **SOLID, high cohesion, low coupling.** Match existing extension points: persistence uses the small
  `Repo<T>` / `DAO<T>` / `OPFSRepo` / custom-repo taxonomy, matching an existing entity with the same needs;
  messages use `Group.on(...)`; service constructor shapes differ by context and Agent subsystem; depend on
  narrow interfaces such as `IMessageQueue`, not `MessageQueue`. See
  [`docs/references/architecture-data.md`](docs/references/architecture-data.md#adding-an-entity),
  [`docs/references/architecture-services.md`](docs/references/architecture-services.md#adding-a-service).
- **Direct replacement over adapter sandwiches.** Replace a backend/library in place; add
  `interface Foo + LegacyImpl + NewImpl` only when both must coexist at runtime.
- **Scope discipline.** Bug fix ≠ cleanup PR: touch only required files (不要动和任务不相干的文件), add no unneeded
  helpers/abstractions/validation/backwards-compat shims, and prefer three similar lines to a premature abstraction.
  Do not remove or narrow supported
  behavior for simplification unless the task or an already-verified contract explicitly calls for it. The same boundary applies to
  test cleanup; see [`docs/references/develop-testing.md`](docs/references/develop-testing.md#scope--cleanup-boundary).
- **No dead code or `// removed` markers.** Delete unused code; git remembers.
- **Comments explain why.** Do not restate code, duplicate enclosing documentation, leave stale comments, or use
  ephemeral review-round labels such as `finding N` in comments or test names. Permanent issue/PR references may
  supplement, not replace, the explanation. See
  [`docs/develop.md`](docs/develop.md#comment-discipline).

## Decision and review discipline

- **Separate authority from evidence.** A request or maintainer direction is execution authority within scope;
  issues/PRs provide stated intent and context; source inspection, tests, browser runs, and integrations provide
  observations; normative specifications, compatibility contracts, security policies, accepted contracts or oracles, and
  maintainer decisions determine correctness. A request/issue/PR does not prove a bug, necessity, or correctness.
  Label inferences, unverified, and contradicted claims.
- **State rationale before summary.** For material changes, connect problem/requirement → affected
  scope/consequence → premise evidence → justification → remedy/trade-off → acceptance evidence → limitation/risk.
  A diff shows what changed, not why.
- **Use the smallest justified semantic scope, not smallest diff.** A larger refactor is valid when it is the
  smallest sound root-cause repair; do not call a solution minimal, best, or least risky without support.
- **Match claim strength to evidence.** Static reasoning, executed tests, browser runs, and external integrations
  prove different scopes. A negative claim needs the relevant channel observed through its closure window or a
  causal proof that the side effect cannot occur.
- **Bound readiness.** Do not call a material change review-ready with failed acceptance, a critical contradiction
  or evidence gap, unjustified scope, or stale final-patch evidence. A requested draft/investigation may proceed
  when labeled; report the blocker and clearing condition.
- **Review semantic and physical coverage.** Inspect every changed file and affected path. Map material semantic
  families to representatives, disposition, highest-risk seam, and residual risk; separate confidence from
  completeness. On re-review, bind the current head and reconcile findings as present, resolved, narrowed, stale,
  or new.
- **Require a witness and impact for findings.** Report only a concrete trigger/proof path, material consequence,
  useful location, and actionable contract to restore; do not turn an unverified repository assumption into a
  finding.

## Architecture

Use [`docs/architecture.md`](docs/architecture.md) and its referenced deep-dives before changing a boundary or
adding a subsystem. This section is orientation, not an implementation manual.

### Multi-Process Model

5 isolated contexts communicate by message passing:

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

- **Service Worker** — central hub for script CRUD, Chrome APIs, permission verification, resource caching, and message routing.
- **Content** — bridges SW and inject script.
- **Inject** — runs in page context with `unsafeWindow`.
- **Offscreen** — DOM-capable background environment for background/scheduled scripts.
- **Sandbox** — isolated execution via `with(arguments[0])`; cron scheduling.

Execution paths: page scripts → `chrome.userScripts`; background → SW → Offscreen → Sandbox; scheduled → cron in
Sandbox.

### Message Passing (`packages/message/`)

`ExtensionMessage` (chrome.runtime — SW ↔ Content / Inject / Offscreen), `WindowMessage` (postMessage — Offscreen ↔
Sandbox), `ServiceWorkerMessageSend` (`clients.matchAll()` + `postMessage` — SW → Offscreen on Chrome),
`CustomEventMessage` (CustomEvent — Content ↔ Inject), and `MessageQueue` (cross-context broadcast).

### Service & Data Layers

- Services live under `src/app/service/` as context services (`content/`, `offscreen/`, `sandbox/`,
  `service_worker/`) plus cross-cutting subsystems (`agent/`, `extension/`, `queue.ts`), not one uniform shape. See
  [`docs/references/architecture-services.md`](docs/references/architecture-services.md#adding-a-service) for inventory and adding services.
- Persistence is a backend taxonomy (`Repo<T>` / `DAO<T>` / `OPFSRepo` / custom), not one default pattern. See
  [`docs/references/architecture-data.md`](docs/references/architecture-data.md#adding-an-entity) for inventory and adding entities.
- **GM API** is split across content / SW / offscreen, each with a `GMApi`; values use `ValueService`. See
  [`docs/references/architecture-gm-api.md`](docs/references/architecture-gm-api.md) for additions.
- **Agent subsystem** (`src/app/service/agent/`) is an AI-agent layer spanning the five contexts, not a sixth. See
  [`docs/references/architecture-agent.md`](docs/references/architecture-agent.md).

### Browser Extension APIs (MV3)

`chrome.userScripts` (page injection), Offscreen API (DOM in background), and Declarative Net Request (intercepts
`.user.js` URLs to trigger installation).

### Key Packages

`message/` (with mocks), `filesystem/` (WebDAV, cloud-drive providers, ZIP export; see
[`docs/cloud-sync.md`](docs/cloud-sync.md)), `cloudscript/`, `eslint/` (userscript lint config based on
`eslint-plugin-userscripts` and `defaultConfig` for the in-app editor), and `chrome-extension-mock/`. The project's own custom ESLint
rules live in root `eslint-rules/`, not `packages/eslint/`; both are documented in
[`docs/develop.md`](docs/develop.md#eslint-custom-rules).

## Completion checksum

Before claiming completion, use the applicable owner docs to check the final state. This is a handoff checklist, not
a second copy of their mechanics; when details matter, linked owners win. If a check cannot be completed, state the
limitation instead of claiming “verified” or “all fixed” without evidence.

- **Owners/facts.** Every task part follows its routed owner; changed documentation follows
  [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md), including branch-aware fact checks against committed
  code, not memory or untracked files.
- **Evidence/verification.** Reproduction, tests, manual evidence, and the applicable rules in
  [`docs/references/develop-testing.md`](docs/references/develop-testing.md) and [`docs/verification.md`](docs/verification.md)
  support the claim, including any explicit exception; run required checks and report blockers or tooling limits.
- **Contract/scope.** The final diff matches the requested or verified behavior, contains no unrelated cleanup or
  compatibility layer, and preserves scope discipline.
- **Architecture.** Boundary-sensitive work was checked against [`docs/architecture.md`](docs/architecture.md) and
  the relevant deep-dive rather than inventing a parallel abstraction.

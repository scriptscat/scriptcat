# Repository Guidelines

This file provides guidance to AI coding agents (Claude Code, etc.) when working with code in this repository.
It holds only the engineering principles and the architecture quick-map; the concrete "how" belongs to the docs
below. `CLAUDE.md` merely `@import`s this file — don't split guidance between the two. Link the owning doc
instead of copying its content here.

**Read before you act.** [`docs/README.md`](docs/README.md) indexes the full doc set.

| Before you… | Read |
| --- | --- |
| write any code | [`docs/develop.md`](docs/develop.md) |
| build or modify any page, dialog, or block | [`docs/design.md`](docs/design.md) — its Core Constraints apply to *every* UI change, not only new pages |
| add or change localized content | [`docs/translation.md`](docs/translation.md) — plus the matching `docs/references/terminology-<locale>.md` when one exists |
| add, edit, reorganize, or review any tracked contributor Markdown (this file, `docs/*`, `.github/*.md`, package- and source-local READMEs) | [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md) — *if you can't grep it on this branch, don't claim it* |
| open or update a pull request | [`docs/pull-request.md`](docs/pull-request.md) |
| manually confirm a feature works | [`docs/verification.md`](docs/verification.md) — a throwaway scratch script against the built extension, not the committed suite |

## Project Overview

ScriptCat — Manifest V3 browser extension that runs Tampermonkey-compatible user scripts. TypeScript + React 19 + Rspack. Package manager is **pnpm** (preinstall enforces). The presentation layer (`src/pages/`) is **shadcn/ui + Tailwind CSS v4** (migrated from Arco Design + UnoCSS).

## Engineering Principles

These are non-negotiable, regardless of what `docs/develop.md` says about mechanics — where a principle's scope
isn't universal, that's called out in the item itself.

- **Fix root causes, not symptoms — refactor over patch.** No `as any` / `// @ts-ignore` / try-catch swallow / defensive skips to make errors disappear (宁愿重构也不要打补丁). If a test fails, fix the code, not the test — the narrow exceptions (a wrong test contract; a test that never carried value) are in [`docs/references/develop-testing.md`](docs/references/develop-testing.md#writing-meaningful-tests-what-to-clean-up--not-write).
- **Confirm before you fix.** Before touching a reported bug, reproduce it and confirm it actually exists — never fix from assumption. Capture the reproduction, then fix, **in that order** (确定 bug 存在 → 写测试或记录验证证据 → 修复); how to reproduce and what counts as capture are in [`docs/verification.md`](docs/verification.md) and the TDD entry below.
- **TDD/BDD first, for changes that alter observable behavior.** Write failing tests **before** implementing new or changed behavior, using BDD-style `describe`/`it` titles (Chinese or English). Two narrow exceptions — neither a blanket file/task category — are in [`docs/references/develop-testing.md`](docs/references/develop-testing.md#when-tdd-doesnt-apply). (Runner, mocks, and how to run tests are in `docs/develop.md`.)
- **SOLID, high cohesion & low coupling — applied to the existing extension points.** Persistence is a small backend taxonomy (`Repo<T>` / `DAO<T>` / `OPFSRepo` / a few custom repos), not one pattern to default to — pick by matching an existing entity with the same needs; see [`docs/references/architecture-data.md`](docs/references/architecture-data.md#adding-an-entity). For messages, use `Group.on(...)`. Not every service takes the same constructor shape — context services vs. the Agent subsystem differ; see [`docs/references/architecture-services.md`](docs/references/architecture-services.md#adding-a-service). Depend on narrow interfaces (`IMessageQueue`, not `MessageQueue`).
- **Direct replacement over adapter sandwiches.** When swapping a backend/library, replace in place — no `interface Foo + LegacyImpl + NewImpl` unless both must coexist at runtime.
- **Scope discipline — stay in your lane.** Bug fix ≠ cleanup PR. Touch only the files the task requires; leave unrelated files untouched (不要动和任务不相干的文件). Don't add helpers, abstractions, validation, or backwards-compat shims you don't need today. Three similar lines beats a premature abstraction. Don't remove or narrow currently supported behavior just to simplify a fix — only do so when the task or an already-verified contract explicitly calls for that change. This rule also governs test cleanup — [`docs/references/develop-testing.md`](docs/references/develop-testing.md#scope--cleanup-boundary) operationalizes it for tests, it does not carve out an exception.
- **No dead code or `// removed` markers** — git remembers. Delete unused code outright.
- **Comments explain "why", not "what".** Do not use ephemeral review labels such as `finding N` or review-round identifiers in comments or test names. Permanent issue or PR references are allowed when useful, but must supplement—not replace—the explanation. Do not restate code, duplicate enclosing documentation, or leave stale comments after code changes. See [`docs/develop.md`](docs/develop.md#comment-discipline) for the full policy.

## Architecture

Quick map only — the internals guide and its "how to extend" recipes are in
[`docs/architecture.md`](docs/architecture.md).

### Multi-Process Model

5 isolated contexts communicating via message passing:

```
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

# Repository Guidelines

This file provides guidance to AI coding agents (Claude Code, etc.) when working with code in this repository.

> **Note:** This is the single source of truth relative to `CLAUDE.md` — `CLAUDE.md` only contains `@AGENTS.md`
> and re-imports this file; don't split guidance between the two, put it here. Detailed guidance beyond
> engineering principles and the architecture map is owned by the docs linked below (see
> [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md)'s ownership table) — cross-link them, don't duplicate
> their content here.

> **Before writing any code, read [`docs/develop.md`](docs/develop.md)** — the development spec (commands,
> project structure, coding style, UI & theme rules, testing mechanics, i18n, and the commit/PR workflow). This
> file keeps only the non-negotiable engineering principles and the architecture map; the concrete "how" lives
> in that same guide, and deep internals in [`docs/architecture.md`](docs/architecture.md).

> **To manually verify a feature actually works, read [`docs/verification.md`](docs/verification.md)** — drive
> the real built extension end-to-end with one-shot throwaway scratch scripts (not the committed test suite).

> **Before building or modifying any page, dialog, or block, read [`docs/design.md`](docs/design.md)** — the
> design system: color tokens, component palette, layout/motion/state patterns, and the new-page recipe. Its
> Core Constraints apply to every UI change, not just new ones.

> **Before any translation/localization work, read [`docs/translation.md`](docs/translation.md)** —
> the single source of truth for translation. Whenever you add or change localized content
> (`src/locales/<locale>/*.json` namespace files, per-language docs, UI copy, or test snapshots), you must first
> read that guide and follow the matching `docs/references/terminology-<locale>.md` if it exists.

> **Before adding, editing, reorganizing, or reviewing any tracked agent/contributor Markdown — this file,
> `docs/*`, `.github/*.md`, package-local READMEs, and source-local READMEs — read
> [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md)** — keep the doc set organized (links resolve, index
> current, no duplication, no cross-document policy conflicts) and every claim factually true against the current
> branch (*if you can't grep it on this branch, don't claim it*). That guide owns the full checklist; don't copy
> it into this always-loaded file.

> **Before opening or updating a pull request, read [`docs/pull-request.md`](docs/pull-request.md)** — this
> repo's PR description structure and evidence rules.

> **Doc map:** [`docs/README.md`](docs/README.md) indexes every contributor doc (development, architecture,
> translation, contributing, localized READMEs).

## Project Overview

ScriptCat — Manifest V3 browser extension that runs Tampermonkey-compatible user scripts. TypeScript + React 19 + Rspack. Package manager is **pnpm** (preinstall enforces).

> **UI stack.** The presentation layer (`src/pages/`) is built with **shadcn/ui + Tailwind CSS v4** on
> **React 19** (migrated from Arco Design + UnoCSS). The concrete UI/theme rules live in
> [`docs/develop.md`](docs/develop.md); the design system (color tokens, components, layout/motion/state
> patterns, new-page recipe) lives in [`docs/design.md`](docs/design.md).

## Engineering Principles

These are non-negotiable, regardless of what `docs/develop.md` says about mechanics — where a principle's scope
isn't universal, that's called out in the item itself.

- **Fix root causes, not symptoms — refactor over patch.** No `as any` / `// @ts-ignore` / try-catch swallow / defensive skips to make errors disappear (宁愿重构也不要打补丁). If a test fails, fix the code, not the test — the narrow exceptions (a wrong test contract; a test that never carried value) are in [`docs/references/develop-testing.md`](docs/references/develop-testing.md#writing-meaningful-tests-what-to-clean-up--not-write).
- **Confirm before you fix.** Before touching a reported bug, reproduce it and confirm it actually exists — never fix from assumption. Capture the reproduction, then fix, **in that order** (确定 bug 存在 → 写测试或记录验证证据 → 修复); how to reproduce and what counts as capture are in [`docs/verification.md`](docs/verification.md) and the TDD entry below.
- **TDD/BDD first, for changes that alter observable behavior.** Write failing tests **before** implementing new or changed behavior, using BDD-style Chinese `describe`/`it` titles. Two narrow exceptions — neither a blanket file/task category — are in [`docs/references/develop-testing.md`](docs/references/develop-testing.md#when-tdd-doesnt-apply). (Runner, mocks, and how to run tests are in `docs/develop.md`.)
- **SOLID, high cohesion & low coupling — applied to the existing extension points.** Persistence is a small backend taxonomy (`Repo<T>` / `DAO<T>` / `OPFSRepo` / a few custom repos), not one pattern to default to — pick by matching an existing entity with the same needs; see [`docs/references/architecture-data.md`](docs/references/architecture-data.md#adding-an-entity). For messages, use `Group.on(...)`. Not every service takes the same constructor shape — context services vs. the Agent subsystem differ; see [`docs/references/architecture-services.md`](docs/references/architecture-services.md#adding-a-service). Depend on narrow interfaces (`IMessageQueue`, not `MessageQueue`).
- **Direct replacement over adapter sandwiches.** When swapping a backend/library, replace in place — no `interface Foo + LegacyImpl + NewImpl` unless both must coexist at runtime.
- **Scope discipline — stay in your lane.** Bug fix ≠ cleanup PR. Touch only the files the task requires; leave unrelated files untouched (不要动和任务不相干的文件). Don't add helpers, abstractions, validation, or backwards-compat shims you don't need today. Three similar lines beats a premature abstraction. Don't remove or narrow currently supported behavior just to simplify a fix — only do so when the task or an already-verified contract explicitly calls for that change.
- **No dead code or `// removed` markers** — git remembers. Delete unused code outright.
- **Comments explain "why", not "what".** Do not use ephemeral review labels such as `finding N` or review-round identifiers in comments or test names. Permanent issue or PR references are allowed when useful, but must supplement—not replace—the explanation. Do not restate code, duplicate enclosing documentation, or leave stale comments after code changes. See [`docs/develop.md`](docs/develop.md#comment-discipline) for the full policy.

## Architecture

> **Deep dive:** [`docs/architecture.md`](docs/architecture.md) — the human-facing internals guide for
> contributors working on ScriptCat core: process model, message passing, service/data layers, GM API system,
> script execution, and the build pipeline, with "how to extend" recipes. The section below is the quick map.

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

> The project's own custom ESLint rules (`eslint-rules/` at the repo root, wired in `eslint.config.mjs` —
> **not** `packages/eslint/`, which is the unrelated userscript lint config) are documented in
> [`docs/develop.md`](docs/develop.md#eslint-custom-rules): exact rule names, scopes, and which are covered by
> `eslint-rules/harness.test.mjs`.

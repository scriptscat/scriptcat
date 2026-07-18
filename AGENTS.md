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

> **Before building any new page, dialog, or block, read [`docs/design.md`](docs/design.md)** — the design
> system: color tokens, component palette, layout/motion/state patterns, and the new-page recipe.

> **Before any translation/localization work, read [`docs/translation.md`](docs/translation.md)** —
> the single source of truth for translation. Whenever you add or change localized content
> (`src/locales/<locale>/*.json` namespace files, per-language docs, UI copy, or test snapshots), you must first
> read that guide and follow the matching `docs/references/terminology-<locale>.md` if it exists.

> **Before adding, editing, reorganizing, or reviewing any contributor doc (this file or `docs/*`), read
> [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md)** — keep the doc set organized (links resolve, index
> current, no duplication) and every claim factually true against the current branch (*if you can't grep it on
> this branch, don't claim it*).

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

- **Fix root causes, not symptoms — refactor over patch.** No `as any` / `// @ts-ignore` / try-catch swallow / defensive skips to make errors disappear. When the clean fix needs restructuring, refactor rather than bolt on a patch (宁愿重构也不要打补丁). If a test fails, fix the code, not the test — unless the *test's own contract* is wrong (a stale fixture, an assertion that was incorrect from the start, or a contract that legitimately changed), in which case fix the test and say why. That's distinct from proactively deleting a test that never carried value regardless of pass/fail (tautological, duplicate, framework-only, mislabeled — see [`docs/references/develop-testing.md`](docs/references/develop-testing.md)'s "writing meaningful tests" section).
- **Confirm before you fix.** Before touching a reported bug, reproduce it and confirm it actually exists — never fix from assumption. Use the smallest reproduction that faithfully shows it: a failing unit test for pure logic/parser/utility bugs, or [`docs/verification.md`](docs/verification.md)'s scratch-script workflow when it depends on the built extension, browser APIs, or cross-context behavior. Then capture it in a failing test, then fix, **in that order** (确定 bug 存在 → 写测试 → 修复).
- **TDD/BDD first, for changes that alter observable behavior.** Write failing tests **before** implementing new or changed behavior, using BDD-style Chinese `describe`/`it` titles. The exception is genuinely behavior-preserving work — refactors, type cleanup, dead-code removal, mechanical renames — not a category of file: a config or dependency change that *does* alter behavior (a parser upgrade fixing a parsing bug, a bundler config change affecting output, a manifest/permission bump) still needs one; verify the behavior-preserving cases instead. (Runner, mocks, and how to run tests are in `docs/develop.md`.)
- **SOLID, high cohesion & low coupling — applied to the existing extension points.** `Repo<T>` for new entities, `Group.on(...)` for new messages. Inject `Group` / `IMessageQueue` / DAOs via constructor; don't `new` them inside methods. Depend on narrow interfaces (`IMessageQueue`, not `MessageQueue`).
- **Direct replacement over adapter sandwiches.** When swapping a backend/library, replace in place — no `interface Foo + LegacyImpl + NewImpl` unless both must coexist at runtime.
- **Scope discipline — stay in your lane.** Bug fix ≠ cleanup PR. Touch only the files the task requires; leave unrelated files untouched (不要动和任务不相干的文件). Don't add helpers, abstractions, validation, or backwards-compat shims you don't need today. Three similar lines beats a premature abstraction.
- **No dead code or `// removed` markers** — git remembers. Delete unused code outright.

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
- Services in `src/app/service/<context>/` — split by execution context. Constructor-injected `Group`, `IMessageQueue`, DAOs.
- DAOs in `src/app/repo/` extend `Repo<T>` (chrome.storage + cache): `ScriptDAO`, `ValueDAO`, `ResourceDAO`, `PermissionDAO`, `SubscribeDAO`.
- **GM API** split across content / SW / offscreen, each a `GMApi` (content built on `GM_Base`; SW — permission verify, cross-origin; offscreen — DOM-dependent background-script APIs); values via `ValueService`.

### Browser Extension APIs (MV3)
`chrome.userScripts` (page injection), Offscreen API (DOM in background), Declarative Net Request (intercepts `.user.js` URLs to trigger install flow).

### Key Packages

`message/` (with mocks), `filesystem/` (WebDAV, cloud drive providers, zip export — see [`docs/cloud-sync.md`](docs/cloud-sync.md)), `cloudscript/`, `eslint/` (userscript lint config — `eslint-plugin-userscripts`-based `defaultConfig` for the in-app editor), `chrome-extension-mock/`.

> The project's own custom ESLint rules live in `eslint-rules/` at the repo root (wired in `eslint.config.mjs`, **not** in `packages/eslint/`) and act as a **mechanical harness** for conventions that would otherwise rely on memory. This list is a deliberate, narrow exception to the "detailed guidance lives in the owning doc" rule above, kept here because it's short and directly useful during review. Lint enforces the *rules themselves* — code violating them fails CI — but this summary of exactly which rule covers which scope and which tests exercise it is still prose, written and maintained by hand, and can drift from `eslint.config.mjs`/`eslint-rules/` like any other doc; treat specifics below as claims to re-verify with `grep`, not settled fact:
> - `chrome-error/require-last-error-check` — enforces `chrome.runtime.lastError` handling. Not covered by `harness.test.mjs` (see below).
> - `scriptcat/no-i18n-default-value` — bans `t(key, { defaultValue })` inline fallbacks (they leak hardcoded text to every language and bypass the `i18n-usage` key check); add the key to `src/locales/<locale>/*.json` instead.
> - `scriptcat/no-raw-color-classname` (`src/pages/**/*.tsx`) — bans raw palette/hex colors in `className` (`bg-white`, `text-gray-500`, `dark:bg-gray-800`, `bg-[#fff]`); use design tokens (`bg-background`/`text-foreground`/…) so light & dark both work.
>
> Two conventions are enforced via built-in rules in `eslint.config.mjs`: `no-restricted-imports` bans `@radix-ui/react-*` single packages (use the merged `radix-ui`) and the `sonner` `toast` export (use `notify`); `no-restricted-syntax` bans `forwardRef` across `src/pages/**` (use React 19 `function` + ref-prop). `eslint-rules/harness.test.mjs` covers exactly four of these: `no-i18n-default-value`, `no-raw-color-classname`, the `radix-ui` pattern of `no-restricted-imports`, and `no-restricted-syntax` — not `require-last-error-check`, and not the `sonner` pattern of `no-restricted-imports`.
>
> Separately, type-aware rules run on `src/pages/**` (tests excluded) via `projectService` — `@typescript-eslint/no-floating-promises`, `no-misused-promises` (with `checksVoidReturn.attributes: false`, so `async` JSX handlers are allowed), and `await-thenable`, all `error` — to catch missing `await`s and promises misused as void callbacks. These need type information, so they are *not* part of `harness.test.mjs`.

## Pull Request Description Format

Detailed PR description guidance lives in [`docs/pull-request.md`](docs/pull-request.md). Start from the human-facing template, preserve its checklist, and expand the description only when the change needs more context. Do not claim human review or other evidence that did not happen.

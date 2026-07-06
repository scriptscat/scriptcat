# Repository Guidelines

This file provides guidance to AI coding agents (Claude Code, etc.) when working with code in this repository.

> **Note:** This is the single source of truth. `CLAUDE.md` only contains `@AGENTS.md` and re-imports this file — do not add content to `CLAUDE.md`; put all guidance here in `AGENTS.md`.

> **Before writing any code, read [`docs/develop.md`](docs/develop.md)** — the development spec (commands,
> project structure, coding style, UI & theme rules, testing mechanics, i18n, and the commit/PR workflow). This
> file keeps only the non-negotiable engineering principles and the architecture map; the concrete "how" lives
> in `DEVELOP.md`, and deep internals in [`docs/architecture.md`](docs/architecture.md).

> **To manually verify a feature actually works, read [`docs/verification.md`](docs/verification.md)** — drive
> the real built extension end-to-end with one-shot throwaway scratch scripts (not the committed test suite).

> **Before any translation/localization work, read [`docs/translation.md`](docs/translation.md)** —
> the single source of truth for translation. Whenever you add or change localized content
> (`src/locales/<locale>/*.json` namespace files, per-language docs, UI copy, or test snapshots), you must first
> read that guide and follow the matching `docs/annexes/terminology-<locale>.md` if it exists.

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
> patterns, new-page recipe) lives in [`docs/design.md`](docs/design.md) — read it before building any page.

## Engineering Principles

These are non-negotiable and apply to every change, regardless of what `docs/develop.md` says about mechanics.

- **Fix root causes, not symptoms — refactor over patch.** No `as any` / `// @ts-ignore` / try-catch swallow / defensive skips to make errors disappear. When the clean fix needs restructuring, refactor rather than bolt on a patch (宁愿重构也不要打补丁). If a test fails, fix the code, not the test.
- **Confirm before you fix.** Before touching a reported bug, reproduce it and confirm it actually exists — never fix from assumption. Then capture it in a failing test, then fix, **in that order** (确定 bug 存在 → 写测试 → 修复).
- **TDD/BDD first.** Write failing tests **before** implementation, using BDD-style Chinese `describe`/`it` titles. (Runner, mocks, and how to run tests are in `docs/develop.md`.)
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

`message/` (with mocks), `filesystem/` (WebDAV + local), `cloudscript/`, `eslint/` (userscript lint config — `eslint-plugin-userscripts`-based `defaultConfig` for the in-app editor), `chrome-extension-mock/`.

> The project's own custom ESLint rules live in `eslint-rules/` at the repo root (wired in `eslint.config.mjs`, **not** in `packages/eslint/`) and act as a **mechanical harness** for conventions that would otherwise rely on memory:
> - `require-last-error-check` — enforces `chrome.runtime.lastError` handling.
> - `scriptcat/no-i18n-default-value` — bans `t(key, { defaultValue })` inline fallbacks (they leak hardcoded text to every language and bypass the `i18n-usage` key check); add the key to `src/locales/<locale>/*.json` instead.
> - `scriptcat/no-raw-color-classname` (`src/pages/**/*.tsx`) — bans raw palette/hex colors in `className` (`bg-white`, `text-gray-500`, `dark:bg-gray-800`, `bg-[#fff]`); use design tokens (`bg-background`/`text-foreground`/…) so light & dark both work.
>
> Two conventions are enforced via built-in rules in `eslint.config.mjs`: `no-restricted-imports` bans `@radix-ui/react-*` single packages (use the merged `radix-ui`) and the `sonner` `toast` export (use `notify`); `no-restricted-syntax` bans `forwardRef` across `src/pages/**` (use React 19 `function` + ref-prop). All four syntax-based harness rules are covered by `eslint-rules/harness.test.mjs`.
>
> Separately, type-aware rules run on `src/pages/**` (tests excluded) via `projectService` — `@typescript-eslint/no-floating-promises`, `no-misused-promises` (with `checksVoidReturn.attributes: false`, so `async` JSX handlers are allowed), and `await-thenable`, all `error` — to catch missing `await`s and promises misused as void callbacks. These need type information, so they are *not* part of `harness.test.mjs`.

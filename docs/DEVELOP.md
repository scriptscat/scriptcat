# ScriptCat Development Guide (开发规范)

> **Read this before writing code.** [`AGENTS.md`](../AGENTS.md) holds the non-negotiable engineering
> principles (SOLID / high cohesion & low coupling, TDD/BDD-first, root-cause fixes, scope discipline) and the
> architecture quick-map — those are **not** repeated here. This file is the concrete development spec: the
> commands, structure, coding style, UI/theme rules, testing mechanics, i18n, and commit/PR workflow you follow
> while implementing. For deep internals see [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md).

## Commands

```bash
pnpm install              # install deps (preinstall enforces pnpm)
pnpm run dev              # dev build (source maps); load dist/ext as unpacked extension
pnpm run dev:noMap        # dev build w/o source maps (incognito)
pnpm run build            # production Rspack build
pnpm run pack             # package the extension (requires dist/scriptcat.pem)

pnpm test                 # all tests (Vitest)
pnpm test -- --run path/to/file.test.ts   # single test file
pnpm run coverage
pnpm run typecheck        # tsc --noEmit

pnpm run test:e2e:install # install Playwright Chromium (first run only)
pnpm run test:e2e         # Playwright (e2e/*.spec.ts, 1 worker)
pnpm run lint             # tsc --noEmit + eslint
pnpm run lint-fix         # eslint --fix (also applies Prettier via eslint-plugin-prettier)
```

No standalone `format` script — formatting is part of `lint-fix`. Husky pre-commit runs `pnpm run lint-fix` and re-stages the files it touched.

After `pnpm run dev`, load `dist/ext` as an unpacked extension. The browser hot-reloads page changes, but edits to `manifest.json`, `service_worker`, `offscreen`, or `sandbox` require reloading the extension.

## Project Structure & Module Organization

Core entry points live in `src` (`service_worker.ts`, `content.ts`, `inject.ts`, `offscreen.ts`, `sandbox.ts`). UI pages are in `src/pages`, with shared UI in `src/pages/components` and state in `src/pages/store`. Reusable domain code is in `src/pkg`; app services are in `src/app`; templates are in `src/template`; assets and translations are in `src/assets` and `src/locales`. Workspace packages live in `packages`, including browser mocks and filesystem adapters. Unit tests are colocated as `*.test.ts`/`*.test.tsx` or placed in `tests`; E2E specs are in `e2e`.

### Path Aliases

`@App/* → src/*`, `@Packages/* → packages/*`, `@Tests/* → tests/*`

## Coding Style & Naming Conventions

Use strict TypeScript, React JSX runtime, 2-space indentation, semicolons, double quotes, trailing commas where valid, and a 120-column Prettier width. Prefer aliases from `tsconfig.json`: `@App/*`, `@Packages/*`, and `@Tests/*`. ESLint requires type-only imports, allows `_`-prefixed unused variables, warns on literal JSX text, and enforces `chrome.runtime.lastError` checks. Use `pnpm run lint-fix` for mechanical fixes.

### Language Conventions

- Comments in Simplified Chinese.
- Code-review responses in Chinese.
- UI default English (global users).
- Template literals: `${i}`, not `${i.toString()}`.

## UI

React 18 + Arco Design + UnoCSS + React Router. Pages in `src/pages/`.

- Use `tw-` UnoCSS utilities; avoid inline `style={{}}`.
- **Hover/focus visuals → CSS pseudo-classes (`hover:`, `focus:`)**, not React state. State is for data/logic.
- **Theme** (light/dark/auto, persisted as `lightMode`, state in `src/pages/store/AppContext.tsx`) — every UI change must work in both themes:
  - Arco vars (`var(--color-fill-1)`, `var(--color-text-1)`, `var(--color-border-2)`) — auto-adapt.
  - UnoCSS `dark:tw-*` (configured `dark: "class"`).
  - `body[arco-theme="dark"]` selector for custom CSS overrides.
  - No hard-coded colors.

## Testing

> The **TDD/BDD-first principle** (write failing tests before implementation; fix code not tests) lives in
> [`AGENTS.md`](../AGENTS.md) → *Engineering Principles*. This section is the mechanics.

Vitest + jsdom, 500ms timeout, isolation disabled. Chrome APIs mocked via `@Packages/chrome-extension-mock` (`tests/vitest.setup.ts`). `MockMessage` available for message-system tests.

- Write failing tests **before** implementation; co-locate `*.test.ts`/`*.test.tsx` next to source (or place in `tests`).
- BDD-style Chinese `describe`/`it` titles. Use `describe.concurrent()` / `it.concurrent()` where independent.
- Single file: `pnpm test -- --run path/to/file.test.ts`.
- 避免冗余测试 — 如果调用方测试已充分覆盖，可省略被调函数的独立单测。
- Playwright tests are `*.spec.ts` files in `e2e`; they run with one worker and retain failure artifacts. Run targeted tests while iterating, then run `pnpm run lint` plus the relevant full suite before a PR.

> To **verify a change works end-to-end without growing the suite** — drive the real built extension with a
> throwaway scratch script — see [`VERIFICATION.md`](./VERIFICATION.md). That is lightweight verification, not
> the committed test suite owned by this section.

## i18n

i18next, 7 locales (`src/locales/`: en-US, zh-CN, zh-TW, ja-JP, de-DE, vi-VN, ru-RU); extension strings in `src/assets/_locales/`. ESLint `react/jsx-no-literals: warn` enforces translation. For localization, edit `src/locales/<locale>/translation.json`; new locales must also be registered in `src/locales/locales.ts`.

**Before translating, read [`docs/translation/README.md`](translation/README.md)** — the translation/localization guide (terminology rules + per-locale `terminology-<locale>.md` specs).

## Security & Configuration Tips

Do not commit secrets, local certificates, build output, coverage, Playwright reports, test results, or local `.env` changes.

## Commit & Pull Request Guidelines

Commits must be single-purpose and **start with a gitmoji emoji** — use the actual emoji character, not the `:code:` text form, for example `git commit -m "🐛 fix template matching"` or `git commit -m "✨ add script filter"`. The leading emoji drives release changelog grouping (see the `release` skill), so pick the one that matches the change:

| Emoji | Use for |
|---|---|
| ✨ | New feature |
| 🐛 / 🚑 | Bug fix / urgent hotfix |
| ⚡️ | Performance improvement |
| ♻️ | Refactor / compatibility |
| 🎨 / 💄 | Code structure / UI & styling |
| 🔒 | Security |
| ⬆️ | Dependency bump |
| ✅ | Tests |
| 📄 | Docs |
| 🔧 / 👷 / 💚 | Config / CI / CI fix |
| 🔖 | Release / version bump |

Work from a feature branch or fork and open PRs against `main`. Chinese PR titles are preferred for changelog generation.

Use `.github/pull_request_template.md` (checklist + description + screenshots). Include a problem/solution summary, linked issues (`close #123` / `fix #123`), test results, and screenshots or recordings for UI changes.

**Review policy**: review **all** modified files (including `.md`/`.json`); PR description is context only — judge from the diff. Verify every code path touched.

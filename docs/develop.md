# ScriptCat Development Guide (开发规范)

> **Read this before writing code.** [`AGENTS.md`](../AGENTS.md) holds the non-negotiable engineering
> principles (SOLID / high cohesion & low coupling, TDD/BDD-first, root-cause fixes, scope discipline) and the
> architecture quick-map — those are **not** repeated here. This file is the concrete development spec: the
> commands, structure, coding style, UI/theme rules, testing mechanics, i18n, and commit/PR workflow you follow
> while implementing. For deep internals see [`docs/architecture.md`](./architecture.md).

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
pnpm run lint-fix         # prettier --write + tsc --noEmit + eslint --fix
```

No standalone `format` script — formatting is part of `lint-fix` and runs through `prettier --write`. Husky
pre-commit runs `prettier --check` and `pnpm run typecheck` plus ESLint for staged JS/TS files, and also runs
`pnpm run test:ci` when committing on `main` or `release/*`.

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

### Comment Discipline

A comment earns its place by telling the reader something the code cannot: an invariant, a race condition, a
workaround for a specific constraint, or a reason something looks wrong but isn't. Before adding or keeping a
comment, ask whether deleting it would cost a future reader anything — if not, delete it.

- **Ephemeral review labels never; permanent issue/PR references when they aid understanding.** Never write
  review-round or audit identifiers that only made sense inside one throwaway conversation — e.g. `finding 5`,
  `round 2 fix`, `【finding N 回归】`. A future reader has no way to look these up once that conversation is gone,
  so they read as pure noise (see the invariant example below: state the "why" directly instead of pointing at
  a number nobody can resolve). A reference to a real, permanent, externally-resolvable **issue or PR number**
  is different and often exactly what a comment should do — e.g. `// regression test for #1234: 附件在会话删除
  重建后被误删` on a test added because of a real tracked bug. That reference lets a future maintainer open the
  tracker and read the full history, which is real value for understanding/review/maintenance, not noise. The
  test is the same either way: would this reference still mean something, and help the reader, with no memory
  of the conversation that added it? An issue number usually passes that test; a private review-round label
  never does. Either way, still state the invariant/behavior itself in words
  (e.g. `确认读失败不代表写入未落盘，只是无法证实`) — the reference supplements that sentence, it doesn't replace it.
- **Don't restate the next line.** A comment placed right above code must add information the code doesn't
  already convey — never narrate what a reader can already see, like `// 继续循环` above `continue;` or
  `// send done event` above `sendEvent({ type: "done" })`. If the comment would read the same after deleting
  the code below it, it isn't explaining anything.
- **Don't duplicate the enclosing doc comment.** If a function or class already has a JSDoc explaining a
  behavior, don't repeat the same explanation as an inline comment inside its body — state each fact once, in
  the place that owns it, and let the rest of the code speak for itself.
- **Keep comments attached to what they describe.** When you move, replace, or reorder code, move or delete the
  comments that described it. A comment that still describes logic that used to be there, but no longer sits
  next to what actually runs now, is more misleading than no comment at all — verify this explicitly when a
  diff moves code around, not just when it adds new code.

## UI

React 19 + shadcn/ui (Radix UI primitives, "new-york" style) + Tailwind CSS v4 + React Router. Pages in
`src/pages/`; shared primitives in `src/pages/components/ui/` (config in `components.json`).

- Compose styles with Tailwind utility classes joined via `cn()` (`src/pkg/utils/cn.ts` — clsx + tailwind-merge);
  avoid inline `style={{}}`. Build component variants with `class-variance-authority`; icons from `lucide-react`.
- **Hover/focus visuals → CSS pseudo-classes (`hover:`, `focus:`)**, not React state. State is for data/logic.
- **Theme** (light/dark/auto) — managed by `src/pages/components/theme-provider.tsx` and applied as the `.dark`
  class on `document.documentElement` (`src/pages/common.ts` sets the initial class before React mounts to avoid a
  flash). Every UI change must work in both themes:
  - Use the design-system CSS variables defined in `src/index.css` (`bg-background`, `text-foreground`,
    `border-border`, `text-primary`, `bg-primary-background`, `text-muted-foreground`, …) — they auto-adapt per theme.
  - Use Tailwind's `dark:` variant for dark-only overrides (`@custom-variant dark` in `src/index.css`).
  - No hard-coded colors.
- **Design system** — the full color-token reference (light/dark values), component palette, layout &
  responsive patterns, motion guidance, state patterns, and a new-page recipe live in
  [`DESIGN.md`](./design.md). Read it before building a new page, dialog, or block.

## Testing

This project uses Vitest for unit tests and Playwright for end-to-end tests.

> Mechanics, meaningful-test guidance, and Vitest performance hygiene live in [testing.md](./references/develop-testing.md). To verify a change end-to-end without growing the suite, see [verification.md](./verification.md).

## i18n

i18next, 8 locales (`src/locales/`: en-US, zh-CN, zh-TW, ja-JP, de-DE, vi-VN, ru-RU, tr-TR); extension strings in `src/assets/_locales/`. ESLint `react/jsx-no-literals: warn` enforces translation. Each locale is split by namespace into multiple `*.json` files (`common.json`, `popup.json`, `script.json`, …), re-exported via the locale's `index.ts` and merged in `src/locales/locales.ts`. `defaultNS` is `common`; keys in any other namespace need the `ns:` prefix (e.g. `t("script:tags")`). For localization, edit the relevant namespace `*.json` under `src/locales/<locale>/`; new locales must also be registered in `src/locales/locales.ts`.

**Before translating, read [`docs/translation.md`](./translation.md)** — the translation/localization guide (terminology rules + per-locale `terminology-<locale>.md` specs).

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

Use `.github/pull_request_template.md` as the starting point. It is intentionally lightweight for human-authored PRs; agents should preserve its checklist and expand `Description / 描述` only when useful. The detailed structure is defined in [`pull-request.md`](./pull-request.md). Keep exact commands and results in `验证`, describe UI evidence when the change is visual, and do not claim checks or evidence that did not happen.

**Review policy**: review **all** modified files (including `.md`/`.json`); PR description is context only — judge from the diff. Verify every code path touched.

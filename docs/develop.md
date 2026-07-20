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

### Build profiles & MCP gate

The MCP bridge (`src/app/service/service_worker/mcp/`, `packages/native-messaging-host/`) is gated
by a build-time flag on top of the usual dev/prod split, because `nativeMessaging` must never reach
a store-submitted artifact:

```bash
SC_ENABLE_MCP=true pnpm dev           # dev build with the MCP bridge compiled in
pnpm run pack:dev                     # developer-profile package with MCP enabled (SC_PACK_PROFILE=developer)
```

`SC_ENABLE_MCP` (default off) is the build-time gate — when off, `rspack.config.ts` swaps
`McpSection.tsx` for a stub via `NormalModuleReplacementPlugin` and omits the `mcp_confirm` entry
entirely, so the code never lands in the bundle at all (not just dead-code-eliminated). At runtime
there is a second, independent gate: `mcp_enabled` (`SystemConfig`, device-local, off by default) —
the bridge only connects to the native host once both gates are on. `scripts/pack.js`'s
`--profile <store-stable|store-beta|developer>` flag (env `SC_PACK_PROFILE`) asserts store profiles
never contain `nativeMessaging` or MCP UI strings in the built output, failing the build if they do.
See [`docs/store-review/mcp.md`](./store-review/mcp.md) for the full store-review rationale and
[`packages/native-messaging-host/PROTOCOL.md`](../packages/native-messaging-host/PROTOCOL.md) /
[`THREAT-MODEL.md`](../packages/native-messaging-host/THREAT-MODEL.md) for the protocol and security
design.

## Project Structure & Module Organization

Core entry points live in `src` (`service_worker.ts`, `content.ts`, `inject.ts`, `offscreen.ts`, `sandbox.ts`). UI pages are in `src/pages`, with shared UI in `src/pages/components` and state in `src/pages/store`. Reusable domain code is in `src/pkg`; app services are in `src/app`; templates are in `src/template`; assets and translations are in `src/assets` and `src/locales`. Workspace packages live in `packages`, including browser mocks and filesystem adapters. Unit tests are colocated as `*.test.ts`/`*.test.tsx` or placed in `tests`; E2E specs are in `e2e`.

### Path Aliases

`@App/* → src/*`, `@Packages/* → packages/*`, `@Tests/* → tests/*`

## Coding Style & Naming Conventions

Use strict TypeScript, React JSX runtime, 2-space indentation, semicolons, double quotes, trailing commas where valid, and a 120-column Prettier width. Prefer aliases from `tsconfig.json`: `@App/*`, `@Packages/*`, and `@Tests/*`. ESLint requires type-only imports, allows `_`-prefixed unused variables, errors on literal JSX text, and enforces `chrome.runtime.lastError` checks. Use `pnpm run lint-fix` for mechanical fixes.

### ESLint custom rules

The project's own custom rules live in `eslint-rules/` at the repo root (wired in `eslint.config.mjs`, **not**
`packages/eslint/`, which is the unrelated userscript lint config for the in-app editor) and act as a mechanical
harness for conventions that would otherwise rely on memory. Lint enforces the rules themselves — code violating
them fails CI — but this list of exactly which rule covers which scope, and which are covered by
`eslint-rules/harness.test.mjs`, is hand-maintained prose; re-verify specifics with `grep` rather than trusting
it as settled fact:

- `chrome-error/require-last-error-check` — enforces `chrome.runtime.lastError` handling. Not covered by
  `harness.test.mjs`.
- `scriptcat/no-i18n-default-value` — bans `t(key, { defaultValue })` inline fallbacks (they leak hardcoded text
  to every language and bypass the `i18n-usage` key check); add the key to `src/locales/<locale>/*.json` instead.
- `scriptcat/no-raw-color-classname` (`src/pages/**/*.tsx`) — bans raw palette/hex colors in `className`
  (`bg-white`, `text-gray-500`, `dark:bg-gray-800`, `bg-[#fff]`); use design tokens (`bg-background`/
  `text-foreground`/…) so light & dark both work.

Two conventions are enforced via built-in rules in `eslint.config.mjs`: `no-restricted-imports` bans
`@radix-ui/react-*` single packages (use the merged `radix-ui`) and the `sonner` `toast` export (use `notify`);
`no-restricted-syntax` bans `forwardRef` across `src/pages/**` (use React 19 `function` + ref-prop).
`eslint-rules/harness.test.mjs` covers exactly four of these: `no-i18n-default-value`, `no-raw-color-classname`,
the `radix-ui` pattern of `no-restricted-imports`, and `no-restricted-syntax` — not `require-last-error-check`,
and not the `sonner` pattern of `no-restricted-imports`.

`src/pages/components/ui/toast.ts` has an override that turns `no-restricted-imports` **entirely off** for that
one file — not just the `sonner` half of it. Only the `sonner` exception is intentional: this is the one place
in `src/pages/**` allowed to import `sonner`'s `toast` directly (it's the wrapper `notify` is built on). The
file happens to also lose the `@radix-ui/react-*` restriction as a side effect of the rule being off wholesale
— it does not currently import from `@radix-ui/react-*` (or `radix-ui`) at all, and the merged-package
convention still applies to it in spirit; `eslint-rules/harness.test.mjs`'s Radix case only exercises
`dialog.tsx`, so a Radix-restricted import landing in `toast.ts` would not be caught by lint today. Don't read
this override as "Radix single-package imports are permitted here" — treat it as a lint gap this file
currently doesn't exploit, and prefer narrowing the override to the `sonner` import specifically (or adding a
`toast.ts` case to the harness) over relying on the blanket `off`. Any other file still gets both restrictions.

Separately, type-aware rules run on `src/pages/**` (tests excluded) via `projectService` —
`@typescript-eslint/no-floating-promises`, `no-misused-promises` (with `checksVoidReturn.attributes: false`, so
`async` JSX handlers are allowed), and `await-thenable`, all `error` — to catch missing `await`s and promises
misused as void callbacks. These need type information, so they are *not* part of `harness.test.mjs`.

### Language Conventions

- Comments in Simplified Chinese.
- Code-review responses in Chinese.
- UI default English (global users).
- Template literals: `${i}`, not `${i.toString()}`.

### Comment Discipline

A comment must tell the reader something the code cannot: an invariant, a race condition, a workaround for a specific constraint, or why something looks wrong but is correct. If deleting it would cost a future reader nothing, delete it.

- **No ephemeral review labels; permanent issue/PR references are allowed when useful.** Never write review-round or audit identifiers that only made sense inside a now-gone conversation, such as `finding 5`, `round 2 fix`, or `【finding N 回归】`. A permanent issue or PR reference that is accessible to the intended maintainers can be useful, for example: `// regression test for #1234: 附件在会话删除重建后被误删`. Apply the same test to every reference: will it still help a future reader who has no memory of the conversation that added it? A relevant, accessible issue or PR usually passes; a private review label never does. In all cases, state the invariant or behavior in words first, such as `确认读失败不代表写入未落盘，只是无法证实`. The reference supplements the explanation; it does not replace it.
- **Do not restate the next line.** A comment above code must add information the code does not already convey. Do not write `// 继续循环` above `continue;` or `// send done event` above `sendEvent({ type: "done" })`. If the comment adds no meaning beyond the code below it, delete it.
- **Do not duplicate enclosing documentation.** If a function, class, or module doc comment already explains a behavior, do not repeat the same fact inside the implementation. State each fact once, in the place that owns it.
- **Keep comments attached to the code they describe.** When code is moved, replaced, reordered, or deleted, move, update, or delete its comments as well. A comment that no longer describes what actually runs is worse than no comment. Check this explicitly whenever a diff changes existing code, not only when it adds new code.

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
  [`design.md`](./design.md). Read it before building or modifying any page, dialog, or block.

## Testing

This project uses Vitest for unit tests and Playwright for end-to-end tests.

> Mechanics, meaningful-test guidance, and Vitest performance hygiene live in [testing.md](./references/develop-testing.md). To verify a change end-to-end without growing the suite, see [verification.md](./verification.md).

## i18n

i18next; extension strings in `src/assets/_locales/`. The current locale list is owned by [`docs/translation.md`](./translation.md). ESLint `react/jsx-no-literals: error` enforces translation. Each locale is split by namespace into multiple `*.json` files (`common.json`, `popup.json`, `script.json`, …), re-exported via the locale's `index.ts` and merged in `src/locales/locales.ts`. `defaultNS` is `common`; keys in any other namespace need the `ns:` prefix (e.g. `t("script:tags")`). For localization, edit the relevant namespace `*.json` under `src/locales/<locale>/`; new locales must also be registered in `src/locales/locales.ts`.

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

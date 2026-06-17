# Documentation Maintenance & Fact-Check Guide

> **Read this before adding, editing, reorganizing, or reviewing any contributor doc** (`AGENTS.md`,
> `docs/*`). It has two jobs: keep the doc set **organized** (links resolve, index current, no duplication)
> and keep every claim **factually true against the current branch**.

## Why this exists

The contributor docs describe a living codebase, so two failure modes recur:

- **Stale facts** — a class is renamed, a count changes, a file moves; the doc keeps the old value. Real
  examples caught in review: docs named the offscreen GM API `OffscreenGMApi` (no such class — it is `GMApi`),
  and claimed "8 locales" when there were 7.
- **Branch leakage** — work that only lives on a feature branch gets documented as if it ships on `main`.
  Example: a subsystem committed only on a feature branch (not on `main`) gets written into `main`'s
  quick-map, misleading readers into expecting code that is not there.

**Rule of thumb: if you can't `git grep` it in the committed code on this branch, don't claim it.** Verify with
git-aware commands (`git grep`, `git ls-files`, `git ls-tree`) — never a plain `rg`/`ls`, which also match
**untracked** files in your working tree, so feature-branch code sitting in your checkout but not committed to
`main` will masquerade as shipped (this is exactly how a feature-branch-only subsystem sneaks into a `main` doc).
Aspirational / feature-branch content belongs in that branch's docs, or is clearly marked as planned.

## Doc set & responsibilities (don't duplicate — cross-link)

| Doc | Owns |
| --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | Engineering principles + architecture quick-map. Single source of truth; `CLAUDE.md` only `@import`s it. |
| [`DEVELOP.md`](./DEVELOP.md) | The concrete "how": commands, structure, style, testing, i18n, commit/PR. |
| [`DESIGN.md`](./DESIGN.md) | The design system: light/dark color tokens, theme mechanism, shadcn component palette, layout & responsive patterns, motion, state patterns, new-page recipe. |
| [`VERIFICATION.md`](./VERIFICATION.md) | Lightweight end-to-end functional verification — throwaway scratch scripts driving the real built extension. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Deep internals: process model, message passing, service/data layers, GM API, execution, build. |
| [`translation/README.md`](./translation/README.md) | Translation / localization single source of truth. |
| [`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md) | This guide: doc-set organization rules + fact-check / anti-drift discipline. |
| [`README.md`](./README.md) | The index that points to all of the above. |

When you move a fact, move it to the doc that **owns** it and cross-link — never copy the same fact into two
places, or they drift apart.

## Checklist 1 — Organization (every doc change)

- [ ] Added / renamed / removed a doc → update the [`docs/README.md`](./README.md) index, the *Doc set &
      responsibilities* table above, **and** every reference in `AGENTS.md` / `DEVELOP.md`.
- [ ] All relative links resolve (run the link check in *One-shot verification* below).
- [ ] No content that only exists on a feature branch is presented as current `main` — removed, or explicitly
      marked "planned (branch `X`)".
- [ ] No fact is duplicated across docs; the owning doc holds it, the others link to it.

## Checklist 2 — Fact-check (when a doc states something concrete)

Verify **every** concrete claim against the code. Common claim types and how to check them:

| Claim in docs | Verify with |
| --- | --- |
| Entry-point / context files exist | `git ls-files src/service_worker.ts src/content.ts src/inject.ts src/offscreen.ts src/sandbox.ts` |
| Workspace packages exist | `git ls-tree --name-only HEAD packages/` |
| A class / identifier exists **by that exact name** | `git grep "class <Name>\b" -- src packages` — a renamed class is the #1 source of drift |
| DAOs extend `Repo<T>` | `git grep "class \w*DAO" -- src/app/repo` |
| Service file tree (ARCHITECTURE §4) | `git ls-tree --name-only -d HEAD src/app/service/`, then confirm each listed file |
| A constructor / function signature | open the file and compare param-by-param |
| A count ("N locales", "N tools", "5 contexts") | enumerate the canonical source, e.g. `git ls-tree --name-only -d HEAD src/locales/` **and** `src/locales/locales.ts` |
| Custom ESLint rule / config | `eslint.config.mjs` (project rules) **vs** `packages/eslint/linter-config.ts` (userscript lint config) — these are different things |
| Path aliases | `git grep "@App/\*\|@Packages/\*\|@Tests/\*" -- tsconfig.json` |

Three traps worth calling out (all bit us before):

- **Working tree ≠ committed.** A plain `rg`/`ls` also matches **untracked** files in your checkout, so
  feature-branch code you have locally but haven't committed to `main` reads as if it ships — the exact
  branch-leakage failure mode above. Verify with `git grep` / `git ls-files` / `git ls-tree` so only committed
  code counts.
- **Same name, different thing.** `packages/eslint/` is the *userscript* lint config
  (`eslint-plugin-userscripts`-based `defaultConfig` used by the in-app editor). The project's *own* custom rule
  `require-last-error-check` lives in `eslint-rules/` at the repo root and is wired in `eslint.config.mjs`. Don't
  conflate the two.
- **Counts drift silently.** Whenever a doc states a number, enumerate it from the canonical list — don't trust
  the prose, and don't trust your memory.

## One-shot verification

Git-aware on purpose: every check reads **committed** code (`git ls-files` / `git ls-tree` / `git grep`), so
untracked feature-branch files in your checkout don't report as present. Run from the repo root and eyeball the
output against the docs:

```bash
echo "== entry points =="
for f in src/service_worker.ts src/content.ts src/inject.ts src/offscreen.ts src/sandbox.ts; do
  git ls-files --error-unmatch "$f" >/dev/null 2>&1 && echo "ok   $f" || echo "MISSING/untracked $f"
done
echo "== packages =="; git ls-tree --name-only HEAD packages/
echo "== service contexts =="; git ls-tree --name-only -d HEAD src/app/service/
echo "== DAOs =="; git grep -n "class \w*DAO" -- src/app/repo
echo "== locales (count + dirs) =="; git ls-tree --name-only -d HEAD src/locales/ | wc -l; git ls-tree --name-only -d HEAD src/locales/
echo "== path aliases =="; git grep -n "@App/\*\|@Packages/\*\|@Tests/\*" -- tsconfig.json
echo "== eslint (project rule in eslint-rules/ vs userscript config in packages/eslint/ — don't conflate) =="
git ls-files eslint-rules/; git grep -l "require-last-error-check" -- eslint.config.mjs; git ls-files packages/eslint/linter-config.ts
```

Link integrity — confirm every relative markdown link in the core docs resolves:

```bash
for doc in AGENTS.md docs/README.md docs/DEVELOP.md docs/DESIGN.md docs/VERIFICATION.md docs/ARCHITECTURE.md docs/DOC-MAINTENANCE.md docs/translation/README.md; do
  grep -oE '\]\(([^)]+)\)' "$doc" | sed -E 's/^\]\(|\)$//g' | grep -vE '^https?:|^#' | while read -r link; do
    target="$(dirname "$doc")/${link%%#*}"
    [ -e "$target" ] && echo "ok     $doc → $link" || echo "BROKEN $doc → $link"
  done
done
```

## When you find a discrepancy

Fix the **doc** to match the code — the code on this branch is the source of truth. The exception: if the code
itself is wrong (a real bug), fix the code and say so in the PR. Either way, never silently drop a check you
couldn't satisfy — surface it in the PR description so a reviewer can confirm.

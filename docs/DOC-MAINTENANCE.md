# Documentation Maintenance & Fact-Check Guide

> **Read this before adding, editing, reorganizing, or reviewing any tracked agent/contributor Markdown** —
> `AGENTS.md`, everything under `docs/*`, `.github/*.md`, and every package-local or source-local `README.md`.
> Don't work off a fixed file list: run `git ls-files '*.md'` to discover the current set, including hidden
> `.github` docs and READMEs that live next to source (e.g. `src/locales/README.md`,
> `packages/*/README.md`). This guide has three jobs: keep the doc set **organized** (links resolve, index
> current, no duplication), keep every claim **factually true against the current branch**, and keep
> **cross-document policy consistent** (no two docs giving conflicting rules for the same situation).

## Why this exists

The contributor docs describe a living codebase, so several failure modes recur:

- **Stale facts** — a class is renamed, a count changes, a file moves; the doc keeps the old value. Real
  examples caught in review: docs named the offscreen GM API `OffscreenGMApi` (no such class — it is `GMApi`),
  and claimed "8 locales" when there were 7.
- **Branch leakage** — work that only lives on a feature branch gets documented as if it ships on `main`.
  Example: a subsystem committed only on a feature branch (not on `main`) gets written into `main`'s
  quick-map, misleading readers into expecting code that is not there.
- **Policy conflict** — two docs state the same rule with different conditions (e.g. one says a TDD failing
  test is unconditional, another defines an exception for it). An agent that reads only one of them then
  follows a rule the other doc already narrowed or overturned.
- **Stale-after-resolution** — code and docs change in the same PR, or a conflict gets resolved during rebase,
  and the fact-check was only ever run against an old `HEAD`. The claim looks verified but was never checked
  against the tree that actually ships.

**Rule of thumb: if you can't `git grep` it in the committed code on this branch, don't claim it.** Verify with
git-aware commands (`git grep`, `git ls-files`, `git ls-tree`) — never a plain `rg`/`ls`, which also match
**untracked** files in your working tree, so feature-branch code sitting in your checkout but not committed to
`main` will masquerade as shipped (this is exactly how a feature-branch-only subsystem sneaks into a `main` doc).
Aspirational / feature-branch content belongs in that branch's docs, or is clearly marked as planned.

## Baseline tree, working diff, proposed final tree

A fact-check against a single snapshot isn't enough when code and docs change together:

- **Baseline tree** — the committed state you started from (`git rev-parse HEAD`).
- **Working diff** — your uncommitted changes, both code and docs, on top of the baseline.
- **Proposed final tree** — what will actually exist after your change lands, including any rebase or
  conflict resolution.

If code and docs are changing in the same PR, checking only the old `HEAD` misses facts the working diff is
about to introduce or remove. After a rebase, merge, or conflict resolution, re-run the fact-check against the
**resolved final tree**, not your last pre-conflict result — conflict resolution can silently reintroduce a
stale fact or drop a doc update.

## Policy-consistency check

Beyond individual facts, check that a rule stated in one doc doesn't contradict the same rule stated
elsewhere. For every rule you touch or that a fact-check reveals, identify: **owner** (which doc holds the
canonical version), **trigger** (when it applies), **action** (what to do), **exception** (documented
carve-outs), **fallback** (what to do when the exception applies), **evidence** (how compliance is checked),
**stop condition** (when the rule no longer applies). Search for absolute language that tends to hide an
undocumented exception or a stale blanket rule:

```bash
git grep -n -Ei 'always|never|all |must|必须|绝不|所有' -- AGENTS.md .github/*.md docs/*.md docs/references/*.md
git grep -n -Ei 'TDD|failing test|committed test|fix the code|自动化.*不可' -- '*.md'
```

Every hit is a review-queue entry, not an automatic rewrite — confirm whether the absolute wording is actually
correct (some are intentional non-negotiables) before loosening it, and confirm a downstream doc's exception
survives when you touch the upstream rule it narrows.

## Lint / config documentation depth

When a doc describes an ESLint rule, tsconfig setting, or similar config-driven behavior, record the
**files/ignores/overrides that produce the effective result**, not just the rule name — a rule can be globally
`"error"` and then `"off"` for a specific file glob, and only listing the rule name hides that. Verify against
`eslint.config.mjs` (or the relevant config file) directly; don't infer scope from the rule name alone.

## Batch edits: verify small, then scale

For a mechanical, repeatable change across many files (heading rename, link format, boilerplate insert),
validate the change on one representative file or a small batch first and check the diff before scaling up.
This is advice for genuinely mechanical batch tooling — it is not a mandatory process for every small,
one-off edit.

## Privacy / sanitization gate

Before committing or opening a PR, check the final diff and PR body for local absolute paths, home-directory
shortcuts, `file://` URIs, temp-directory paths, private attachment names, and other identifying information
that shouldn't leave the contributor's machine. This check needs human judgment — this guide's own examples
of sanitization patterns can otherwise look like matches — so don't rely on a blind automated strip.

## Doc set & responsibilities (don't duplicate — cross-link)

| Doc | Owns |
| --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | Engineering principles + architecture quick-map. Single source of truth; `CLAUDE.md` only `@import`s it. |
| [`develop.md`](./develop.md) | The concrete "how": commands, structure, style, i18n, commit/PR; testing mechanics split to [`references/develop-testing.md`](./references/develop-testing.md). |
| [`pull-request.md`](./pull-request.md) | Detailed PR description structure and guidance for agents and contributors; the human-facing template remains lightweight. |
| [`design.md`](./design.md) | The design system: theme mechanism, shadcn component selection, new-page recipe; tokens split to [`references/design-tokens.md`](./references/design-tokens.md), component palette to [`references/design-components.md`](./references/design-components.md), layout/motion/state/a11y patterns to [`references/design-patterns.md`](./references/design-patterns.md). |
| [`verification.md`](./verification.md) | Lightweight end-to-end functional verification — throwaway scratch scripts driving the real built extension; report template split to [`references/verification-report-template.md`](./references/verification-report-template.md), debugging FAQ to [`references/verification-debugging.md`](./references/verification-debugging.md). |
| [`architecture.md`](./architecture.md) | Deep internals: process model, message passing; subsystem deep-dives split to [`references/architecture-services.md`](./references/architecture-services.md), [`references/architecture-data.md`](./references/architecture-data.md), [`references/architecture-gm-api.md`](./references/architecture-gm-api.md), [`references/architecture-execution.md`](./references/architecture-execution.md), [`references/architecture-build.md`](./references/architecture-build.md), [`references/architecture-agent.md`](./references/architecture-agent.md). |
| [`specs/csp-rule-management.md`](./specs/csp-rule-management.md) | Planned CSP rule-management product, UX, technical, acceptance, and decision contract; implementation mechanics stay in `develop.md`. |
| [`cloud-sync.md`](./cloud-sync.md) | Cloud sync internals: sync files, digest/status semantics, provider differences, error classification, retry policy. |
| [`translation.md`](./translation.md) | Translation / localization single source of truth. |
| [`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md) | This guide: doc-set organization rules, fact-check / anti-drift discipline, and policy-consistency checks — for every tracked agent/contributor Markdown file, not just `AGENTS.md` + `docs/*`. |
| [`README.md`](./README.md) | The index that points to all of the above. |
| `.github/copilot-instructions.md` | Copilot-specific entry point and any genuine tool-specific differences; shared facts (architecture, commands, testing, design, translation, PR mechanics) route to the owning doc above instead of being copied. |
| Package-local `README.md` (e.g. `packages/message/README.md`, `packages/filesystem/README.md`) | That package's purpose, boundaries, entry points, and local gotchas — not a duplicate of repo-wide architecture or coding policy. |

When you move a fact, move it to the doc that **owns** it and cross-link — never copy the same fact into two
places, or they drift apart. To discover the current full set instead of relying on this table alone, run
`git ls-files '*.md'`.

## Checklist 1 — Organization (every doc change)

- [ ] Added / renamed / removed a doc → update the [`docs/README.md`](./README.md) index, the *Doc set &
      responsibilities* table above, **and** every reference in `AGENTS.md` / `develop.md`.
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
| Service file tree (references/architecture-services.md) | `git ls-tree --name-only -d HEAD src/app/service/`, then confirm each listed file |
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

Link integrity — confirm every relative markdown link resolves, across **every tracked Markdown file**
(`git ls-files '*.md'`), not a fixed list that silently misses new files (`.github/*.md`, package/source
READMEs, a newly added `docs/references/*.md`):

```bash
git ls-files '*.md' | while IFS= read -r doc; do
  # the sed pipeline drops fenced code blocks (``` and ~~~) and inline code spans first, so illustrative
  # sample links inside ```md/~~~md snippets or `single-backtick` text (e.g.
  # references/verification-report-template.md's screenshot/resource examples, verification.md's
  # "Evidence location" spans) aren't false-flagged as broken
  sed '/^```/,/^```/d; /^~~~/,/^~~~/d' "$doc" | sed -E 's/`[^`]*`//g' | grep -oE '\]\(([^)]+)\)' | sed -E 's/^\]\(|\)$//g' | grep -vE '^(https?:|mailto:|#|app:)' | while IFS= read -r link; do
    target="$(dirname "$doc")/${link%%#*}"
    [ -e "$target" ] && echo "ok     $doc → $link" || echo "BROKEN $doc → $link"
  done
done
```

Link integrity is a **best-effort signal**, not a proof of correctness: the shell pipeline above skips fenced
and inline code, but it doesn't resolve reference-style links, complex Markdown link destinations, or GitHub's
full heading-anchor slug rules. A clean run means no missing link *targets* were found — it does not mean every
anchor fragment or every link's intent has been verified. Check changed fragment links by hand (or by rendering
the page), especially around CJK text, punctuation, and duplicate-heading auto-suffixes (`#foo-1`). Only add an
anchor when the link text explicitly points at one particular section; a link meant to reference the whole
document should stay a file-level link without a fragment.

Duplicate headings (exact or near-duplicate H1/H2 text across files) are a **review queue item, not an
auto-fix**: check inbound links and whether the duplication is actually confusing before renaming or merging
a heading — an external deep link into that heading breaks if you rename it without a compatibility anchor.

## When you find a discrepancy

Fix the **doc** to match the code — the code on this branch is the source of truth. The exception: if the code
itself is wrong (a real bug), fix the code and say so in the PR. Either way, never silently drop a check you
couldn't satisfy — surface it in the PR description so a reviewer can confirm.

## Honest completion claims

Only say "full scan", "verified", or "all fixed" when the scope and evidence actually cover that claim — i.e.
you ran the check against every file the claim implies, on the proposed final tree. A more accurate summary is
usually narrower: which docs got a fact/policy audit and what evidence backs it, versus which docs (e.g.
localized/user-facing/security docs) only got a structural check or were intentionally left unchanged.

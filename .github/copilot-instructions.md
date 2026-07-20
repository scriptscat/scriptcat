# ScriptCat — Copilot Instructions

> **This file only holds Copilot-specific behavior and a router.** Architecture, coding conventions, commands,
> and testing mechanics are owned by [`../AGENTS.md`](../AGENTS.md) and the docs it routes to
> (`docs/develop.md`, `docs/architecture.md`, `docs/references/*`, `docs/verification.md`, `docs/design.md`,
> `docs/translation.md`). Read those before reviewing or writing code — don't rely on a second, separately
> maintained copy of them here; when this file and one of those docs disagree, the owning doc wins and this
> file should be corrected to match.

## Code Review

- Respond in Chinese when performing a code review (用中文回复代码审查意见).
- Conduct a **comprehensive and independent review** of the entire PR every time:
  - **Full review every time** — review all modified files regardless of previous reviews or comments; treat
    re-reviews as new, not relying on prior review state.
  - **No skipping files** — examine every changed file regardless of type (`.md`, `.json`, `.yml`, `.toml`,
    `.ts`, `.js`, `.py`, `.html`, `.css`, `.tsx`, `.vue`, `.sh`, etc.).
  - **PR descriptions/commit messages/discussion are reference context only** — the review's conclusions must
    be grounded in the actual code and file changes, inferring intent from the diff itself.
  - **Independent verification** — don't assume an unchanged file or a previously reviewed section is safe;
    verify code paths potentially affected by the current changes.

## Minimal fallback (only if this surface can't reliably follow the link above)

ScriptCat is a Manifest V3 browser extension (TypeScript + React 19 + Rspack, pnpm) that runs
Tampermonkey-compatible userscripts across five isolated contexts — Service Worker, Content, Inject, Offscreen,
Sandbox — communicating over `packages/message`. If you cannot load `AGENTS.md`, treat any architecture,
persistence-pattern, or service-shape claim you're tempted to state here as unverified, and prefer asking the
reviewer to confirm against `AGENTS.md` / `docs/architecture.md` over inventing a summary — this file is not
the source of truth for those facts and must not re-accumulate a parallel copy of them.

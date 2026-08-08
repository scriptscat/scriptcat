# ScriptCat — Copilot Instructions

> **Copilot-specific delta only.** Shared engineering principles and the architecture quick-map are owned by
> [`../AGENTS.md`](../AGENTS.md); mechanics are owned by the docs it routes to. Read those sources before
> reviewing or writing code. If this file disagrees with an owning document, the owning document wins and this
> file should be corrected rather than expanded into a second source of truth.

## Code Review

- Respond in Chinese when performing a code review (用中文回复代码审查意见).
- Perform a **comprehensive, independent review of the entire current diff** every time:
  - inspect every changed file, regardless of extension or whether it was reviewed previously;
  - use PR descriptions, commit messages, and discussion only as context — conclusions must be grounded in the
    current repository state and the actual diff;
  - re-check affected code paths instead of assuming unchanged or previously reviewed code is safe.
- Use the architecture map and routed subsystem docs from `AGENTS.md` when a finding depends on repository-specific
  behavior. Do not recreate those facts here from memory.

### Finding gate

For PR-review findings, focus on defects introduced by the current diff or made newly reachable by it. A
pre-existing defect discovered while tracing an affected code path may still be reported only when it has material
correctness, security, data-loss, reliability, or comparably significant user/developer impact. Label it clearly as
**pre-existing** so the reviewer can separate regression risk from nearby debt; otherwise keep the review scoped to
the change.

For any finding you report, apply every relevant check below:

1. **Relation to the change:** state whether the defect is introduced/newly reachable or pre-existing in an affected
   path; do not imply the PR caused a defect when it did not.
2. **Concrete trigger or proof path:** state the input/state/browser/context that reaches it, **or** a demonstrable
   code path / invariant violation when runtime reproduction is not the appropriate proof (for example a race,
   lifecycle violation, resource leak, or security-boundary error).
3. **Concrete impact:** explain the user/developer-visible consequence, not just a stylistic preference or
   hypothetical concern.
4. **Located:** point to the smallest useful changed location when the finding is PR-introduced. For a pre-existing
   finding, point to the smallest useful affected location when that location is represented in the diff; if the
   relevant location is outside the diff, report it in the review summary instead of attaching it to an unrelated
   changed line.
5. **Distinct:** do not create a second finding for the same root cause unless the separate location needs an
   independent fix.
6. **Actionable:** make clear which behavior or contract must be restored without prescribing an unrelated refactor.

If a repository-specific assumption is needed to support a finding and it cannot be verified from the owning
docs/code, **do not submit it as a finding**. If the uncertainty is still useful to the reviewer, put it in the review
summary as an explicit question or unverified assumption and identify the canonical source that would resolve it.

## Minimal fallback when linked instructions are unavailable

Do **not** invent or retain a parallel architecture/coding summary here. Limit work to facts that are directly
verifiable from the current diff and files, avoid structural recommendations that depend on unavailable
repository policy, and explicitly state which canonical instruction source could not be loaded.

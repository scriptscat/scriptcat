# Pull Request Description Guide

This guide owns the **PR body**: structure, evidence, and reviewer-handoff expectations. It does not own
commit message or PR title rules — those live in
[develop.md § Commit & Pull Request Guidelines](./develop.md#commit--pull-request-guidelines) (gitmoji prefix,
single-purpose commits). Start from the human-facing template at
[`../.github/pull_request_template.md`](../.github/pull_request_template.md) — it intentionally remains
lightweight. Preserve its `Checklist / 检查清单` section, and expand its `Description / 描述` section only when
the change needs more context.

Whatever headings you use, this guide's checklist and evidence expectations still apply — `## Summary` /
`## Test plan` headings don't exempt a PR from them. Use the structure below; its sections are
recommended, not all mandatory (see below for which ones).

## Recommended structure

For a normal feature or behavior change, use the following sections when they are meaningful:

```markdown
## Checklist / 检查清单

- [ ] Fixes ... / 已修复或实现 ...
- [ ] Code reviewed by human / 代码通过人工检查
- [ ] Changes tested / 已完成测试

## 背景

<!-- What problem, compatibility gap, or maintenance need does this solve? -->

## 本次改动

<!-- Summarize user-visible behavior and important implementation changes. -->

## 实现考虑

<!-- For non-trivial changes: explain key design decisions, invariants, races, or compatibility choices. -->

## 已知限制

<!-- Record explicit scope boundaries, unsupported cases, and follow-up work. -->

## 建议审查重点

<!-- List concrete behaviors or risks reviewers should verify. -->

## 参考

<!-- Specs, documentation, code locations, or external API references. -->

## 关联

<!-- Related issues or PRs, using links or closing keywords when applicable. -->

## 验证

<!-- Exact commands and concise results. Include known warnings or explain why a check was not run. -->
```

`Checklist`、`背景`、`本次改动` and `验证` are the recommended core for a normal feature or behavior change, not mandatory headings for every PR. Add `实现考虑` for meaningful design or concurrency implications; add `已知限制` and `建议审查重点` when reviewers need explicit boundaries or risk areas. `参考` and `关联` are optional.

Small documentation, dependency, or CI changes may use a shorter description and omit sections that do not apply, but must still explain what changed and what was checked. For visual changes, retain the template's screenshot section and provide the relevant evidence. Never claim a test, review, screenshot, or recording that did not happen. Leave `Code reviewed by human` unchecked unless a human has actually reviewed the PR — the same applies to any other checklist item: leave it unchecked (without rewording it) whether the work wasn't done or doesn't apply. If an item doesn't apply to this PR, add a brief `N/A — <why>` note below the checklist, so reviewers can tell "not applicable" from "not done" — an unchecked box alone doesn't distinguish the two.

The brief `N/A` note above is only for an inapplicable PR checklist item. Test dimensions remain applicability-gated by [the testing guide](./references/develop-testing.md) and are omitted when they do not apply; do not add a formal applicability table or proof packet to a PR.

## Decision, evidence, and readiness

For a material behavior, configuration, security, performance, compatibility, persistence, migration, release, or refactor change, write enough context for a reviewer to reconstruct:

1. the problem or requirement;
2. the affected scope and consequence;
3. the evidence that the premise is real;
4. why action is justified;
5. the selected remedy and material trade-off;
6. acceptance evidence; and
7. the remaining limitation or risk.

Keep this chain proportional. A confirmed one-line correction or a small documentation fix needs only the material parts; a non-trivial design choice should explain why doing nothing or a plausible smaller alternative was not selected and what would reopen the decision.

Keep these roles separate:

- maintainer direction authorizes execution within the requested scope;
- an issue, PR description, or discussion supplies stated intent and scope context;
- source inspection, tests, browser runs, and integrations provide observations;
- a specification, compatibility contract, security policy, accepted test oracle, or maintainer decision owns normative correctness.

An issue or PR does not by itself prove that a bug exists, that a remedy is necessary, that a change is correct, or that external publication or residual-risk acceptance is authorized.

Consider risk for every material change. Use an explicit limitation or rollback paragraph when the change affects shared APIs, persistence, permissions, security/privacy, browser compatibility, cross-context messaging, asynchronous lifecycle, or release/build behavior. Identify residual risk and the decision owner; do not claim that a significant residual risk has been accepted without that owner's decision.

An agent must not present a change as review-ready when a material acceptance condition fails, a critical claim is unverified or contradicted, the diff exceeds the justified scope, required verification is missing without an adequate substitute, a known correctness/security/privacy/compatibility defect remains, or the description no longer matches the final patch. An explicitly requested draft or investigation may still be submitted when labeled as such. Report the blocker, the evidence, and the condition that would clear it.

Verification claims bind to a revision or clearly identified worktree. If code, configuration, generated artifacts, or a decision-relevant description changes after a check, rerun every affected check before claiming readiness. A final commit SHA is sufficient identity for ordinary GitHub work; a cryptographic evidence ledger is not required by default.

### Scope claims and final-diff evidence

Claims that a pull request includes only a named scope or excludes another change are evidence-bearing. Before
writing or retaining one:

1. Bind the live pull request base and head SHAs.
2. Inspect `git diff <base-sha>...<head-sha>`, including changed paths and patch content, against the stated
   inclusion or exclusion set. Branch ancestry, commit intention, and an earlier local checkout do not prove
   the claim.
3. Record the exact base/head pair and the check in `验证`. If no observable diff can prove the claim, omit it or
   label it unverified.

Any new commit, force-push, rebase, base change, conflict resolution, or scope-claim edit invalidates earlier
scope evidence. Recompute the final diff and re-read the live pull request before publishing or reporting the
claim.

## Evidence triggered by changed contract

Activate only the rows touched by the actual change; mixed changes use their union.

| Changed contract | Extra evidence to expect |
| --- | --- |
| Bug fix | Before reproducer, expected behavior, regression test or justified manual evidence, and the same reproducer after the fix |
| New behavior | User/system need, observable acceptance criteria, and compatibility/scope boundaries |
| Refactor | Concrete structural problem and evidence that behavior/public contracts are preserved |
| Performance/resource | Baseline, workload, environment, method, before/after result, and accepted correctness/complexity trade-off |
| Security/privacy/permissions | Protected boundary, threat or failure mode, safe verification, residual risk, and private reporting when appropriate |
| Dependency/build/configuration | Compatibility or lifecycle reason, version/platform scope, lock/generated rationale, and build verification |
| Documentation/tests only | The authoritative behavior or decision being corrected or preserved; verify claims, links, or tests without inventing runtime evidence |
| Generated/mechanical | Source input, tool/command, reason for regeneration, and evidence that unrelated semantic edits were not mixed in |
| Persistence/migration/release | Compatibility and data scope, ordering/irreversibility, rollback/restore path, and rehearsal or invariant evidence where safe |
| Async/concurrency/stateful UI | Duplicate in-flight work, stale or late results, cancellation/retry, cleanup, and identity or generation ordering where applicable |

## Review-oriented content

For non-trivial changes, make the description useful for review:

- `背景` explains the problem, compatibility gap, or maintenance need.
- `本次改动` summarizes user-visible behavior and important implementation changes.
- `实现考虑` records design decisions, invariants, lifecycle behavior, races, or compatibility choices.
- `已知限制` records unsupported cases, explicit scope boundaries, and follow-up work.
- `建议审查重点` lists concrete behaviors or risks reviewers should verify.
- `验证` lists exact commands and concise results, including known warnings or why a check was not run.

## Documentation-only PRs

For a PR that only changes Markdown, `验证` should reflect what a doc change actually needs, not an unrelated
full code test suite: a fact check against the final tree, a relative-link/actual-anchor check, a
cross-document policy-consistency check, and a privacy/sanitization scan (see
[`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md)). Before writing "all fixed" or "fully verified," re-review your
own final diff and any nearby location sharing the same root cause — but only claim the scope you actually
scanned; don't imply full-repo coverage you didn't perform.

# Pull Request Description Guide

This guide defines the detailed PR description format for agents and contributors. The human-facing template at [`../.github/pull_request_template.md`](../.github/pull_request_template.md) intentionally remains lightweight; use it as the starting point and expand its `Description / 描述` section when the change needs more context.

**Do not use a generic `## Summary` / `## Test plan` template** — that's a common default baked into
many agent tool instructions, not this repo's format. Use the structure below instead.

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

Small documentation, dependency, or CI changes may use a shorter description and omit sections that do not apply, but must still explain what changed and what was checked. For visual changes, retain the template's screenshot section and provide the relevant evidence. Never claim a test, review, screenshot, or recording that did not happen. Leave `Code reviewed by human` unchecked unless a human has actually reviewed the PR.

## Review-oriented content

For non-trivial changes, make the description useful for review:

- `背景` explains the problem, compatibility gap, or maintenance need.
- `本次改动` summarizes user-visible behavior and important implementation changes.
- `实现考虑` records design decisions, invariants, lifecycle behavior, races, or compatibility choices.
- `已知限制` records unsupported cases, explicit scope boundaries, and follow-up work.
- `建议审查重点` lists concrete behaviors or risks reviewers should verify.
- `验证` lists exact commands and concise results, including known warnings or why a check was not run.

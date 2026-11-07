# Proposal: metadata-aware token-shingle similarity for script updates

> **Status: design proposal only.** This document does not describe a shipped feature or change runtime behavior. Maintainer review is requested before implementation.

## Problem and scope

ScriptCat's batch-update page currently estimates the size of an old-to-new script change through `getSimilarityScore` in `src/app/service/service_worker/script_update_check.ts`. It normalizes whitespace, repeats shorter source text, and invokes `string-similarity-js`. The score drives `tiny` / `noticeable` / `major` badges in `src/pages/batchupdate/logic.ts` (currently at 0.95 and 0.75).

A token-shingle comparison could be more stable under formatting, comments, local insertions, and moving code. This is **pairwise update comparison** (installed version versus proposed version), not Greasy Fork's site-wide search for derivatives: no global fingerprint database or inverted index is needed.

**The userscript metadata block is not ordinary commentary.** Changing `@grant`, `@match`, `@connect`, `@require`, or similar directives changes the script's permissions, execution, dependencies, or update behavior even if the JavaScript body is byte-for-byte identical. The proposed design therefore has two independent outputs: body similarity and metadata changes.

## Proposed behavior

### 1. Compare executable code using token shingles

- Split each source using the same userscript-header recognition rules as `parseMetadata` / `parseMetadataLines` in `src/pkg/utils/script.ts`; do not strip all `//` comments with a regex. Leave all original source intact for installation and diffs.
- Tokenize the JavaScript body with a JavaScript-aware lexer (including strings, regular expressions, templates, and Unicode). Ignore ordinary whitespace and comments **only in the executable-body similarity channel**.
- Match Greasy Fork's fingerprint semantics: exclude punctuation-only structural tokens (braces, brackets, parentheses, semicolons, commas, and periods) from shingle generation; use overlapping runs of five eligible tokens (or all available eligible tokens if fewer than five); hash length-prefixed token bytes with SHA-256 and retain the first 64 bits; keep up to the 256 numerically smallest unique hashes.
- Calculate sampled Jaccard overlap with a common bottom-k cutoff; cap the result by the smaller/larger **full retained-token count** ratio and by 0.999. Preserve 1.0 for exactly equal executable bodies. Avoid interpreting the estimate as "percentage of lines copied."
- Run this locally for each old/new update pair; avoid network requests and global hash indexing. Establish performance limits and report unscorable cases explicitly instead of silently treating them as zero similarity.

### 2. Compare userscript metadata independently

Use `parseMetadataLines` / `parseMetadata` as the source of truth, including lowercased directive names, repeated values, and the original directive order. Do not pass metadata directives into the code-token similarity as throwaway comments.

- Report added, removed, and changed directives, including unknown or ScriptCat-specific tags. Keep duplicates; preserve ordering where meaningful (especially `@require`). Ignore only irrelevant presentation whitespace; do not blindly sort every value list.
- Flag execution/permission/network/dependency changes separately: e.g., `@grant`, `@connect`, `@match`, `@include`, `@exclude`, `@run-at`, `@inject-into`, `@require`, `@resource`, `@noframes`, `@background`, `@crontab`, `@updateURL` and `@downloadURL`. Treat other directives (including `@license`, `@version`, names, descriptions, and unknown tags) as meaningful changes to display, not as executable-body tokens.
- Treat a missing or invalid userscript header as an explicit metadata-comparison failure. Any `==UserConfig==` block should also be detected and surfaced as configuration changes, rather than accidentally discarded as an ordinary block comment.
- A **metadata-only change** must show body similarity at 100% **and** a visible metadata-change indicator. A high code score must never suppress a permission, scope, dependency, or execution-mode warning.

### 3. Update UI/risk semantics without weakening the existing safety gate

- Present the body similarity and a separate metadata-change summary/badge on the batch-update page; reveal changed directives for review. Keep the existing code diff and new-`@connect` indicator.
- Do not simply carry over the old 0.75/0.95 risk thresholds: the old character-based score and new shingle score are not calibrated to the same scale. Establish thresholds from representative small/large script fixtures, then ensure material metadata changes are never labeled "tiny" based solely on body similarity.
- Preserve the existing `checkSilenceUpdate` behavior for newly added `@connect` values and the current update lifecycle. Whether additional metadata changes should prohibit silent updates is a **separate, security-relevant maintainer decision**; this proposal does not silently change that policy.
- Reuse ScriptCat's current update-record flow and avoid persisting new global fingerprints. If the UI gains a new metadata field, ensure its delivery and batch-update types carry it consistently.

## Acceptance examples for an implementation PR

1. Only indentation, line endings, or ordinary comments change: body similarity remains 100%; no metadata change.
2. Only `@grant none` changes to `@grant GM_xmlhttpRequest`, or `@connect` gains a host: body similarity remains 100%, while the permission/network change is conspicuous.
3. Only `@match`, `@require` (including order), `@run-at`, `@background`, `@crontab`, or update URLs change: metadata warning remains visible independently of the body score.
4. Metadata directive order, repeated tags, capitalization, whitespace, unknown directives, malformed/missing blocks, and `==UserConfig==` changes are tested against ScriptCat's existing parsing behavior.
5. A function moved intact to another location still shares its internal shingles; changing identifiers/literals affects only related shingles. Strings containing comment-like text, regex literals, and template expressions tokenize correctly.
6. Empty, tiny (fewer than five tokens), minified, large, and non-ASCII scripts have explicit expected results; processing is bounded and benchmarked in the extension's background context.
7. Existing batch-update record lifecycle, current `@connect` silent-update gate, and update/ignore actions continue to work. Badge thresholds are calibrated with fixtures rather than copied from the old metric.

## Non-goals / limitations

- No site-wide similar-script discovery, fingerprint database, or licensing-enforcement engine.
- No automatic conclusion that a matching snippet is plagiarized, and no guarantee that semantically equivalent rewrites score highly.
- Common-snippet highlighting could be a follow-up using token offsets; it is not required to replace the current numeric score.
- This RFC contains no implementation or executable test results. Runtime and UI behavior remain unchanged until a subsequent implementation PR.

## References

- Existing scoring: [`script_update_check.ts`](../src/app/service/service_worker/script_update_check.ts), [`script.ts`](../src/app/service/service_worker/script.ts), [`batchupdate/logic.ts`](../src/pages/batchupdate/logic.ts)
- Existing metadata and safety behavior: [`src/pkg/utils/script.ts`](../src/pkg/utils/script.ts), [`src/pkg/utils/utils.ts`](../src/pkg/utils/utils.ts)
- [Greasy Fork token-shingle implementation](https://github.com/greasyfork-org/greasyfork/blob/main/app/services/token_shingle_similarity_scorer.rb) and [its introduction](https://github.com/greasyfork-org/greasyfork/commit/29e3089720abcf5107ec930014b7dfe3479d84fc)

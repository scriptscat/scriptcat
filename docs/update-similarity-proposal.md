# Design and implementation: metadata-aware token-shingle similarity for script updates

> **Status: implemented in this PR, pending maintainer review.** This replaces the script-update score and adds separate metadata warnings; it does not add site-wide similarity search.

## Problem and scope

ScriptCat's batch-update page previously estimated the size of an old-to-new script change through `getSimilarityScore` in `src/app/service/service_worker/script_update_check.ts`. It normalized whitespace, repeated shorter source text, and invoked `string-similarity-js`. This PR replaces that character-based scorer.

A token-shingle comparison is more stable under formatting, comments, local insertions, and moving code. This is **pairwise update comparison** (installed version versus proposed version), not Greasy Fork's site-wide search for derivatives: no global fingerprint database or inverted index is needed.

**The userscript metadata block is not ordinary commentary.** Changing `@grant`, `@match`, `@connect`, `@require`, or similar directives changes the script's permissions, execution, dependencies, or update behavior even if the JavaScript body is byte-for-byte identical. The implementation therefore has two independent outputs: body similarity and metadata changes.

## Implemented behavior

### 1. Compare executable code using token shingles

- Tokenize JavaScript with `js-tokens`, including strings, regular expressions, templates, and Unicode. The userscript header is comment syntax at this stage: ordinary comments, whitespace, and metadata comments are ignored **only in the code-similarity channel**. Leave original source intact for installation and diffs.
- Match Greasy Fork's fingerprint semantics: exclude punctuation-only structural tokens (braces, brackets, parentheses, semicolons, commas, and periods) from shingle generation; use overlapping runs of five eligible tokens (or all available eligible tokens if fewer than five); hash length-prefixed token bytes with SHA-256 and retain the first 64 bits; keep up to the 256 numerically smallest unique hashes.
- Calculate sampled Jaccard overlap with a common bottom-k cutoff; cap the result by the smaller/larger **full non-comment-token count** ratio and by 0.999. Preserve 1.0 for exactly equal nonempty executable token sequences. Avoid interpreting the estimate as "percentage of lines copied."
- Run locally for each old/new update pair; no network requests or persistent global fingerprints are added. When either side has no eligible executable tokens (e.g. empty body or failed fetch), set `codeComparable: false`, show an unavailable-score explanation, and conservatively mark major change, rather than falsely claim a numeric 0% score.

### 2. Compare userscript metadata independently

Use `parseMetadataLines` / `parseMetadata` as the source of truth, including lowercased directive names and repeated values in their original per-tag order. Do not discard metadata merely because the lexer sees comment syntax.

- Report added, removed, and changed directives, including unknown or ScriptCat-specific tags. Keep duplicates; preserve ordering where meaningful (especially `@require`). Ignore only irrelevant presentation whitespace; do not blindly sort every value list.
- Flag execution/permission/network/dependency changes separately: e.g., `@grant`, `@connect`, `@match`, `@include`, `@exclude`, `@run-at`, `@inject-into`, `@require`, `@resource`, `@noframes`, `@background`, `@crontab`, `@updateURL`, and `@downloadURL`. Recognized informational tags (including localized names/descriptions) are also compared; unknown tags are conservatively considered sensitive.
- Treat a missing or invalid userscript header as an explicit metadata-comparison failure. Detect `==UserConfig==` differences using ScriptCat's existing `getUserConfigStr` extraction, rather than discarding that block as an ordinary comment.
- A **metadata-only change** must show body similarity at 100% **and** a visible metadata-change indicator. A high code score must never suppress a permission, scope, dependency, or execution-mode warning.

### 3. Update UI/risk semantics without weakening the existing safety gate

- Show body similarity and a separate clickable metadata badge in desktop/mobile batch-update lists; the popover reveals old and new directive values. The existing code diff and new-`@connect` indicator remain. The `@version` change is still compared but not redundantly badged because the old/new version already appears beside the script name.
- Starting risk-score bands are **below 0.50** major, **0.50–0.90** noticeable, and **0.90 or above** tiny. These are deliberately distinct from the old character scorer's 0.75/0.95 bands, with regression tests at each boundary; they remain heuristic and need real-world calibration. Sensitive metadata, UserConfig, invalid metadata, and unavailable code scores override to major; other non-version metadata changes override tiny to noticeable.
- Preserve existing `checkSilenceUpdate` behavior for newly added `@connect` values and the current update lifecycle. Whether other metadata changes should prohibit silent updates remains a **separate, security-relevant maintainer decision**.
- Reuse ScriptCat's existing update-record flow. The in-memory record and code-free lightweight packet carry `codeSimilarity`, `codeComparable`, and `metadataComparison`; no fingerprint database is persisted.

## Acceptance and regression examples

1. Only indentation, line endings, or ordinary comments change: body similarity remains 100%; no metadata change.
2. Only `@grant none` changes to `@grant GM_xmlhttpRequest`, or `@connect` gains a host: body similarity remains 100%, while the permission/network change is conspicuous.
3. Only `@match`, `@require` (including order), `@run-at`, `@background`, `@crontab`, or update URLs change: metadata warning remains visible independently of the body score.
4. Metadata directive order, repeated tags, capitalization, whitespace, unknown directives, malformed/missing blocks, and `==UserConfig==` changes are tested against ScriptCat's existing parsing behavior.
5. A function moved intact to another location still shares its internal shingles; changing identifiers/literals affects only related shingles. Strings containing comment-like text, regex literals, and template expressions tokenize correctly.
6. Empty executable bodies, Unicode, short bodies, regexes, templates, and large/minified inputs that exercise the bottom-256 cutoff have explicit regression cases. Dedicated background-context performance benchmarking remains a follow-up.
7. The update-record delivery retains comparison data without shipping code to the list view. Existing update/ignore operations and the new-`@connect` silent-update gate remain unchanged.

## Non-goals / limitations

- No site-wide similar-script discovery, fingerprint database, or licensing-enforcement engine.
- No automatic conclusion that a matching snippet is plagiarized, and no guarantee that semantically equivalent rewrites score highly.
- Common-snippet highlighting could be a follow-up using token offsets; it is not required to replace the current numeric score.
- Silent updates are **not** additionally gated on metadata beyond existing new-`@connect` checks; broadening that policy requires separate security review.

## References

- Scorer: [`script_similarity.ts`](../src/pkg/utils/script_similarity.ts) and [its tests](../src/pkg/utils/script_similarity.test.ts)
- Update integration: [`script_update_check.ts`](../src/app/service/service_worker/script_update_check.ts), [`script.ts`](../src/app/service/service_worker/script.ts), [`batchupdate/logic.ts`](../src/pages/batchupdate/logic.ts)
- Existing metadata and safety behavior: [`src/pkg/utils/script.ts`](../src/pkg/utils/script.ts), [`src/pkg/utils/utils.ts`](../src/pkg/utils/utils.ts)
- [Greasy Fork token-shingle implementation](https://github.com/greasyfork-org/greasyfork/blob/main/app/services/token_shingle_similarity_scorer.rb) and [its introduction](https://github.com/greasyfork-org/greasyfork/commit/29e3089720abcf5107ec930014b7dfe3479d84fc)

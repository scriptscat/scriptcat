<!-- Copy into the scenario directory as report.md before running. Headings stay English; write the record in the user's language. Delete unused sections and this comment. -->

# Local verification: <scenario>

## Mode

`verifying a change` | `reproducing a bug`

## Goal / problem

<Expected observable behaviour and risk, or Expected/Actual bug statement>.

## Verdict

<!-- Fill last. Keep verdicts only here. One row per claim — split a compound claim rather than averaging it. Where `not observed` came from unconfigured environment, "How observed" names the service and the absent variable names, never values. -->

| # | Requirement / bug claim | Verdict | Real / substituted | How observed | Check it yourself |
|---|---|---|---|---|---|
| V1 | `<one behaviour or bug claim, stated so it can only be true or false>` | holds / does not hold / not observed | real, or `substituted: <what stood in> — <what it does not cover>` | `<the deciding evidence; for a negative claim, its closure-window observation or causal proof>` | `<command that re-runs this check>` |

Summary: <what holds, the deciding observation, every not-observed/failed item and shipping implication>.

| Label | Use it when | Requires |
|---|---|---|
| `holds` | the required evidence establishes the claim | the deciding runtime observation, or for a negative claim the closure-window observation/causal proof, and how a reader reaches it |
| `does not hold` | you observed it failing, or the bug reproducing | the failing output, assertion diff or error screenshot |
| `not observed` | you never reached the check | what stopped it |

An unreached check is never `holds`; a run that verified two of three claims is reported as two of three.

For a negative claim supported by causal proof, `How observed` may cite the relevant source or contract locator
instead of a runtime observation, but it must explain why execution cannot reach the forbidden side effect.

## Authorization

<!-- Keep only when a real dependency was substituted or an external effect was authorized. Driving a Service Worker message in place of the UI that sends it is a substitution. -->

| # | Substitute or effect | The user's authorization, verbatim |
|---|---|---|
| V1 | `<what stood in for what, or the effect and what it touches>` | `<sentence>` |

## Reproduction steps

<!-- Keep for bug reproduction; state whether the assertion encodes the desired behaviour (stays red) or the current buggy contract (green until the fix flips it). -->

1. `<clean-checkout-to-observation steps>`

## Acceptance evidence

<!-- One `###` per verdict row, holding everything that decides it in the order observed. No verdict labels here. A row with no section is `not observed`. -->

### V1 · `<the claim, restated>`

```text
[verify] <the console or command line the verdict rests on>
```

<What this proves>. Full capture: `<console.log>`.

| Light | Dark |
|---|---|
| `![Settings light](screenshots/v1-light.png)` | `![Settings dark](screenshots/v1-dark.png)` |

<!-- Pair before/after and light/dark in one table so the comparison is one glance. For a sequence, embed `<video src="videos/….webm" controls width="720"></video>` plus the stills captured during the run — the stills carry the verdict. -->

## Evidence index

- Screenshots/video: `<paths, and which row each backs>`
- Logs: `<deciding lines are inline above; link full captures here>`
- Resources: `<inline userscripts, mock payloads, import/export files, before/after snapshots — and what each proves>`

## Persistent data changes

<!-- Keep only when the run wrote data that outlives it — a real cloud provider, an imported backup, an OPFS/IndexedDB migration. An ephemeral profile the harness deletes is not one. -->

| Change | Forward | Backward/backup | Before/after query |
|---|---|---|---|
| `<scope/blast radius>` | `<command/exit>` | `<command/exit or irreversible plan>` | `<evidence>` |

## Execution record

| Step | Status | Evidence/blocker |
|---|---|---|
| `<step>` | pending / passed / failed / blocked | `<path or observation>` |

## Integrity and cleanup

- Initial/final HEAD: `<sha>` / `<sha>`
- Final `git status --porcelain=v1`: `<output>`
- Created artifacts/processes/external data and cleanup: `<inventory>`
- Redaction performed: `<what was removed>`

## Evidence rules

- Every `holds` names how the target was driven — command, or launch plus steps — and the deciding observation. A session already wrote that record to `actions.log`; quote it rather than reconstructing it from memory.
- Where a claim changes state beyond the driven surface, that observation is an independent read: extension storage from an extension page, or the page console.
- Embed decisive text and images inline; scrolling this file should reach a verdict without opening a side file. Link only archives, binaries and full captures, each with a note on what it holds.
- One artifact can back two rows: put it under the row it decides and reference it from the other.
- Keep failed and unchecked steps visible. Redact tokens, cookies and real credentials before saving, and again before embedding.
- Keep every path relative to this file; the scenario directory, not `report.md` alone, is what you hand to a reviewer.

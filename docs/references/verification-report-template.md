# Verification record template

Before running the browser, create a short verification record in the scenario directory, for example
`test-results/verify/<scenario>/report.md`. Keep the reusable template headings in English, but write the actual
record content in the user's language. Update it as the run proceeds instead of filling it in only at the end.

```md
## Evidence Index

### Screenshots

![Options root](screenshots/options-root.png)
The script list page rendered and the view toggle is visible, proving the `/` route mounted successfully.

![Settings](screenshots/settings.png)
The settings page shell and content are visible, proving `/settings` did not render blank or crash during mount.

### Videos

- [videos/page@abc.webm](videos/page@abc.webm) — Full page-viewport recording from the script list to the
  settings page; review it for the navigation and final stable state.

### Logs

- [console.log](console.log) — Browser console output captured during the run; confirms whether unexpected errors
  appeared.

### Resources

- [resources/import.yaml](resources/import.yaml) — Input file used by the import verification; keep it to
  reproduce the import flow.
```

Use this shape:

```md
# Local E2E Verification Record: <scenario>

## Mode

`verify-change` | `reproduce-bug`

## Goals / Problem

- (verify)    What behavior should hold, and why it might not
- (reproduce) **Expected:** … **Actual:** …

## Reproduction Steps

1. …
2. …

## Minimal Reproduction

- Smallest script/page/steps that trigger it (link `resources/…`)

## Task List

- [ ] Prerequisite checks passed
- [ ] Built and loaded the real extension
- [ ] Opened target page and confirmed stable anchor
- [ ] Saved screenshots, videos, and logs
- [ ] Recorded the verdict in Result

## Execution Log

| Step | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Open options page | Pending | - | - |

## Result

- **Verdict:** PASS / FAIL — (verify) does the behavior hold? (reproduce) did it reproduce?
- **Observed:** the summary line / asserted value / screenshot that backs the verdict
- (reproduce) Scratch asserts the **desired** behavior (stays red) or the **current buggy** contract
  (passes green; the fix must flip it) — say which

## Blockers

- None

## Evidence Index

Embed screenshots inline, link videos / logs / resources, and annotate every item — see the shape above.
```

Fill `Result` at the end — the honest verdict, per *Step 4 — Report honestly* in [`verification.md`](../verification.md).
Execution Log `Status` moves `Pending` → `Pass` / `Fail` / `Blocked`.

In `verify-change` mode, drop the `Reproduction Steps` / `Minimal Reproduction` sections. In `reproduce-bug`
mode, fill `Expected`/`Actual` and keep those sections so the record stands on its own — a later reader or AI
should understand and re-trigger the bug from `report.md` alone, without reading the code.

Keep the checklist factual:

- Start with unchecked tasks that describe what you intend to verify.
- Check items only after the corresponding command/assertion has actually passed.
- If a step is blocked, leave its checkbox unchecked and add a concrete entry under `Blockers`: what failed,
  where it failed, and what evidence was captured.

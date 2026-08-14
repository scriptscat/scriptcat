# Verification record template

Before running the browser, create a short verification record in the scenario directory, for example
`e2e/scratch/<scenario>/report.md`. Keep the reusable template headings in English, but write the actual
record content in the user's language. Update it as the run proceeds instead of filling it in only at the end.

**The snippet below is a filled *example* of the `## Acceptance Evidence` shape** — it shows what a completed
one looks like, not a second section to add. The full template further down has its own heading; use that one
and fill it following this example.

Evidence is organized **one `###` section per `Verdict` row**, not by artifact type. A reader arrives from a
`V2` row and finds every screenshot, log line, and fixture that decides `V2` in one place, in the order they
were observed. Verdict labels stay in the `Verdict` table and are not repeated here.

This record exists so a reader can judge whether the implementation is correct, so **evidence is embedded, not
linked**: scrolling `report.md` top to bottom should show the pixels and the deciding log lines without opening
a single side file. A bare link is the fallback for artifacts that genuinely cannot render inline (archives,
binaries, multi-megabyte logs), and it carries a note saying what it holds.

~~~md
## Acceptance Evidence

### V1 · The `/` route mounts and lists installed scripts

![Options root](screenshots/v1-options-root.png)
The script list rendered with the view toggle visible — the route mounted, rather than falling through to a
blank shell.

```text
[verify] options url = chrome-extension://<id>/src/options.html#/
```

### V2 · `/settings` renders correctly in light and dark

| Light | Dark |
| --- | --- |
| ![Settings light](screenshots/v2-settings-light.png) | ![Settings dark](screenshots/v2-settings-dark.png) |

Readable contrast in both themes — the shell picked up the theme tokens instead of falling back to one palette.
One theme's screenshot alone would not show this.

<video src="videos/v2-navigation.webm" controls width="720"></video>

The full navigation from the script list to the settings page. The decisive frames, because a video is neither
skimmable nor playable in every viewer:

![Before navigation](screenshots/v2-nav-01-list.png)
The settings entry, enabled, before the click.

![After navigation](screenshots/v2-nav-02-settings.png)
The route changed and the content painted, after the click.

### V3 · Importing a backup restores every script in it

`resources/import.yaml` — the input this run consumed:

```yaml
scripts:
  - name: demo-script
    source: https://example.com/demo.user.js
```

```text
[verify] script count after import = 3
```

Three scripts in the file, three in the list. Full capture: [console.log](console.log) — no unexpected errors
during the run.
~~~

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
- [ ] Every Verdict row filled

## Execution Log

| Step | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Open options page | Pending | - | - |

## Verdict

| # | Claim under verification | Verdict | How observed | Check it yourself |
| --- | --- | --- | --- | --- |
| V1 | <one behavior or bug claim, stated so it can only be true or false> | holds / does not hold / not observed | <the runtime observation that decides it> | `<command that re-runs this check>` |

Summary: <what holds; the deciding observation; every `does not hold` / `not observed` row and what it blocks>

- (reproduce) Scratch asserts the **desired** behavior (stays red) or the **current buggy** contract
  (passes green; the fix must flip it) — say which

## Blockers

- None

## Acceptance Evidence

### V1 · <the claim from the Verdict row, restated>

<the commands, output, screenshots, and fixtures that decide this row, in the order observed — see the
example above. No verdict labels here; they live in the Verdict table.>

## Persistent Data Changes

| Change | Forward | Backward / backup | Before-after check |
| --- | --- | --- | --- |
| <what was written, and how far it reaches> | <command / exit> | <command / exit, or "irreversible" + the plan> | <the query or observation proving it> |

## Integrity & Cleanup

- HEAD at start / end: `<sha>` / `<sha>`
- `git status --porcelain` at end: `<output>`
- Artifacts, processes, and external data created — and how each was cleaned up: `<inventory>`
- Redaction performed before saving: `<what was removed>`

## Evidence Index

- Screenshots / video: <paths, and which V row each backs>
- Logs: <deciding lines are inline above; link the full captures here>
- Resources / data snapshots: <paths and what each proves>
```

Fill `Verdict` last — the honest result, per *Step 4 — Report honestly* in
[`verification.md`](../verification.md). Execution Log `Status` moves `Pending` → `Pass` / `Fail` / `Blocked`.

### Verdicts are per claim, and there are three of them

One row per claim you set out to verify — split a compound claim rather than averaging it into one row. The
three labels are not interchangeable:

| Label | Use it when | Requires |
| --- | --- | --- |
| `holds` | you observed the behavior at runtime, or a negative claim has a closure-window observation or causal proof | the deciding observation/proof *and* a command or source locator a reader can re-run/inspect |
| `does not hold` | you observed it failing, or observed the bug reproducing | the failing output, assertion diff, or error screenshot |
| `not observed` | you never reached the check — blocked, out of scope, environment missing | a `Blockers` entry saying what stopped it |

`not observed` is the one that keeps a report honest: an unreached check is **never** `holds`. A run where two
claims held and one was never exercised is reported as exactly that, not as a pass. When the cause was an
unconfigured environment, name the service and the *variable names* that were missing — never their values.

For a negative claim, a causal proof is valid only when it shows that execution cannot reach the forbidden side
effect; record the proof's source/contract locator in `How observed`. If neither that proof nor a closure-window
observation exists, use `not observed`.

The `Check it yourself` column exists so a reviewer can reproduce a row without reconstructing the run; if a row
has no such command, say why in `How observed` rather than leaving it blank.

### Sections to drop when they don't apply

- `verify-change` mode: drop `Reproduction Steps` and `Minimal Reproduction`. In `reproduce-bug` mode fill
  `Expected`/`Actual` and keep them, so a later reader or AI can re-trigger the bug from `report.md` alone
  without reading the code.
- `Persistent Data Changes`: keep only when the run wrote data that outlives it — a real cloud-sync provider, an
  imported backup, an OPFS/IndexedDB migration. An ephemeral browser profile that the harness deletes is not a
  persistent change. Note the blast radius honestly: "only this test profile" is a valid, useful entry.
- `Integrity & Cleanup`: keep whenever the run touched a real external target or left anything behind. It is
  what lets a reviewer confirm the verification didn't quietly modify the working tree or leave a live process
  or real remote data around.

Keep the checklist factual:

- Start with unchecked tasks that describe what you intend to verify.
- Check items only after the corresponding command/assertion has actually passed.
- If a step is blocked, leave its checkbox unchecked and add a concrete entry under `Blockers`: what failed,
  where it failed, and what evidence was captured.

### Inside an Acceptance Evidence section

One `###` per `Verdict` row, headed `V<n> · <the claim>`, holding everything that decides that row — commands,
output, screenshots, fixtures — in the order you observed them. Rules that follow from that:

- A claim with no evidence section is `not observed`, not `holds`. If a row genuinely needs no artifact beyond
  its `Check it yourself` command, say so in one line rather than omitting the section.
- One artifact can back two rows; put it under the row it decides and reference it from the other rather than
  pasting it twice.
- Don't restate the verdict word here — the `Verdict` table owns it, and two copies drift apart.
- `Evidence Index` at the end is a **pointer list**, not a second copy: paths, and which row each backs. The
  pixels and the deciding lines stay inline in the V sections.

Keep the evidence embedded:

- **Screenshots** — `![alt](screenshots/….png)` plus a caption line stating what it proves. Put paired shots
  (before/after, light/dark) in a two-column table so the comparison is one glance, not two scrolls.
- **Videos** — `<video src="videos/….webm" controls width="720"></video>`. This renders as a player only in
  viewers that allow inline HTML, and a recording is slow to review either way, so capture the deciding moments
  as `page.screenshot()` calls *during* the run and embed those stills next to the video. The stills, not the
  recording, are what carries the verdict.
- **Logs** — paste the lines the verdict rests on into a fenced block, then link the full capture for the rest.
  A link alone forces the reader to reconstruct which line mattered.
- **Resources** — paste short text fixtures (YAML/JSON/userscript) inline in a fenced block. Link only what is
  large or binary, and say what it contains.
- Sanitize tokens, cookies, and real credentials *before* pasting log or resource content inline — embedding
  puts it in front of every reader.
- Keep every path relative to `report.md`. The scenario directory, not `report.md` alone, is the unit you hand
  to a reviewer; moving the file out of it breaks every embed.

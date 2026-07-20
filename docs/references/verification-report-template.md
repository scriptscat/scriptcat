# Verification record template

Before running the browser, create a short verification record in the scenario directory, for example
`test-results/verify/<scenario>/report.md`. Keep the reusable template headings in English, but write the actual
record content in the user's language. Update it as the run proceeds instead of filling it in only at the end.

**The snippet below is a filled *example* of the `## Evidence Index` shape** — it shows what a completed one
looks like, not a second section to add. The full template further down has its own `## Evidence Index`
heading; use that one heading and fill it following this example's shape.

This record exists so a reader can judge whether the implementation is correct, so **evidence is embedded, not
linked**: scrolling `report.md` top to bottom should show the pixels and the deciding log lines without opening
a single side file. A bare link is the fallback for artifacts that genuinely cannot render inline (archives,
binaries, multi-megabyte logs), and it carries a note saying what it holds.

~~~md
## Evidence Index

### Screenshots

![Options root](screenshots/options-root.png)
The script list page rendered and the view toggle is visible, proving the `/` route mounted successfully.

| Light | Dark |
| --- | --- |
| ![Settings light](screenshots/settings-light.png) | ![Settings dark](screenshots/settings-dark.png) |

The settings shell renders in both themes with readable contrast, proving `/settings` mounted and picked up the
theme tokens rather than falling back to one palette.

### Videos

<video src="videos/page@abc.webm" controls width="720"></video>

Full page-viewport recording from the script list to the settings page; watch it for the navigation and the
final stable state.

Same run, decisive moments as stills — a video is neither skimmable nor playable in every viewer:

![Before navigation](screenshots/nav-01-list.png)
The script list before the click; the settings entry is enabled.

![After navigation](screenshots/nav-02-settings.png)
The settings page after the click; the route changed and the content painted.

### Logs

The lines the verdict rests on:

```text
[verify] options url = chrome-extension://<id>/src/options.html#/settings
[verify] script count after import = 3
```

Full capture: [console.log](console.log) — no unexpected errors appeared during the run.

### Resources

`resources/import.yaml` — the input the import verification consumed:

```yaml
scripts:
  - name: demo-script
    source: https://example.com/demo.user.js
```
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

Embed every artifact inline and annotate what it proves — see the shape above.
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

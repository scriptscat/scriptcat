# Verification methods

[`../verification.md`](../verification.md) chooses the form; this file holds the patterns that reach behaviour the UI
does not expose directly. Each is written twice where the two forms differ: driving a session
([`../../e2e/README.md`](../../e2e/README.md#8-verification-sessions)) and authoring a spec. Failures and gotchas are
[`verification-debugging.md`](verification-debugging.md)'s.

## Script execution: GM APIs and injection

Making a userscript actually inject and run needs two things: the `userScripts` permission granted, and the permission
prompt answered.

A session grants `userScripts` at `start`, so injection works out of the box. It does **not** auto-approve prompts — a
GM API that needs a grant opens `confirm.html`, which you answer like any other page:

```bash
node e2e/drive.mjs pages                                        # 找到 confirm.html
node e2e/drive.mjs use <i>
node e2e/drive.mjs click "[data-testid=confirm-duration-permanent]"
node e2e/drive.mjs click "[data-testid=confirm-allow]"
```

In a spec, `testWithUserScripts` and `autoApprovePermissions` solve both
([`../../e2e/README.md`](../../e2e/README.md#3-harness-chain)) — import them rather than re-deriving the launch dance.

### The in-page self-test pattern

A userscript runs assertions in the page and prints a diagnostic summary the harness parses from the console. The
bundled scripts in [`../../example/tests/`](../../example/tests/) do this. Most share one framework,
[`../../example/tests/lib/sctest.js`](../../example/tests/lib/sctest.js) (loaded via `@require` and rewritten to a local
mock server under E2E), so all of those emit per-case diagnostics and one stable JSON marker:

```
[SCTEST_RESULT] {"protocol":"sctest/v1","counts":{"PASS":12,"FAIL":0,"WARN":0,"INFO":0,"SKIP":0,"MANUAL":0}, ...}
```

A script running in a background / crontab context has no visible page, so the framework additionally emits one `GM_log`
entry per case with structured labels (`sctest`, `status`) — filterable chips on the 运行日志 page. Results use `PASS`,
`FAIL`, `WARN`, `INFO`, `SKIP`, and an independent pending `MANUAL` status. Cases that need a human action (e.g.
clicking a menu item) remain `MANUAL` until confirmed on the panel; they are never silently counted as automatic passes.
Writing cases against the framework is documented in
[`../../example/tests/lib/README.md`](../../example/tests/lib/README.md).

Three scripts keep specialized operation UIs and have to be read on their own terms:
[`gm_download_test.js`](../../example/tests/gm_download_test.js) retains its download panel and human-confirmation flow,
while [`gm_menu_test.js`](../../example/tests/gm_menu_test.js) and
[`gm_value_test.js`](../../example/tests/gm_value_test.js) retain their menu and multi-frame dashboard UIs. They use
`SCTest.createReportSession()` for the same console/JSON protocol; operation observations are `INFO`, pending human
decisions are `MANUAL`, and no manual action is promoted to `PASS` without an explicit verdict.

In a session there is nothing to wire up — the collector already recorded the lines, whichever context printed them (a
`@background` script prints from `src/sandbox.html`, not from a page). Filter the stable marker when a machine-readable
report is needed:

```bash
node e2e/drive.mjs console 200 | grep "\\[SCTEST_RESULT\\]"
```

In a spec, collect and assert on the marker — same parse as the committed `gm-api.spec.ts` harness. E2E fails only when
`summary.failed` is non-zero; `WARN`, `INFO`, `SKIP`, and pending `MANUAL` stay visible for diagnosis:

```ts
const logs: string[] = [];
let summary: { protocol: string; passed: number; failed: number; counts: Record<string, number> } | null = null;
page.on("console", (msg) => {
  const text = msg.text();
  logs.push(text);
  if (!text.startsWith("[SCTEST_RESULT] ")) return;
  summary = JSON.parse(text.slice("[SCTEST_RESULT] ".length));
});
// ...navigate to the target page, then:
expect(summary, logs.join("\n")).not.toBeNull();
expect(summary!.protocol).toBe("sctest/v1");
expect(summary!.failed, logs.join("\n")).toBe(0);
expect(summary!.passed).toBeGreaterThan(0);
```

For a new GM API, write a small self-test userscript in the same style. In a session,
`node e2e/drive.mjs install <file.user.js>` installs it through the Service Worker and `node e2e/drive.mjs console`
shows the summary the script printed; in a spec, use `installScriptByCode`. Keep the script inside the scenario
directory — it is verification scaffolding, not a committed example.

## Behaviour fired from extension UI

The self-test pattern covers only what a userscript observes in the page. Some behaviour is fired from extension UI — a
`GM_registerMenuCommand` menu is triggered from the popup. Clicking that button is not drivable
([`verification-debugging.md`](verification-debugging.md#common-gotchas)); sending the message it sends is.

Clients talk to the Service Worker via `chrome.runtime.sendMessage({ action, data })`, where `action` is
`<client-prefix>/<method>` and the reply is wrapped as `{ code, data }` — payload is `res.data`, a truthy `code` means
error ([`../../packages/message/client.ts`](../../packages/message/client.ts)). Read the tab coordinates you need
(`tabId`/`frameId`/`documentId`) from a prior `getPopupData` call.

```ts
// from a chrome-extension:// page (e.g. options.html); poll until the async registration shows up
const res = await chrome.runtime.sendMessage({
  action: "serviceWorker/popup/getPopupData",
  data: { tabId, url },
});
const script = res.data.scriptList.find((s) => s.menus.some((m) => m.name === "your-menu"));
await chrome.runtime.sendMessage({
  action: "serviceWorker/popup/menuClick",
  data: { uuid: script.uuid, menus: script.menus }, // menus carry the target tabId/frameId/documentId
});
```

From a session the same call is one command, since `eval` already runs on an extension page:

```bash
node e2e/drive.mjs open options
node e2e/drive.mjs eval "const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true}); if (!tab?.id || !tab.url) throw new Error('no active tab'); const r = await chrome.runtime.sendMessage({action:'serviceWorker/popup/getPopupData', data:{tabId:tab.id, url:tab.url}}); return r.data.scriptList"
```

This drives the real SW → content → sandbox → callback path, behaviourally identical to the popup button, which discards
the DOM event and calls the same message. It is a substitution: the verdict row names it and says the popup's own click
path was not covered.

## A UI change across light and dark theme

The theme is stored in `localStorage` under `lightMode` with value `"light"` / `"dark"` / `"auto"`
([`../../src/pages/components/theme-provider.tsx`](../../src/pages/components/theme-provider.tsx), and
[`../../src/pages/common.ts`](../../src/pages/common.ts), which reads the same key during pre-render to avoid a theme
flash). Setting it before the page's own scripts run — `context.addInitScript` — is what applies the theme on first
paint instead of flashing the default.

Confirm that timing for a `chrome-extension://` page in your own setup before relying on it: `addInitScript` timing
relative to an extension page's bootstrap can differ from a normal web page. Capture one screenshot per theme as
separate evidence; one theme's screenshot does not show the other renders correctly.

A session has no `addInitScript` hook of its own, so set the key and reload — the pre-render read in `common.ts` then
picks it up before first paint:

```bash
node e2e/drive.mjs eval "localStorage.setItem('lightMode','dark'); return location.reload()"
node e2e/drive.mjs shot settings-dark
```

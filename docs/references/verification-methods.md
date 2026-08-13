# Verification methods

[`../verification.md`](../verification.md) chooses the form; this file holds the patterns that reach behaviour the UI does not expose directly. Each is written twice where the two forms differ: driving a session ([`../../e2e/README.md`](../../e2e/README.md#8-verification-sessions)) and authoring a spec. Failures and gotchas are [`verification-debugging.md`](verification-debugging.md)'s.

## Script execution: GM APIs and injection

Making a userscript actually inject and run needs two things: the `userScripts` permission granted, and the permission prompt answered.

A session grants `userScripts` at `start`, so injection works out of the box. It does **not** auto-approve prompts — a GM API that needs a grant opens `confirm.html`, which you answer like any other page:

```bash
node e2e/drive.mjs pages                                        # 找到 confirm.html
node e2e/drive.mjs use <i>
node e2e/drive.mjs click "[data-testid=confirm-duration-permanent]"
node e2e/drive.mjs click "[data-testid=confirm-allow]"
```

In a spec, `testWithUserScripts` and `autoApprovePermissions` solve both ([`../../e2e/README.md`](../../e2e/README.md#3-harness-chain)) — import them rather than re-deriving the launch dance.

### The in-page self-test pattern

A userscript runs assertions in the page and prints a summary line the harness parses from the console. The bundled scripts in [`../../example/tests/`](../../example/tests/) do this; the line varies by script, and each emits a `通过`/`Passed` and a `失败`/`Failed` count:

```
总计: 12 | 通过: 12 | 失败: 0        # inject_content_test.js / sandbox_test.js (combined line)
总测试数: 12 / 通过: 12 / 失败: 0     # gm_api_sync_test.js / gm_api_async_test.js (counts on separate lines)
Total: 12 | Passed: 12 | Failed: 0   # window_message_test.js (English)
```

Collect and assert on it — this regex matches all three layouts:

```ts
const logs: string[] = [];
let passed = -1;
let failed = -1;
page.on("console", (msg) => {
  const text = msg.text();
  logs.push(text);
  const pass = text.match(/(通过|Passed)[:：]\s*(\d+)/);
  const fail = text.match(/(失败|Failed)[:：]\s*(\d+)/);
  if (pass) passed = parseInt(pass[2], 10);
  if (fail) failed = parseInt(fail[2], 10);
});
// ...navigate to the target page, then:
expect(failed, logs.join("\n")).toBe(0);
expect(passed).toBeGreaterThan(0);
```

For a new GM API, write a small self-test userscript in the same style. In a session, `node e2e/drive.mjs install <file.user.js>` installs it through the Service Worker and `node e2e/drive.mjs console` shows the summary line the script printed; in a spec, use `installScriptByCode`. Keep the script inside the scenario directory — it is verification scaffolding, not a committed example.

## Behaviour fired from extension UI

The self-test pattern covers only what a userscript observes in the page. Some behaviour is fired from extension UI — a `GM_registerMenuCommand` menu is triggered from the popup. Clicking that button is not drivable ([`verification-debugging.md`](verification-debugging.md#common-gotchas)); sending the message it sends is.

Clients talk to the Service Worker via `chrome.runtime.sendMessage({ action, data })`, where `action` is `<client-prefix>/<method>` and the reply is wrapped as `{ code, data }` — payload is `res.data`, a truthy `code` means error ([`../../packages/message/client.ts`](../../packages/message/client.ts)). Read the tab coordinates you need (`tabId`/`frameId`/`documentId`) from a prior `getPopupData` call.

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
node e2e/drive.mjs eval "const r = await chrome.runtime.sendMessage({action:'serviceWorker/popup/getPopupData', data:{tabId, url}}); return r.data.scriptList"
```

This drives the real SW → content → sandbox → callback path, behaviourally identical to the popup button, which discards the DOM event and calls the same message. It is a substitution: the verdict row names it and says the popup's own click path was not covered.

## A UI change across light and dark theme

The theme is stored in `localStorage` under `lightMode` with value `"light"` / `"dark"` / `"auto"` ([`../../src/pages/components/theme-provider.tsx`](../../src/pages/components/theme-provider.tsx), and [`../../src/pages/common.ts`](../../src/pages/common.ts), which reads the same key during pre-render to avoid a theme flash). Setting it before the page's own scripts run — `context.addInitScript` — is what applies the theme on first paint instead of flashing the default.

Confirm that timing for a `chrome-extension://` page in your own setup before relying on it: `addInitScript` timing relative to an extension page's bootstrap can differ from a normal web page. Capture one screenshot per theme as separate evidence; one theme's screenshot does not show the other renders correctly.

A session has no `addInitScript` hook of its own, so set the key and reload — the pre-render read in `common.ts` then picks it up before first paint:

```bash
node e2e/drive.mjs eval "localStorage.setItem('lightMode','dark'); return location.reload()"
node e2e/drive.mjs shot settings-dark
```

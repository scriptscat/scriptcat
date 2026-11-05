# Background and scheduled scripts

Both run in ScriptCat's background sandbox, not in a web page. A background script (`@background`) starts when it
is enabled and when the browser starts. A scheduled script (`@crontab`) runs whenever its cron expression fires.

## Lifecycle

The body is wrapped in an `async` function. Return a `Promise` and settle it when the work is truly done:

```js
return new Promise((resolve, reject) => {
  GM_xmlhttpRequest({
    url: "https://api.example.com/status",
    onload: (res) => resolve(res.status),     // logged as "exec script complete" with the value
    onerror: () => reject(new Error("request failed")),
  });
});
```

- `resolve(value)` → run status *complete*, the value goes to the log.
- `reject(err)` → run status *error* in the script list; the error message is in the log.
- Nothing returned → the run is *complete* as soon as the synchronous part of the body (and any top-level
  `await`) finishes; callbacks and timers still pending do not keep it open.
- Settling early ends the run as far as ScriptCat is concerned; GM calls made afterwards may not take effect.
  `await` every `GM.setValue` before resolving.
- Top-level `await` works, and so does `return (async () => { …; return result; })();`

A long-lived background script (listeners, menus, intervals) can simply never resolve while it is working.

## Retry

```js
reject(new CATRetryError("server busy", 30));          // retry in 30 seconds
reject(new CATRetryError("try again later", new Date(Date.now() + 3600e3)));
```

`CATRetryError` is a global in background scripts and needs no grant of its own, but it is undefined under
`@grant none` (that mode skips everything ScriptCat injects); any other grant, or no `@grant` line, has it. The retry queue is checked every 5
seconds, so a retry fires up to 5 seconds after the requested time. Keep run time plus retry delay shorter than the
cron interval, or runs overlap.

## Cron expressions

Write exactly one `@crontab` line: every line is scheduled at runtime, but installation validates and the script
list shows only the first, and if any line fails to parse, all of the script's jobs are stopped. Parsed by the npm
package `cron` with one ScriptCat extension (`once`).

- 5 fields: `minute hour day month weekday` — recommended.
- 6 fields: `second minute hour day month weekday` — possible, not recommended: background timing is not
  second-accurate and it costs performance.
- Field syntax: `*`, `5`, `1,15,30`, `10-23`, `*/5`, `10-50/10`. Weekday `1`–`6` = Mon–Sat, `0` or `7` = Sun.

### `once`

`once` in a field means "at most one run per period of that field"; the field itself matches any value.
`once(expr)` does the same but only `expr` values are candidates. A run counts when it **starts**, so a failed run
also uses up the period — `reject(new CATRetryError(...))` is the way to try again within it (see [Retry](#retry)).

| Expression | Meaning |
|---|---|
| `* once * * *` | at most once per hour |
| `* * once * *` | at most once per day |
| `* 10 once * *` | once per day, during the 10:00 hour |
| `* 9-18 once * *` | once per day, between 9:00 and 18:59 |
| `* 1,3,5 once * *` | once per day, at the first of 1h/3h/5h that fires |
| `* once(9-17) * * *` | once in each hour from 9 to 17 (9 runs a day) |
| `0,30 once * * *` | once per hour, at :00 or :30, whichever comes first |
| `* once 13 * *` | once per hour, on the 13th of each month |

`once` fits "do this daily / hourly" work (check-in, sync, report) and absorbs browser restarts and late
scheduling. It does not fit work that must happen at an exact moment.

To test an expression in an external cron tool, replace `once` with `*` and `once(expr)` with `expr`.

## Debugging and logs

- `GM_log(msg, level)` writes to ScriptCat's log: open ScriptCat's Logs page and filter by the script's `name` or
  `uuid`, or run `sctl logs <uuid>`. This is where background output goes; plain `console.log` is not shown there.
  Release builds do not store `debug`-level entries.
- The script editor's Run button runs a background or scheduled script once, through the same path as
  `sctl run` (see [dev-loop.md](dev-loop.md#verifying-background-and-scheduled-scripts)). A manual run does not
  schedule `CATRetryError` retries.
- The script list shows only the run status (running / error / stopped) and, for a scheduled script, the next
  run time — not the result or the log.

## What is not available

No web page: no site DOM, `GM_getTab`/`GM_saveTab`/`GM_getTabs` do not work, and `unsafeWindow` is not a page.
Open a page with `GM_openInTab` and do DOM work in a page script, or fetch data with `GM_xmlhttpRequest`.
`GM_registerMenuCommand` does work: the menu appears in ScriptCat's popup.

## `@run-in`

`@run-in normal-tabs` / `incognito-tabs` / `all` restricts which browser context (normal or incognito) the
background script runs in.

# User configuration (`==UserConfig==`)

A YAML block placed after the `==UserScript==` header gives the script a settings form in ScriptCat. The script
reads values with `GM_getValue("<group>.<key>")` — so it needs `@grant GM_getValue` — and can open the form with
`CAT_userConfig()` (`@grant CAT_userConfig`).

```js
// ==UserScript==
// @name         Example with settings
// @namespace    https://example.com/your-namespace
// @version      0.1.0
// @match        https://example.com/*
// @grant        GM_getValue
// @grant        CAT_userConfig
// ==/UserScript==

/* ==UserConfig==
general:
  token:
    title: API token
    description: Personal token from the site's settings page
    type: text
    password: true
  interval:
    title: Refresh interval
    type: number
    default: 10
    min: 5
    max: 60
    unit: min
  mode:
    title: Mode
    type: select
    default: fast
    values: [fast, safe]
---
advanced:
  verbose:
    title: Verbose logging
    type: checkbox
    default: false
 ==/UserConfig== */

const interval = GM_getValue("general.interval", 10);
```

Groups are top-level keys and each becomes a tab in the form; fields sit under a group. A `---` line may split
the block into several YAML documents (as above); each is parsed the same way. Field options:

| Option | Applies to | Meaning |
|---|---|---|
| `title`, `description` | all | Label and help text |
| `type` | all | `text`, `textarea`, `number`, `checkbox`, `switch`, `select`, `mult-select`. When omitted: boolean `default` → `checkbox`, any `values` → `mult-select`, number `default` → `number`, else `text` — so write `type: select` explicitly for a single choice |
| `default` | all | Initial value (`mult-select`: an array) |
| `min` / `max` | `text` (length), `number` (value) | Bounds |
| `password: true` | `text` | Mask the input |
| `unit` | `number` | Unit shown after the field |
| `values` | `select`, `mult-select` | Fixed options |
| `bind: $key` | `select`, `mult-select` | Options taken from the stored value `key` (an array the script saves with `GM_setValue`) |

Pass the field's default to `GM_getValue` as well; do not rely on the form's `default` having been saved.

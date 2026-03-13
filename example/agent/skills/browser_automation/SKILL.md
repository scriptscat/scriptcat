---
name: browser-automation
description: Browser automation — analyze pages with a sub-agent, then perform DOM operations (click, fill, navigate, screenshot, scroll)
---

# Browser Automation Skill

You now have tools to control the browser. They are split into **primitive tools** (direct single operations) and **compound tools** (multi-step operations with sub-agent analysis).

## Tools

### Primitive Tools

| Tool | What it does |
|------|-------------|
| `list_tabs` | List all open tabs → find the `tabId` you need |
| `navigate` | Go to a URL |
| `screenshot` | Capture a screenshot (returned as image attachment) |
| `scroll` | Scroll up/down/top/bottom, returns position + atTop/atBottom flags |
| `wait_for` | Wait for a CSS selector to appear in the DOM |

### Compound Tools

| Tool | What it does |
|------|-------------|
| `browser_action` | Sub-agent reads the page and returns selectors / extracted data / suggestions — **read-only, no side effects** |
| `smart_fill` | Fill a form field with CDP trusted input + auto-verify the value |
| `click_and_wait` | CDP trusted click + wait for page changes (navigation, new tabs, DOM mutations) — sub-agent summarizes what changed |

## Workflow

Follow the **analyze → act → analyze → act** loop:

1. `list_tabs` → pick the target `tabId`
2. `browser_action` → understand the page, get CSS selectors
3. Act on the selectors:
   - **Form fields** → `smart_fill` (triggers proper framework events)
   - **Clicks** → `click_and_wait` (captures navigation, popups, async UI)
   - **Wait for loading** → `wait_for`
   - **Load more content** → `scroll`
4. `browser_action` → verify the result or analyze the next step
5. Repeat until done

## Examples

**Search task**:
```
→ list_tabs()
← tabId=123 [active] | Google | https://www.google.com

→ browser_action("find the search input and search button selectors", tabId=123)
← "Search input: `textarea[name=q]`, Search button: `input[name=btnK]`"

→ smart_fill("textarea[name=q]", "ScriptCat", tabId=123)
← { success: true, value: "ScriptCat" }

→ click_and_wait("input[name=btnK]", tabId=123)
← { clicked: true, navigated: true, url: "https://www.google.com/search?q=ScriptCat" }

→ browser_action("extract the top 5 search result titles and links", tabId=123)
← "1. ScriptCat - https://scriptcat.org/ ..."
```

**Navigate + screenshot**:
```
→ navigate("https://example.com", tabId=123)
← { success: true, url: "https://example.com", tabId: 123 }

→ screenshot(tabId=123)
← [image attachment]
```

**Scroll to load more**:
```
→ scroll("down", tabId=123)
← { success: true, atBottom: false, scrollTop: 800 }

→ wait_for(".lazy-loaded-item", tabId=123, timeout=5000)
← { found: true, tagName: "DIV", text: "..." }

→ scroll("down", tabId=123)
← { success: true, atBottom: true }
```

**Click that triggers a popup (sub-agent analyzes DOM changes)**:
```
→ click_and_wait(".delete-btn", tabId=123)
← { clicked: true, navigated: false,
     pageChanges: "Confirmation dialog appeared: 'Are you sure?'. Click `.modal .btn-ok` to confirm." }
```

**Data extraction**:
```
→ browser_action("extract the product list with names and prices", tabId=123)
← "1. Product A ¥99  2. Product B ¥199 ..."
```

**New tab opened by click**:
```
→ click_and_wait("a.detail-link", tabId=123, timeout=5000)
← { clicked: true, navigated: false, newTabs: [{ tabId: 456, url: "https://..." }] }

→ browser_action("read the page content", tabId=456)
```

## Tips for `browser_action` scenario

The `scenario` parameter should be **specific and goal-oriented**:

- Good: "find the login form's username input, password input, and submit button selectors"
- Good: "extract the first 5 search results with title, URL, and snippet"
- Good: "check if the user is logged in; if yes, find the search box selector"
- Bad: "analyze this page" — too vague, the sub-agent won't know what to look for

After an action, describe what you expect:
- "verify the form was submitted successfully and identify the next page"
- "check if the item was added to cart — look for a success toast or badge update"

## Important Notes

- **Popup blocking**: Some clicks open new windows/tabs (`window.open`, `target="_blank"`). If the expected new tab doesn't appear, tell the user to go to the site's address bar → Site settings → allow "Pop-ups and redirects", then retry.
- `browser_action` is **read-only** — it never clicks, fills, or modifies the page.
- Each `browser_action` call is **stateless** — it does not remember previous analyses.
- `click_and_wait` auto-detects DOM changes and JS dialogs; its `pageChanges` summary often makes a follow-up `browser_action` unnecessary.
- If `browser_action` reports "element not found", check its suggestions — it may say you need to click something first to reveal the element.

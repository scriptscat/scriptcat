const grantValuePrompts = {
  none: "Request no special GM API permissions; the script runs more like a regular page script.",
  unsafeWindow: "Access the page's own window object for interaction with native page scripts.",
  GM_getValue: "Read one value from the script's persistent storage.",
  GM_getValues: "Read multiple values from the script's persistent storage.",
  GM_setValue: "Write one value to the script's persistent storage.",
  GM_setValues: "Write multiple values to the script's persistent storage.",
  GM_deleteValue: "Delete one value from the script's persistent storage.",
  GM_deleteValues: "Delete multiple values from the script's persistent storage.",
  GM_listValues: "List all keys in the script's persistent storage.",
  GM_addValueChangeListener: "Listen for changes to script storage values.",
  GM_removeValueChangeListener: "Remove a script storage value change listener.",
  GM_xmlhttpRequest: "Make cross-origin network requests; target hosts usually need to be allowed with @connect.",
  GM_download:
    "Download files. Accepts a URL and filename, or a details object with fields such as url, name, headers, and saveAs, and returns an abortable handle.",
  GM_openInTab: "Open a new tab, with options such as foreground or background opening.",
  GM_closeInTab: "Close a tab opened or managed by the script.",
  GM_getTab: "Read temporary data associated with the current tab.",
  GM_saveTab: "Save temporary data associated with the current tab.",
  GM_getTabs: "Read all temporary tab data saved by the script.",
  GM_notification: "Show a browser notification and handle events such as click or close.",
  GM_closeNotification: "Close a specific script notification.",
  GM_updateNotification: "Update a specific script notification.",
  GM_setClipboard: "Write to the system clipboard.",
  GM_registerMenuCommand: "Register a script menu command.",
  GM_unregisterMenuCommand: "Unregister a script menu command.",
  CAT_registerMenuInput: "ScriptCat API: register a script menu command with an input field.",
  CAT_unregisterMenuInput: "ScriptCat API: unregister a script menu command with an input field.",
  GM_addStyle: "Inject CSS into the page.",
  GM_addElement: "Create and insert an element into the page.",
  GM_getResourceText: "Read the text content of a resource declared with @resource.",
  GM_getResourceURL: "Get the URL of a resource declared with @resource.",
  GM_cookie: "Access the Cookie API to read, write, or delete cookies.",
  GM_audio: "Control and observe the current browser tab's mute and audible state.",
  CAT_fetchBlob: "ScriptCat internal API: read an extension-side accessible resource and return a Blob.",
  CAT_fileStorage: "ScriptCat API: access script file storage.",
  CAT_userConfig: "ScriptCat API: access script user configuration.",
  CAT_scriptLoaded: "ScriptCat API: wait until the script is fully loaded in @early-start scenarios.",
  "window.close": "Allow the script to call window.close().",
  "window.focus": "Allow the script to call window.focus().",
  "window.onurlchange": "Allow the script to listen for URL change events.",
} as const;

export default {
  title: "English",
  thisIsAUserScript: "A user script",
  undefinedPrompt: "Undefined Prompt",
  quickfix: "Fix {0} Issue",
  addEslintDisableNextLine: "Add eslint-disable-next-line Comment",
  addEslintDisable: "Add eslint-disable Comment",
  declareGlobal: "Declare '{0}' as a global variable (/* global */)",
  removeConnectWildcard: "Remove @connect wildcard: {0}",
  replaceMatchTldWildcardWithInclude: "Replace @match TLD wildcard with @include {0}",
  replaceIncludeWithMatch: "Replace @include with @match {0}",
  grantConflict: "@grant none cannot be used with GM APIs. Remove none or all GM APIs.",
  grantValuePrompts,
  prompt: {
    name: "Script name",
    namespace: "Script namespace",
    copyright: "Script copyright information",
    license: "Script open-source license",
    version: "Script version",
    description: "Script description",
    icon: "Script icon",
    iconURL: "Script icon",
    defaulticon: "Script icon",
    icon64: "64x64 script icon",
    icon64URL: "64x64 script icon",
    grant: "Request special script API permissions",
    author: "Script author",
    "run-at":
      "When the script runs<br>`document-start`: inject as early as possible after URL match<br>`document-end`: inject after DOM has loaded (images etc. may still load)<br>`document-idle`: inject after all content has finished loading<br>`document-body`: inject only when a body element exists",
    "run-in": "Environment in which the script is injected",
    homepage: "Script homepage",
    homepageURL: "Script homepage",
    website: "Script homepage",
    background: "Background script",
    include: "Pages whose URLs match and run this script",
    match: "Pages whose URLs match and run this script",
    exclude: "Pages whose URLs match and do NOT run this script",
    connect: "Sites the script can access",
    resource: "Imported resource files",
    require: "Imported external JS files",
    "require-css": "Imported external CSS files",
    noframes: "Do not run the script inside `<frame>`",
    compatible: "Compatibility information shown on GreasyFork",
    "inject-into":
      "Script injection context<br>`content`: inject into content context<br>`page`: inject into page context (default)<br>Note: SC does not support `inject-into: auto`, which chooses context based on CSP.",
    "early-start":
      "Used with `run-at: document-start`. `early-start` lets the script execute even earlier than the page, but may affect performance and limit GM APIs. (SC only)",
    unwrap:
      "Makes the user script bypass sandbox wrapping and be injected and executed directly in the page’s native global scope. <br>The script can directly access and modify the page’s real global variables, but will not be able to use user script privileged APIs such as GM.*. <br>Commonly used in scenarios that require deep interaction with native page scripts or when migrating from regular page scripts.",
    definition: "ScriptCat-only: URL of a `.d.ts` file used for editor auto-completion",
    antifeature: `Related to script markets: unwanted features should include this description value
referral-link: This script modifies or redirects to the author's referral link
ads: This script inserts ads on the pages you visit
payment: This script requires payment to be used properly
miner: This script engages in mining activities
membership: This script requires registration as a member to be used properly
tracking: This script tracks your user information`.replace(/\n/g, "<br>"),
    updateURL: "URL used to check for script updates",
    downloadURL: "URL used to download script updates",
    supportURL: "Support site / bug report page",
    source: "Script source code page",
    scriptUrl: "User script URL referenced by a subscription script",
    storageName: "Script value storage name, used to share one storage area across multiple scripts",
    tag: "Script tags, separated by commas or spaces",
    cloudCat: "Marks the script as exportable to a CloudCat cloud script package",
    cloudServer: "CloudCat cloud service used by the script",
    exportValue: "Script storage values to export when exporting as a cloud script",
    exportCookie: "Cookies to export when exporting as a cloud script",
    crontab: `Scheduled script crontab examples (not for cloud scripts)
* * * * * * Run every second
* * * * * Run every minute
0 */6 * * * Run once at minute 0 every 6 hours
15 */6 * * * Run once at minute 15 every 6 hours
* once * * * Run once every hour
* * once * * Run once every day
* 10 once * * Run once between 10:00-10:59 each day; if it runs at 10:04, it won't run again that day between 10:05-10:59
* 1,3,5 once * * Run once at 1:00, 3:00, 5:00 each day; if it runs at 1:00, it won't run again at 3:00 or 5:00
* */4 once * * Check and run once every 4 hours; if it runs at 4:00, it won't run again that day at 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Run once between 10:00-23:59 each day; if it runs at 10:04, it won't run again that day between 10:05-23:59
* once 13 * * Run once every hour on the 13th day of each month
* once(9-17) * * * Run once per hour during hours 9 to 17 each day
0,30 once * * * Run once per hour; whichever of minute 0 or 30 comes first, the other is skipped
* * once(9-18) * * Run once per day during the 9th to 18th of each month
* * * * once(1-5) Run once per week; only on weekdays Monday to Friday`.replace(/\n/g, "<br>"),
  },
} as const;

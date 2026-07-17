// @copyright https://github.com/silverwzw/Tampermonkey-Typescript-Declaration

declare const unsafeWindow: Window;

declare type ConfigType = "text" | "checkbox" | "select" | "mult-select" | "number" | "textarea" | "time";

declare interface Config {
  [key: string]: unknown;
  /** Config item title. */
  title: string;
  /** Config item description. */
  description: string;
  /** Default value. */
  default?: unknown;
  /** UI widget type. */
  type?: ConfigType;
  /** Binding key for two-way data flow. */
  bind?: string;
  /** Allowed values (for select/multi-select). */
  values?: unknown[];
  /** Whether to mask input (password field). */
  password?: boolean;
  /** Max string length (for text) or max numeric value (for number). */
  max?: number;
  /** Min numeric value. */
  min?: number;
  /** Number of rows (for textarea). */
  rows?: number;
  /** Sort index among config items. */
  index: number;
}

declare type UserConfig = { [key: string]: { [key: string]: Config } };

/** Script and environment metadata, compatible with Tampermonkey's `GM_info`. */
declare const GM_info: {
  /** ScriptCat version string. */
  version: string;
  /** Whether auto-update is enabled for this script. */
  scriptWillUpdate: boolean;
  /** Always `"ScriptCat"`. */
  scriptHandler: "ScriptCat";
  scriptUpdateURL?: string;
  scriptMetaStr?: string;
  userConfig?: UserConfig;
  userConfigStr?: string;
  /** Whether running in an incognito/private window. */
  isIncognito: boolean;
  /** Sandbox mode (ScriptCat always uses `"raw"`). */
  sandboxMode: "raw";
  userAgentData: {
    brands?: { brand: string; version: string }[];
    mobile?: boolean;
    platform?: string;
    architecture?: string;
    bitness?: string;
  };
  /** Download mode (ScriptCat uses `"native"`). */
  downloadMode: "native";
  /** Metadata parsed from the script header. */
  script: {
    author?: string;
    description?: string;
    grant: string[];
    header: string;
    icon?: string;
    icon64?: string;
    includes?: string[];
    matches: string[];
    name: string;
    namespace?: string;
    "run-at": string;
    "run-in": string[];
    version: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

// ===========================================================================
// GM_* functions (Greasemonkey/Tampermonkey compatible, synchronous style)
// ===========================================================================

/** List all stored value keys. */
declare function GM_listValues(): string[];

/** Listen for changes to a stored value. Returns a listener ID. */
declare function GM_addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): number;

/** Remove a value change listener by ID. */
declare function GM_removeValueChangeListener(listenerId: number): void;

/** Store a value. */
declare function GM_setValue(name: string, value: any): void;

/** Store multiple values at once. Keys are value names. */
declare function GM_setValues(values: { [key: string]: any }): void;

/** Retrieve a stored value (returns `defaultValue` if not found). */
declare function GM_getValue(name: string, defaultValue?: any): any;

/**
 * Retrieve multiple values. If `keysOrDefaults` is an object, its values are used as defaults.
 * If it is an array, each element is a key name (no defaults).
 */
declare function GM_getValues(keysOrDefaults: { [key: string]: any } | string[] | null | undefined): {
  [key: string]: any;
};

/** Delete a stored value. */
declare function GM_deleteValue(name: string): void;

/** Delete multiple stored values. */
declare function GM_deleteValues(names: string[]): void;

/** Log a message with optional level and structured labels. */
declare function GM_log(message: string, level?: GMTypes.LoggerLevel, ...labels: GMTypes.LoggerLabel[]): void;

/** Get the text content of a `@resource` by name. */
declare function GM_getResourceText(name: string): string | undefined;

/** Get a URL (data: or blob:) for a `@resource` by name. */
declare function GM_getResourceURL(name: string, isBlobUrl?: boolean): string | undefined;

/** Register a menu command in the ScriptCat popup. */
declare function GM_registerMenuCommand(
  name: string,
  listener?: (inputValue?: any) => void,
  options_or_accessKey?:
    | {
        id?: number | string;
        /** Keyboard shortcut key. */
        accessKey?: string;
        /** Whether clicking the menu closes the popup (default: true). */
        autoClose?: boolean;
        /** SC extension: nest under a parent menu (default: true). `false` promotes to browser context menu. */
        nested?: boolean;
        /** SC extension: do not merge identical menu items (default: false). */
        individual?: boolean;
      }
    | string
): number;

/** Unregister a menu command by ID. */
declare function GM_unregisterMenuCommand(id: number): void;

/**
 * Register a menu item with an input field, allowing the user to enter a value.
 * The callback receives the user's input.
 */
declare function CAT_registerMenuInput(
  name: string,
  listener?: (inputValue?: any) => void,
  options_or_accessKey?:
    | {
        id?: number | string;
        accessKey?: string;
        autoClose?: boolean;
        nested?: boolean;
        individual?: boolean;
        /** Input widget type. */
        inputType?: "text" | "number" | "boolean";
        /** Dialog title (for the input popup). */
        title?: string;
        /** Label shown next to the input. */
        inputLabel?: string;
        /** Default value for the input. */
        inputDefaultValue?: string | number | boolean;
        /** Placeholder text. */
        inputPlaceholder?: string;
      }
    | string
): number;

/** Unregister a menu input (alias of `GM_unregisterMenuCommand`). */
declare const CAT_unregisterMenuInput: typeof GM_unregisterMenuCommand;

/** Wait for the script to be fully loaded. Used with `@early-start`. */
declare function CAT_scriptLoaded(): Promise<void>;

/** Create a blob URL from a Blob object. ScriptCat manages the URL lifecycle. */
declare function CAT_createBlobUrl(blob: Blob): Promise<string>;

/** Fetch a blob URL and return the Blob data. Helper for `GM_xmlhttpRequest` stream responses. */
declare function CAT_fetchBlob(url: string): Promise<Blob>;

/** Fetch a URL and parse it as a Document (in the content page context if available). */
declare function CAT_fetchDocument(url: string): Promise<Document | undefined>;

/** Open a URL in a new tab. Returns a Tab handle (or `undefined` if context is invalid). */
declare function GM_openInTab(url: string, options: GMTypes.OpenTabOptions): GMTypes.Tab | undefined;
declare function GM_openInTab(url: string, loadInBackground: boolean): GMTypes.Tab | undefined;
declare function GM_openInTab(url: string): GMTypes.Tab | undefined;

/** Close a tab opened by `GM_openInTab`. */
declare function GM_closeInTab(tabId: string): void;

/** Perform a cross-origin XMLHttpRequest. Requires `@connect` for the target domain. */
declare function GM_xmlhttpRequest(details: GMTypes.XHRDetails): GMTypes.AbortHandle<void>;

/** Download a file. */
declare function GM_download(details: GMTypes.DownloadDetails<string | Blob | File>): GMTypes.AbortHandle<boolean>;
declare function GM_download(url: string, filename: string): GMTypes.AbortHandle<boolean>;

/** Get the tab's persistent storage object. */
declare function GM_getTab(callback: (tab: object) => void): void;

/** Save the tab's persistent storage object. */
declare function GM_saveTab(tab: object): void;

/** Get all tabs' persistent storage objects. */
declare function GM_getTabs(callback: (tabs: { [key: number]: object }) => void): void;

/** Show a desktop notification. */
declare function GM_notification(details: GMTypes.NotificationDetails, ondone?: GMTypes.NotificationOnDone): void;
declare function GM_notification(
  text: string,
  title: string,
  image: string,
  onclick?: GMTypes.NotificationOnClick
): void;

/** Close a notification by ID. */
declare function GM_closeNotification(id: string): void;

/** Update a notification by ID. */
declare function GM_updateNotification(id: string, details: GMTypes.NotificationDetails): void;

/** Copy text to the clipboard. */
declare function GM_setClipboard(data: string, info?: string | { type?: string; mimetype?: string }): void;

/** Add a DOM element to the page. */
declare function GM_addElement(tag: string, attributes: Record<string, string | number | boolean>): Element | undefined;
declare function GM_addElement(
  parentNode: Node,
  tag: string,
  attrs: Record<string, string | number | boolean>
): Element | undefined;

/** Inject a CSS stylesheet into the page. */
declare function GM_addStyle(css: string): Element | undefined;

/**
 * Perform cookie operations. Both `name` and `domain` cannot be empty simultaneously.
 * @param action - `"list"` | `"set"` | `"delete"`
 */
declare function GM_cookie(
  action: GMTypes.CookieAction,
  details: GMTypes.CookieDetails,
  ondone: (cookie: GMTypes.Cookie[], error: unknown | undefined) => void
): void;

// ===========================================================================
// GM.* object (Greasemonkey 4 / Tampermonkey 4+ Promise-style API)
// ===========================================================================

/** Promise-based API object. Each method corresponds to a `GM_*` function. */
declare const GM: {
  /** Script and environment metadata (same as `GM_info`). */
  readonly info: typeof GM_info;

  /** Retrieve a stored value. */
  getValue<T = any>(name: string, defaultValue?: T): Promise<T>;

  /** Retrieve multiple stored values. If `keysOrDefaults` is an object, values are used as defaults. */
  getValues(keysOrDefaults: { [key: string]: any } | string[] | null | undefined): Promise<{ [key: string]: any }>;

  /** Store a value. */
  setValue(name: string, value: any): Promise<void>;

  /** Store multiple values at once. */
  setValues(values: { [key: string]: any }): Promise<void>;

  /** Delete a stored value. */
  deleteValue(name: string): Promise<void>;

  /** Delete multiple stored values. */
  deleteValues(names: string[]): Promise<void>;

  /** List all stored value keys. */
  listValues(): Promise<string[]>;

  /** Listen for changes to a stored value. */
  addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): Promise<number>;
  /** Remove a value change listener. */
  removeValueChangeListener(listenerId: number): Promise<void>;

  /** Log a message with optional level and structured labels. */
  log(message: string, level?: GMTypes.LoggerLevel, ...labels: GMTypes.LoggerLabel[]): Promise<void>;

  /** Get the text content of a `@resource`. */
  getResourceText(name: string): Promise<string | undefined>;

  /** Get a URL for a `@resource`. */
  getResourceURL(name: string, isBlobUrl?: boolean): Promise<string | undefined>;

  /** Register a menu command. */
  registerMenuCommand(
    name: string,
    listener?: (inputValue?: any) => void,
    options_or_accessKey?:
      | {
          id?: number | string;
          accessKey?: string;
          autoClose?: boolean;
          title?: string;
          /** SC extension: menu icon URL. */
          icon?: string;
          /** SC extension: alias for `autoClose`. */
          closeOnClick?: boolean;
        }
      | string
  ): Promise<number | string | undefined>;

  /** Unregister a menu command. */
  unregisterMenuCommand(id: number | string): Promise<void>;

  /** Inject a CSS stylesheet. */
  addStyle(css: string): Promise<Element | undefined>;

  /** Show a desktop notification. */
  notification(details: GMTypes.NotificationDetails, ondone?: GMTypes.NotificationOnDone): Promise<void>;
  notification(text: string, title: string, image: string, onclick?: GMTypes.NotificationOnClick): Promise<void>;
  /** Close a notification. */
  closeNotification(id: string): Promise<void>;
  /** Update a notification. */
  updateNotification(id: string, details: GMTypes.NotificationDetails): Promise<void>;

  /** Copy text to the clipboard. */
  setClipboard(data: string, info?: string | { type?: string; mimetype?: string }): Promise<void>;

  /** Add a DOM element. */
  addElement(tag: string, attributes: Record<string, string | number | boolean>): Promise<HTMLElement>;
  addElement(parentNode: Node, tag: string, attrs: Record<string, string | number | boolean>): Promise<HTMLElement>;

  /** Perform a cross-origin XMLHttpRequest. The returned Promise also has an `.abort()` method. */
  xmlHttpRequest(details: GMTypes.XHRDetails): Promise<GMTypes.XHRResponse> & GMTypes.AbortHandle<void>;

  /** Download a file. */
  download(details: GMTypes.DownloadDetails<string | Blob | File>): Promise<boolean>;
  download(url: string, filename: string): Promise<boolean>;

  /** Get the tab's persistent storage object. */
  getTab(): Promise<object>;
  /** Save the tab's persistent storage object. */
  saveTab(tab: object): Promise<void>;
  /** Get all tabs' persistent storage objects. */
  getTabs(): Promise<{ [key: number]: object }>;

  /** Open a URL in a new tab. */
  openInTab(url: string, options: GMTypes.OpenTabOptions): Promise<GMTypes.Tab | undefined>;
  openInTab(url: string, loadInBackground: boolean): Promise<GMTypes.Tab | undefined>;
  openInTab(url: string): Promise<GMTypes.Tab | undefined>;

  /** Close a tab opened by `openInTab`. */
  closeInTab(tabId: string): Promise<void>;

  /** Cookie operations with sub-methods. */
  cookie: {
    (action: GMTypes.CookieAction, details: GMTypes.CookieDetails): Promise<GMTypes.Cookie[]>;
    /** Set a cookie. */
    set(details: GMTypes.CookieDetails): Promise<GMTypes.Cookie[]>;
    /** List cookies matching the filter. */
    list(details: GMTypes.CookieDetails): Promise<GMTypes.Cookie[]>;
    /** Delete a cookie. */
    delete(details: GMTypes.CookieDetails): Promise<GMTypes.Cookie[]>;
  };
};

// ===========================================================================
// CAT_* functions (ScriptCat-specific extensions)
// ===========================================================================

/**
 * Set browser proxy rules.
 * @deprecated Removed in stable release; may return in beta.
 */
declare function CAT_setProxy(rule: CATType.ProxyRule[] | string): void;

/**
 * Clear all proxy rules.
 * @deprecated Removed in stable release; may return in beta.
 */
declare function CAT_clearProxy(): void;

/**
 * Simulate a real click at coordinates (x, y).
 * @deprecated Removed in stable release; may return in beta.
 */
declare function CAT_click(x: number, y: number): void;

/** Open the script's user configuration page. */
declare function CAT_userConfig(): void;

/**
 * Interact with the managed file storage system.
 * Creates an `app/<uuid>` directory for this script (or uses `baseDir`).
 * Upload overwrites files with the same name.
 * @param action - `"list"` | `"upload"` | `"download"` | `"delete"` | `"config"`
 */
declare function CAT_fileStorage(
  action: "list",
  details: {
    /** Directory path to list. */
    path?: string;
    /** Base directory; defaults to the script's UUID. */
    baseDir?: string;
    onload?: (files: CATType.FileStorageFileInfo[]) => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
declare function CAT_fileStorage(
  action: "download",
  details: {
    /** File info object (some platforms need the file hash). */
    file: CATType.FileStorageFileInfo;
    onload: (data: Blob) => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
declare function CAT_fileStorage(
  action: "delete",
  details: {
    /** File path to delete. */
    path: string;
    onload?: () => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
declare function CAT_fileStorage(
  action: "upload",
  details: {
    /** Destination file path. */
    path: string;
    /** Base directory; defaults to the script's UUID. */
    baseDir?: string;
    /** File data to upload. */
    data: Blob;
    onload?: () => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
/** Open the file storage configuration page. */
declare function CAT_fileStorage(action: "config"): void;

/**
 * Retry error for background scripts. Throw this to make ScriptCat retry later.
 * Minimum retry interval is 5 seconds. Avoid overlapping with the script's own schedule.
 */
declare class CATRetryError {
  /** @param message - Error message. @param seconds - Retry after N seconds. */
  constructor(message: string, seconds: number);
  /** @param message - Error message. @param date - Retry at a specific time. */
  constructor(message: string, date: Date);
}

// ===========================================================================
// CATType namespace (ScriptCat-specific types)
// ===========================================================================

declare namespace CATType {
  interface ProxyRule {
    proxyServer: ProxyServer;
    matchUrl: string[];
  }

  type ProxyScheme = "http" | "https" | "quic" | "socks4" | "socks5";

  interface ProxyServer {
    scheme?: ProxyScheme;
    host: string;
    port?: number;
  }

  interface FileStorageError {
    /**
     * Error code:
     * -1 = unknown, 1 = storage not configured, 2 = config error, 3 = path not found,
     * 4 = upload failed, 5 = download failed, 6 = delete failed,
     * 7 = disallowed file path, 8 = network error
     */
    code: -1 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    error: string;
  }

  interface FileStorageFileInfo {
    /** File name. */
    name: string;
    /** Relative file path. */
    path: string;
    /** Absolute path in the storage space. */
    absPath: string;
    /** File size in bytes. */
    size: number;
    /** File content digest/hash. */
    digest: string;
    /** Creation timestamp. */
    createtime: number;
    /** Last modification timestamp. */
    updatetime: number;
  }

  type CATFileStorageDetails = {
    baseDir: string;
    path: string;
    filename: any;
    file: FileStorageFileInfo;
    data?: string;
  };
}

// ===========================================================================
// GMTypes namespace (Greasemonkey/Tampermonkey compatible types)
// ===========================================================================

declare namespace GMTypes {
  type CookieAction = "list" | "delete" | "set";

  type LoggerLevel = "debug" | "info" | "warn" | "error";

  type LoggerLabel = {
    [key: string]: string | boolean | number | undefined;
  };

  interface CookieDetailsPartitionKeyType {
    topLevelSite?: string;
  }

  interface CookieDetails {
    url?: string;
    name?: string;
    value?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    session?: boolean;
    httpOnly?: boolean;
    expirationDate?: number;
    partitionKey?: CookieDetailsPartitionKeyType;
  }

  interface Cookie {
    domain: string;
    name: string;
    value: string;
    session: boolean;
    hostOnly: boolean;
    expirationDate?: number;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
  }

  /** Value change listener. `tabid` is only available for background script listeners. */
  type ValueChangeListener = (
    name: string,
    oldValue: unknown,
    newValue: unknown,
    remote: boolean,
    tabid?: number
  ) => unknown;

  interface OpenTabOptions {
    /**
     * Whether the new tab gains focus immediately.
     * - `true` — tab opens in foreground.
     * - `false` — tab opens in background.
     * @default true
     */
    active?: boolean;

    /**
     * Tab insertion position.
     * - `true` / `1` — insert after the current tab.
     * - `false` — append to the end of the window.
     * - `0` — insert before the current tab.
     * @default true
     */
    insert?: boolean | number;

    /**
     * Set the opener tab ID so browsers can track parent-child relationships.
     * @default true
     */
    setParent?: boolean;

    /**
     * Open in an incognito/private window.
     * Note: ScriptCat uses `"incognito": "split"` — in a normal window,
     * tabId/windowId will not be available.
     * @default false
     */
    incognito?: boolean;

    /**
     * Legacy field (TM only). Semantics are the **opposite** of `active`:
     * `true` = background, `false` = foreground.
     * @default false
     * @deprecated Use `active` instead.
     */
    loadInBackground?: boolean;

    /**
     * Pin the new tab in the browser tab bar.
     * @default false
     */
    pinned?: boolean;

    /**
     * Use `window.open` instead of `chrome.tabs.create`.
     * Useful for special protocols like `vscode://`, `m3u8dl://`.
     * Other options are ignored in this mode.
     * @default false
     */
    useOpen?: boolean;
  }

  type SWOpenTabOptions = OpenTabOptions & Required<Pick<OpenTabOptions, "active">>;

  /**
   * XMLHttpRequest readyState values.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/readyState
   */
  type ReadyState =
    | 0 // UNSENT
    | 1 // OPENED
    | 2 // HEADERS_RECEIVED
    | 3 // LOADING
    | 4; // DONE

  interface XHRResponse {
    finalUrl?: string;
    readyState?: ReadyState;
    responseHeaders?: string;
    status?: number;
    statusText?: string;
    response?: string | Blob | ArrayBuffer | Document | ReadableStream<Uint8Array<ArrayBufferLike>> | null | undefined;
    responseText?: string | undefined;
    responseXML?: Document | null | undefined;
    responseType?: "text" | "arraybuffer" | "blob" | "json" | "document" | "stream" | "";
  }

  interface XHRProgress extends XHRResponse {
    done: number;
    lengthComputable: boolean;
    loaded: number;
    position?: number;
    total: number;
    totalSize: number;
  }

  type Listener<OBJ> = (event: OBJ) => unknown;
  type ContextType = unknown;

  type GMXHRDataType = string | Blob | File | BufferSource | FormData | URLSearchParams;

  interface XHRDetails {
    method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
    url: string | URL | File | Blob;
    headers?: { [key: string]: string };
    data?: GMXHRDataType;
    cookie?: string;
    binary?: boolean;
    timeout?: number;
    context?: ContextType;
    /** Response type. `"stream"` support is rudimentary in the current version. */
    responseType?: "text" | "arraybuffer" | "blob" | "json" | "document" | "stream";
    overrideMimeType?: string;
    /** Send request without cookies (Tampermonkey compatible). */
    anonymous?: boolean;
    /** Send request without cookies (Greasemonkey compatible). */
    mozAnon?: boolean;
    /** Force using the Fetch API internally. */
    fetch?: boolean;
    user?: string;
    password?: string;
    /** Disable caching. */
    nocache?: boolean;
    /** Force revalidation: allow cache but revalidate before using. */
    revalidate?: boolean;
    /** Redirect handling. Forces fetch mode internally. */
    redirect?: "follow" | "error" | "manual";
    /** Partitioned cookie key for storage partitioning. */
    cookiePartition?: Record<string, any> & { topLevelSite?: string };

    onload?: Listener<XHRResponse>;
    onloadstart?: Listener<XHRResponse>;
    onloadend?: Listener<XHRResponse>;
    onprogress?: Listener<XHRProgress>;
    onreadystatechange?: Listener<XHRResponse>;
    ontimeout?: Listener<XHRResponse>;
    onabort?: Listener<XHRResponse>;
    onerror?: (err: string | (XHRResponse & { error: string })) => void;
  }

  interface AbortHandle<RETURN_TYPE> {
    abort(): RETURN_TYPE;
  }

  interface DownloadError {
    error: "not_enabled" | "not_whitelisted" | "not_permitted" | "not_supported" | "not_succeeded" | "unknown";
    details?: string;
  }

  interface DownloadDetails<URL> {
    // Standard parameters (TM/SC)
    url: URL;
    name: string;
    headers?: { [key: string]: string };
    saveAs?: boolean;
    conflictAction?: "uniquify" | "overwrite" | "prompt";

    // Extended parameters (SC/VM)
    timeout?: number;
    anonymous?: boolean;
    context?: ContextType;
    user?: string;
    password?: string;

    // SC-only parameters
    method?: "GET" | "POST";
    downloadMode?: "native" | "browser";
    cookie?: string;

    // Callbacks
    onload?: Listener<object>;
    onerror?: Listener<DownloadError>;
    onprogress?: Listener<{
      done: number;
      lengthComputable: boolean;
      loaded: number;
      position?: number;
      total: number;
      totalSize: number;
    }>;
    ontimeout?: (arg1?: any) => void;
  }

  interface NotificationThis extends NotificationDetails {
    id: string;
  }

  type NotificationOnClickEvent = {
    event: "click" | "buttonClick";
    id: string;
    isButtonClick: boolean;
    buttonClickIndex: number | undefined;
    byUser: boolean | undefined;
    preventDefault: () => void;
    highlight: NotificationDetails["highlight"];
    image: NotificationDetails["image"];
    silent: NotificationDetails["silent"];
    tag: NotificationDetails["tag"];
    text: NotificationDetails["text"];
    timeout: NotificationDetails["timeout"];
    title: NotificationDetails["title"];
    url: NotificationDetails["url"];
  };
  type NotificationOnClick = (this: NotificationThis, event: NotificationOnClickEvent) => unknown;
  type NotificationOnDone = (this: NotificationThis, user?: boolean) => unknown;

  interface NotificationButton {
    title: string;
    iconUrl?: string;
  }

  interface NotificationDetails {
    text?: string;
    title?: string;
    tag?: string;
    image?: string;
    highlight?: boolean;
    silent?: boolean;
    timeout?: number;
    url?: string;
    onclick?: NotificationOnClick;
    ondone?: NotificationOnDone;
    progress?: number;
    oncreate?: NotificationOnClick;
    /** Max 2 buttons. */
    buttons?: NotificationButton[];
  }

  interface Tab {
    close(): void;
    onclose?: () => void;
    closed?: boolean;
    name?: string;
  }

  type GMClipboardInfo = string | { type?: string; mimetype?: string };
}

// ===========================================================================
// CAT.agent — ScriptCat Agent API
// @grant CAT.agent.conversation / CAT.agent.dom /
//        CAT.agent.task / CAT.agent.skills
// ===========================================================================

/** CAT Agent conversation, content blocks, and streaming types. */
declare namespace CATAgent {
  // ---- Content Block types ----

  /** Plain text content block. */
  type TextBlock = { type: "text"; text: string };

  /** Image content block. Data is stored in OPFS and referenced by `attachmentId`. */
  type ImageBlock = { type: "image"; attachmentId: string; mimeType: string; name?: string };

  /** File content block. */
  type FileBlock = { type: "file"; attachmentId: string; mimeType: string; name: string; size?: number };

  /** Audio content block. */
  type AudioBlock = {
    type: "audio";
    attachmentId: string;
    mimeType: string;
    name?: string;
    /** Duration in milliseconds. */
    durationMs?: number;
  };

  /** Union of all content block types. */
  type ContentBlock = TextBlock | ImageBlock | FileBlock | AudioBlock;

  /** Message content: plain string or an array of content blocks (multimodal). */
  type MessageContent = string | ContentBlock[];

  // ---- Tool types ----

  /**
   * Tool definition with an inline handler function.
   * Use in `ConversationCreateOptions.tools` or `ChatOptions.tools`
   * to register tools that the LLM can call.
   */
  interface ToolDefinition {
    /** Unique tool name. */
    name: string;
    /** Human-readable description. */
    description: string;
    /** JSON Schema describing the tool parameters. */
    parameters: Record<string, unknown>;
    /** Handler invoked when the LLM calls this tool. */
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }

  /**
   * Custom command handler. Commands are prefixed with `/` (e.g. `/new`).
   * Return a string to display as the reply, or void.
   */
  type CommandHandler = (args: string, conv: ConversationInstance) => Promise<string | void>;

  // ---- Conversation options ----

  /** Options for creating a new conversation via `CAT.agent.conversation.create()`. */
  interface ConversationCreateOptions {
    /** Custom conversation ID; auto-generated if omitted. */
    id?: string;
    /** System prompt. */
    system?: string;
    /** Model ID; uses the default model if omitted. */
    model?: string;
    /** Max tool-calling loop iterations (default: 20). */
    maxIterations?: number;
    /** Skills to load: `"auto"` loads all installed skills, or specify names. */
    skills?: "auto" | string[];
    /** Tools with inline handlers, available for the lifetime of this conversation. */
    tools?: ToolDefinition[];
    /**
     * Custom slash-command handlers (e.g. `{ "/reset": handler }`).
     * The built-in `/new` command (clear conversation) can be overridden.
     */
    commands?: Record<string, CommandHandler>;
    /**
     * Ephemeral mode: messages are kept in memory only, not persisted.
     * Built-in tools/skills are NOT loaded; the script must supply all tools.
     */
    ephemeral?: boolean;
    /** Enable prompt caching. Defaults to true. */
    cache?: boolean;
  }

  /** Options for a single `chat()` / `chatStream()` call. */
  interface ChatOptions {
    /** Additional tools for this call only (merged with conversation-level tools). */
    tools?: ToolDefinition[];
  }

  // ---- Tool call ----

  /** Attachment metadata for tool results and messages. */
  interface Attachment {
    /** Attachment ID. */
    id: string;
    /** Attachment type. */
    type: "image" | "file" | "audio";
    /** File name. */
    name: string;
    /** MIME type (e.g. "image/jpeg", "application/zip"). */
    mimeType: string;
    /** File size in bytes. */
    size?: number;
  }

  /** Record of a tool call made by the LLM. */
  interface ToolCallInfo {
    /** Unique call ID. */
    id: string;
    /** Tool name. */
    name: string;
    /** JSON-serialized arguments. */
    arguments: string;
    /** Tool execution result (populated after execution). */
    result?: string;
    /** Attachments from tool execution (e.g. screenshots, files). */
    attachments?: Attachment[];
    /** Call status. */
    status?: "pending" | "running" | "completed" | "error";
  }

  // ---- Chat reply ----

  /** Result of a non-streaming `chat()` call. */
  interface ChatReply {
    /** Response content. */
    content: MessageContent;
    /** Model thinking/reasoning text (if available). */
    thinking?: string;
    /** Tool calls made during this turn. */
    toolCalls?: ToolCallInfo[];
    /** Token usage. */
    usage?: { inputTokens: number; outputTokens: number };
    /** `true` when the reply was produced by a command handler, not the LLM. */
    command?: boolean;
  }

  /** A single chunk emitted during streaming via `chatStream()`. */
  interface StreamChunk {
    /**
     * Chunk type:
     * - `"content_delta"` — incremental text
     * - `"thinking_delta"` — incremental thinking/reasoning
     * - `"tool_call"` — a tool call event
     * - `"content_block"` — a complete non-text content block
     * - `"done"` — stream finished
     * - `"error"` — an error occurred
     */
    type: "content_delta" | "thinking_delta" | "tool_call" | "content_block" | "done" | "error";
    /** Text delta (for content_delta / thinking_delta). */
    content?: string;
    /** Complete content block (for content_block). */
    block?: ContentBlock;
    /** Tool call info (for tool_call). */
    toolCall?: ToolCallInfo;
    /** Token usage (for done). */
    usage?: { inputTokens: number; outputTokens: number };
    /** Error message (for error). */
    error?: string;
    /** Error classification: `"rate_limit"` | `"auth"` | `"tool_timeout"` | `"max_iterations"` | `"api_error"` */
    errorCode?: string;
    /** `true` when the chunk was produced by a command handler. */
    command?: boolean;
  }

  // ---- Chat message ----

  /** A persisted chat message in a conversation. */
  interface ChatMessage {
    /** Message ID. */
    id: string;
    /** Parent conversation ID. */
    conversationId: string;
    /** Message role. */
    role: "user" | "assistant" | "system" | "tool";
    /** Message content (text or multimodal). */
    content: MessageContent;
    /** Model thinking/reasoning block. */
    thinking?: { content: string };
    /** Tool calls in this message. */
    toolCalls?: ToolCallInfo[];
    /** Associated tool_call ID (for role="tool" messages). */
    toolCallId?: string;
    /** Error message (if the turn errored). */
    error?: string;
    /** Model ID used for this message. */
    modelId?: string;
    /** Token usage for this message. */
    usage?: {
      inputTokens: number;
      outputTokens: number;
      /** Anthropic cache creation input tokens. */
      cacheCreationInputTokens?: number;
      /** Anthropic cache read input tokens. */
      cacheReadInputTokens?: number;
    };
    /** Total response duration in ms. */
    durationMs?: number;
    /** Time-to-first-token in ms. */
    firstTokenMs?: number;
    /** Parent message ID (for branching). */
    parentId?: string;
    /** Creation timestamp. */
    createtime: number;
  }

  // ---- Conversation instance ----

  /**
   * A conversation instance returned by `CAT.agent.conversation.create()` or `.get()`.
   * Provides methods for chatting, streaming, and managing message history.
   */
  interface ConversationInstance {
    /** Conversation ID. */
    readonly id: string;
    /** Conversation title. */
    readonly title: string;
    /** Model ID used. */
    readonly modelId: string;

    /** Send a message and wait for the full reply (with automatic tool-calling loop). */
    chat(content: MessageContent, options?: ChatOptions): Promise<ChatReply>;

    /** Send a message and receive a streaming response. */
    chatStream(content: MessageContent, options?: ChatOptions): Promise<AsyncIterable<StreamChunk>>;

    /** Get all messages in this conversation. */
    getMessages(): Promise<ChatMessage[]>;

    /** Clear all messages in this conversation. */
    clear(): Promise<void>;

    /** Persist the conversation to storage. */
    save(): Promise<void>;
  }

  // ---- Conversation API ----

  /**
   * `CAT.agent.conversation` — create and retrieve conversation instances.
   * @grant CAT.agent.conversation
   */
  interface ConversationAPI {
    /** Create a new conversation. */
    create(options?: ConversationCreateOptions): Promise<ConversationInstance>;

    /** Get an existing conversation by ID. Returns `null` if not found. */
    get(id: string): Promise<ConversationInstance | null>;
  }
}

// ---- CAT.agent.dom — Browser DOM automation API ----

/** DOM automation types — interact with browser tabs, pages, and elements. */
declare namespace CATAgentDom {
  /** Information about a browser tab. */
  interface TabInfo {
    /** Tab ID. */
    tabId: number;
    /** Current URL. */
    url: string;
    /** Page title. */
    title: string;
    /** Whether the tab is active. */
    active: boolean;
    /** Window ID. */
    windowId: number;
    /** Whether the tab is discarded (unloaded from memory). */
    discarded: boolean;
  }

  /** Result of a DOM action (click, fill, etc.). */
  interface ActionResult {
    /** Whether the action succeeded. */
    success: boolean;
    /** Whether a navigation occurred as a result. */
    navigated?: boolean;
    /** Current URL after the action. */
    url?: string;
    /** New tab opened as a result. */
    newTab?: { tabId: number; url: string };
  }

  /** Page content returned by `readPage()`. */
  interface PageContent {
    /** Page title. */
    title: string;
    /** Page URL. */
    url: string;
    /** HTML content (or selected fragment). */
    html: string;
    /** Whether the content was truncated due to `maxLength`. */
    truncated?: boolean;
    /** Original total length before truncation. */
    totalLength?: number;
  }

  /** Options for `readPage()`. */
  interface ReadPageOptions {
    /** Target tab ID; defaults to the active tab. */
    tabId?: number;
    /** CSS selector to read a specific element. */
    selector?: string;
    /** Maximum content length in characters. */
    maxLength?: number;
    /** Tags/selectors to remove before reading (e.g. `["script", "style", "svg"]`). */
    removeTags?: string[];
  }

  /** Options for DOM actions (click, fill). */
  interface DomActionOptions {
    /** Target tab ID. */
    tabId?: number;
    /** Use trusted (CDP-dispatched) events instead of synthetic JS events. */
    trusted?: boolean;
  }

  /** Options for `screenshot()`. */
  interface ScreenshotOptions {
    /** Target tab ID. */
    tabId?: number;
    /** JPEG quality (0–100). */
    quality?: number;
    /** Capture the full scrollable page. */
    fullPage?: boolean;
    /** CSS selector to capture a specific element region. */
    selector?: string;
    /** OPFS workspace relative path to save the binary screenshot. */
    saveTo?: string;
  }

  /** Result of a `screenshot()` call. */
  interface ScreenshotResult {
    /** Base64-encoded data URL. */
    dataUrl: string;
    /** OPFS path (when `saveTo` is used). */
    path?: string;
    /** File size in bytes (when `saveTo` is used). */
    size?: number;
  }

  /** Options for `navigate()`. */
  interface NavigateOptions {
    /** Target tab ID. */
    tabId?: number;
    /** Wait until the page is fully loaded. */
    waitUntil?: boolean;
    /** Navigation timeout in ms. */
    timeout?: number;
  }

  /** Scroll direction. */
  type ScrollDirection = "up" | "down" | "top" | "bottom";

  /** Options for `scroll()`. */
  interface ScrollOptions {
    /** Target tab ID. */
    tabId?: number;
    /** Scroll within a specific element. */
    selector?: string;
  }

  /** Result of a scroll operation. */
  interface ScrollResult {
    /** Current scroll position. */
    scrollTop: number;
    /** Total scrollable height. */
    scrollHeight: number;
    /** Visible viewport height. */
    clientHeight: number;
    /** Whether scrolled to the bottom. */
    atBottom: boolean;
  }

  /** Result of a `navigate()` call. */
  interface NavigateResult {
    /** Tab ID. */
    tabId: number;
    /** Final URL after navigation. */
    url: string;
    /** Page title. */
    title: string;
  }

  /** Options for `waitFor()`. */
  interface WaitForOptions {
    /** Target tab ID. */
    tabId?: number;
    /** Timeout in ms. */
    timeout?: number;
  }

  /** Result of `waitFor()`. */
  interface WaitForResult {
    /** Whether the element was found. */
    found: boolean;
    /** Element details (when found). */
    element?: {
      selector: string;
      tag: string;
      text: string;
      role?: string;
      type?: string;
      visible: boolean;
    };
  }

  /** Options for `executeScript()`. */
  interface ExecuteScriptOptions {
    /** Target tab ID. */
    tabId?: number;
  }

  /** Result of `stopMonitor()` — collected DOM changes during monitoring. */
  interface MonitorResult {
    /** Dialogs captured during monitoring. */
    dialogs: Array<{ type: string; message: string }>;
    /** DOM nodes added during monitoring. */
    addedNodes: Array<{ tag: string; id?: string; class?: string; role?: string; text: string }>;
  }

  /** Result of `peekMonitor()` — summary of DOM changes being monitored. */
  interface MonitorStatus {
    /** Whether any changes were detected. */
    hasChanges: boolean;
    /** Number of dialogs captured. */
    dialogCount: number;
    /** Number of added DOM nodes captured. */
    nodeCount: number;
  }

  /**
   * `CAT.agent.dom` — browser tab and DOM automation.
   * @grant CAT.agent.dom
   */
  interface DomAPI {
    /** List all open browser tabs. */
    listTabs(): Promise<TabInfo[]>;

    /** Navigate a tab to a URL. */
    navigate(url: string, options?: NavigateOptions): Promise<NavigateResult>;

    /** Read the HTML content of a page (or a selected element). */
    readPage(options?: ReadPageOptions): Promise<PageContent>;

    /** Capture a screenshot of a tab. */
    screenshot(options?: ScreenshotOptions): Promise<ScreenshotResult>;

    /** Click an element matching the CSS selector. */
    click(selector: string, options?: DomActionOptions): Promise<ActionResult>;

    /** Fill an input/textarea matching the CSS selector with the given value. */
    fill(selector: string, value: string, options?: DomActionOptions): Promise<ActionResult>;

    /** Scroll a page or element. */
    scroll(direction: ScrollDirection, options?: ScrollOptions): Promise<ScrollResult>;

    /** Wait for an element matching the CSS selector to appear. */
    waitFor(selector: string, options?: WaitForOptions): Promise<WaitForResult>;

    /** Execute JavaScript code in the page context. */
    executeScript(code: string, options?: ExecuteScriptOptions): Promise<unknown>;

    /** Start monitoring DOM changes on a tab (dialogs, added nodes). */
    startMonitor(tabId: number): Promise<void>;

    /** Stop monitoring and return collected changes (dialogs, added nodes). */
    stopMonitor(tabId: number): Promise<MonitorResult>;

    /** Peek at the current monitor status for a tab. */
    peekMonitor(tabId: number): Promise<MonitorStatus>;
  }
}

// ---- CAT.agent.task — Scheduled task API ----

/** Scheduled task types — create cron-based tasks that run agent conversations or emit events. */
declare namespace CATAgentTask {
  /** A scheduled agent task record. */
  interface AgentTask {
    /** Task ID. */
    id: string;
    /** Task name. */
    name: string;
    /** Cron expression. */
    crontab: string;
    /**
     * Execution mode:
     * - `"internal"` — Service Worker runs an LLM conversation automatically.
     * - `"event"` — Notifies the script via `addListener`.
     */
    mode: "internal" | "event";
    /** Whether the task is enabled. */
    enabled: boolean;
    /** Whether to show a browser notification on trigger. */
    notify: boolean;

    // --- internal mode fields ---
    /** Prompt to send on each trigger. */
    prompt?: string;
    /** Model ID to use. */
    modelId?: string;
    /** Existing conversation ID to continue. */
    conversationId?: string;
    /** Skills to load. */
    skills?: "auto" | string[];
    /** Max tool-calling iterations (default: 10). */
    maxIterations?: number;

    // --- event mode fields ---
    /** UUID of the script that created this task. */
    sourceScriptUuid?: string;

    // --- runtime status ---
    /** Last run timestamp. */
    lastruntime?: number;
    /** Next scheduled run timestamp. */
    nextruntime?: number;
    /** Last run result status. */
    lastRunStatus?: "success" | "error";
    /** Last run error message. */
    lastRunError?: string;
    /** Creation timestamp. */
    createtime: number;
    /** Last update timestamp. */
    updatetime: number;
  }

  /** Event payload delivered to `addListener` callbacks when a task triggers. */
  interface AgentTaskTrigger {
    /** Task ID. */
    taskId: string;
    /** Task name. */
    name: string;
    /** Cron expression. */
    crontab: string;
    /** Trigger timestamp. */
    triggeredAt: number;
  }

  /** Options for creating a new task (fields auto-populated by the system are omitted). */
  type AgentTaskCreateOptions = Omit<
    AgentTask,
    "id" | "createtime" | "updatetime" | "nextruntime" | "sourceScriptUuid"
  >;

  /**
   * `CAT.agent.task` — create and manage scheduled agent tasks.
   * @grant CAT.agent.task
   */
  interface TaskAPI {
    /** Create a new scheduled task. */
    create(options: AgentTaskCreateOptions): Promise<AgentTask>;

    /** List all tasks. */
    list(): Promise<AgentTask[]>;

    /** Get a task by ID. */
    get(id: string): Promise<AgentTask | undefined>;

    /** Update a task. */
    update(id: string, task: Partial<AgentTask>): Promise<AgentTask>;

    /** Remove a task by ID. */
    remove(id: string): Promise<boolean>;

    /** Immediately trigger a task (regardless of cron schedule). */
    runNow(id: string): Promise<void>;

    /**
     * Listen for task trigger events (for `mode: "event"` tasks).
     * Returns a listener ID for later removal.
     */
    addListener(taskId: string, callback: (trigger: AgentTaskTrigger) => void): number;

    /** Remove a previously registered listener. */
    removeListener(listenerId: number): void;
  }
}

// ---- CAT.agent.skills — Skill management API ----

/** Skill management types — install, remove, and query Agent Skills. */
declare namespace CATAgentSkills {
  /** Summary info for an installed Skill. */
  interface SkillSummary {
    /** Skill name. */
    name: string;
    /** Skill description. */
    description: string;
    /** Skill Script names bundled in this Skill (from `scripts/` directory). */
    toolNames: string[];
    /** Reference document names (from `references/` directory). */
    referenceNames: string[];
    /** Whether this Skill has config fields declared. */
    hasConfig?: boolean;
    /** Whether this Skill is enabled. Defaults to `true` when `undefined`. */
    enabled?: boolean;
    /** Installation timestamp. */
    installtime: number;
    /** Last update timestamp. */
    updatetime: number;
  }

  /** Config field definition declared in SKILL.md frontmatter. */
  interface SkillConfigField {
    /** Display title. */
    title: string;
    /** Widget type. */
    type: "text" | "number" | "select" | "switch";
    /** Whether the value should be masked (e.g. API keys). */
    secret?: boolean;
    /** Whether the field is required. */
    required?: boolean;
    /** Default value. */
    default?: unknown;
    /** Allowed values (for `select` type). */
    values?: string[];
  }

  /** Full Skill record including the prompt and config schema. */
  interface SkillRecord extends SkillSummary {
    /** SKILL.md body (markdown after frontmatter removal). */
    prompt: string;
    /** Config schema from SKILL.md frontmatter. */
    config?: Record<string, SkillConfigField>;
  }

  /**
   * `CAT.agent.skills` — manage Agent Skills (packaged prompts + tools + references).
   * @grant CAT.agent.skills
   */
  interface SkillsAPI {
    /** List all installed Skills. */
    list(): Promise<SkillSummary[]>;

    /** Get full details of a Skill by name. Returns `null` if not found. */
    get(name: string): Promise<SkillRecord | null>;

    /**
     * Install a Skill from a SKILL.md string, with optional bundled scripts and references.
     * @param skillMd - The SKILL.md content (with YAML frontmatter).
     * @param scripts - Skill Script scripts to bundle.
     * @param references - Reference documents to bundle.
     */
    install(
      skillMd: string,
      scripts?: Array<{ name: string; code: string }>,
      references?: Array<{ name: string; content: string }>
    ): Promise<SkillRecord>;

    /** Remove a Skill by name. */
    remove(name: string): Promise<boolean>;

    /** Call a skill script by skill name and script name with optional parameters. */
    call(skillName: string, scriptName: string, params?: Record<string, unknown>): Promise<unknown>;
  }
}

// ---- CAT.agent.model — Model configuration query API ----

/** Model configuration types — query available LLM models (read-only, apiKey excluded). */
declare namespace CATAgentModel {
  /** Model configuration summary (apiKey excluded for security). */
  interface ModelSummary {
    /** Unique model config ID. */
    id: string;
    /** User-defined display name (e.g. "GPT-4o", "Claude Sonnet"). */
    name: string;
    /** LLM provider. */
    provider: "openai" | "anthropic";
    /** API base URL. */
    apiBaseUrl: string;
    /** Model identifier sent to the provider API. */
    model: string;
    /** Maximum output tokens; omitted if unset. */
    maxTokens?: number;
  }

  /**
   * `CAT.agent.model` — query configured LLM models (read-only).
   * @grant CAT.agent.model
   */
  interface ModelAPI {
    /** List all configured models (apiKey excluded). */
    list(): Promise<ModelSummary[]>;

    /** Get a specific model by ID. Returns `null` if not found. */
    get(id: string): Promise<ModelSummary | null>;

    /** Get the default model ID. Returns empty string if none set. */
    getDefault(): Promise<string>;

    /** Get the summary (lightweight) model ID. Returns empty string if none set. */
    getSummary(): Promise<string>;
  }
}

// ---- CAT.agent.opfs — Workspace file system API ----

/** OPFS workspace types — read, write, list, and delete files in the agent workspace. */
declare namespace CATAgentOPFS {
  /** Entry info returned by `list()`. */
  interface FileEntry {
    /** File or directory name. */
    name: string;
    /** Entry type. */
    type: "file" | "directory";
    /** File size in bytes (only for files). */
    size?: number;
  }

  /** Write result. */
  interface WriteResult {
    /** Sanitized path that was written. */
    path: string;
    /** Size in bytes. */
    size: number;
  }

  /** Read result. */
  interface ReadResult {
    /** Sanitized path that was read. */
    path: string;
    /** File text content (when format is "text" or omitted). */
    content?: string;
    /** The file Blob object (when format is "blob"). Transferred via structured clone. */
    data?: Blob;
    /** Size in bytes. */
    size: number;
    /** Detected MIME type (when format is "blob"). */
    mimeType?: string;
  }

  /** Result of reading an attachment from internal attachment storage. */
  interface ReadAttachmentResult {
    /** Attachment ID. */
    id: string;
    /** The attachment Blob object, transferred via structured clone. */
    data: Blob;
    /** Size in bytes. */
    size: number;
    /** Detected MIME type. */
    mimeType?: string;
  }

  /**
   * `CAT.agent.opfs` — workspace file system operations.
   * All paths are relative to `agents/workspace/` in OPFS.
   * @grant CAT.agent.opfs
   */
  interface OPFSAPI {
    /** Write content to a file. Creates parent directories automatically. Accepts string, Blob, or data URL. */
    write(path: string, content: string | Blob): Promise<WriteResult>;

    /** Read content from a file. Use `format: "blob"` to get the Blob object for binary files. Default "text" returns content as string. */
    read(path: string, format?: "text" | "blob"): Promise<ReadResult>;

    /** List files and directories. Defaults to workspace root if path is omitted. */
    list(path?: string): Promise<FileEntry[]>;

    /** Delete a file or directory. */
    delete(path: string): Promise<{ success: true }>;

    /** Read an attachment from internal attachment storage (e.g. LLM-generated images). Returns the Blob object directly via structured clone. */
    readAttachment(id: string): Promise<ReadAttachmentResult>;
  }
}

// ---- CAT global object ----

/**
 * ScriptCat Agent global object — provides access to conversation, tools, DOM, task, and skills APIs.
 * Each sub-API requires its own `@grant` declaration.
 */
declare const CAT: {
  agent: {
    /** @grant CAT.agent.conversation */
    conversation: CATAgent.ConversationAPI;
    /** @grant CAT.agent.dom */
    dom: CATAgentDom.DomAPI;
    /** @grant CAT.agent.task */
    task: CATAgentTask.TaskAPI;
    /** @grant CAT.agent.skills */
    skills: CATAgentSkills.SkillsAPI;
    /** @grant CAT.agent.model */
    model: CATAgentModel.ModelAPI;
    /** @grant CAT.agent.opfs */
    opfs: CATAgentOPFS.OPFSAPI;
  };
};

/**
 * Skill configuration values injected into the Skill Script sandbox at runtime.
 *
 * Declared in the `config` block of a SKILL.md frontmatter and filled in by
 * the user through the Skill settings UI. The object is frozen at injection
 * time, so properties are read-only.
 */
declare const CAT_CONFIG: Readonly<Record<string, unknown>>;

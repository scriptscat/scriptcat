// ============================================================================
// scriptcat.zh-CN.d.ts — ScriptCat 全量中文类型声明
// 此文件为 scriptcat.d.ts 的中文翻译版本，包含所有 GM_*/CAT_*/CAT.agent API。
// 如需接入，请在 tsconfig.json 中替换或追加此文件。
// ============================================================================

// @copyright https://github.com/silverwzw/Tampermonkey-Typescript-Declaration

declare const unsafeWindow: Window;

declare type ConfigType = "text" | "checkbox" | "select" | "mult-select" | "number" | "textarea" | "time";

declare interface Config {
  [key: string]: unknown;
  /** 配置项标题。 */
  title: string;
  /** 配置项描述。 */
  description: string;
  /** 默认值。 */
  default?: unknown;
  /** UI 控件类型。 */
  type?: ConfigType;
  /** 双向绑定的键名。 */
  bind?: string;
  /** 允许的值（用于 select / multi-select）。 */
  values?: unknown[];
  /** 是否隐藏输入内容（密码字段）。 */
  password?: boolean;
  /** 文本最大长度 / 数值最大值。 */
  max?: number;
  /** 数值最小值。 */
  min?: number;
  /** 行数（用于 textarea）。 */
  rows?: number;
  /** 配置项排序索引。 */
  index: number;
}

declare type UserConfig = { [key: string]: { [key: string]: Config } };

/** 脚本及环境元数据，兼容 Tampermonkey 的 `GM_info`。 */
declare const GM_info: {
  /** ScriptCat 版本号。 */
  version: string;
  /** 脚本是否已启用自动更新。 */
  scriptWillUpdate: boolean;
  /** 始终为 `"ScriptCat"`。 */
  scriptHandler: "ScriptCat";
  scriptUpdateURL?: string;
  scriptMetaStr?: string;
  userConfig?: UserConfig;
  userConfigStr?: string;
  /** 是否在隐私/无痕窗口中运行。 */
  isIncognito: boolean;
  /** 沙箱模式（ScriptCat 始终使用 `"raw"`）。 */
  sandboxMode: "raw";
  userAgentData: {
    brands?: { brand: string; version: string }[];
    mobile?: boolean;
    platform?: string;
    architecture?: string;
    bitness?: string;
  };
  /** 下载模式（ScriptCat 使用 `"native"`）。 */
  downloadMode: "native";
  /** 从脚本头部解析的元数据。 */
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
// GM_* 函数（Greasemonkey/Tampermonkey 兼容，同步风格）
// ===========================================================================

/** 列出所有已存储的值的键名。 */
declare function GM_listValues(): string[];

/** 监听某个存储值的变化。返回监听器 ID。 */
declare function GM_addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): number;

/** 根据 ID 移除值变化监听器。 */
declare function GM_removeValueChangeListener(listenerId: number): void;

/** 存储一个值。 */
declare function GM_setValue(name: string, value: any): void;

/** 批量存储多个值。键为值的名称。 */
declare function GM_setValues(values: { [key: string]: any }): void;

/** 获取存储的值（未找到时返回 `defaultValue`）。 */
declare function GM_getValue(name: string, defaultValue?: any): any;

/**
 * 批量获取多个值。
 * 若 `keysOrDefaults` 为对象，其值作为默认值；若为数组，每个元素为键名（无默认值）。
 */
declare function GM_getValues(keysOrDefaults: { [key: string]: any } | string[] | null | undefined): {
  [key: string]: any;
};

/** 删除一个存储的值。 */
declare function GM_deleteValue(name: string): void;

/** 批量删除多个存储的值。 */
declare function GM_deleteValues(names: string[]): void;

/** 记录日志，可选等级和结构化标签。 */
declare function GM_log(message: string, level?: GMTypes.LoggerLevel, ...labels: GMTypes.LoggerLabel[]): void;

/** 根据名称获取 `@resource` 的文本内容。 */
declare function GM_getResourceText(name: string): string | undefined;

/** 根据名称获取 `@resource` 的 URL（data: 或 blob:）。 */
declare function GM_getResourceURL(name: string, isBlobUrl?: boolean): string | undefined;

/** 在 ScriptCat 弹出面板中注册菜单命令。 */
declare function GM_registerMenuCommand(
  name: string,
  listener?: (inputValue?: any) => void,
  options_or_accessKey?:
    | {
        id?: number | string;
        /** 键盘快捷键。 */
        accessKey?: string;
        /** 点击菜单后是否关闭弹出面板（默认 true）。 */
        autoClose?: boolean;
        /** SC 扩展：嵌套在父菜单下（默认 true）。`false` 提升到浏览器右键菜单。 */
        nested?: boolean;
        /** SC 扩展：不合并相同菜单项（默认 false）。 */
        individual?: boolean;
      }
    | string
): number;

/** 根据 ID 注销菜单命令。 */
declare function GM_unregisterMenuCommand(id: number): void;

/**
 * 注册带输入框的菜单项，允许用户输入值。
 * 回调接收用户的输入。
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
        /** 输入控件类型。 */
        inputType?: "text" | "number" | "boolean";
        /** 对话框标题。 */
        title?: string;
        /** 输入框旁显示的标签。 */
        inputLabel?: string;
        /** 输入框默认值。 */
        inputDefaultValue?: string | number | boolean;
        /** 占位文本。 */
        inputPlaceholder?: string;
      }
    | string
): number;

/** 注销菜单输入（`GM_unregisterMenuCommand` 的别名）。 */
declare const CAT_unregisterMenuInput: typeof GM_unregisterMenuCommand;

/** 等待脚本完全加载。配合 `@early-start` 使用。 */
declare function CAT_scriptLoaded(): Promise<void>;

/** 从 Blob 对象创建 blob URL。ScriptCat 管理 URL 生命周期。 */
declare function CAT_createBlobUrl(blob: Blob): Promise<string>;

/** 获取 blob URL 并返回 Blob 数据。用于 `GM_xmlhttpRequest` stream 响应的辅助函数。 */
declare function CAT_fetchBlob(url: string): Promise<Blob>;

/** 获取 URL 并解析为 Document（优先在内容页上下文中执行）。 */
declare function CAT_fetchDocument(url: string): Promise<Document | undefined>;

/** 在新标签页中打开 URL。返回 Tab 句柄（上下文无效时返回 `undefined`）。 */
declare function GM_openInTab(url: string, options: GMTypes.OpenTabOptions): GMTypes.Tab | undefined;
declare function GM_openInTab(url: string, loadInBackground: boolean): GMTypes.Tab | undefined;
declare function GM_openInTab(url: string): GMTypes.Tab | undefined;

/** 关闭由 `GM_openInTab` 打开的标签页。 */
declare function GM_closeInTab(tabId: string): void;

/** 执行跨域 XMLHttpRequest。目标域名需在 `@connect` 中声明。 */
declare function GM_xmlhttpRequest(details: GMTypes.XHRDetails): GMTypes.AbortHandle<void>;

/** 下载文件。 */
declare function GM_download(details: GMTypes.DownloadDetails<string | Blob | File>): GMTypes.AbortHandle<boolean>;
declare function GM_download(url: string, filename: string): GMTypes.AbortHandle<boolean>;

/** 获取标签页的持久化存储对象。 */
declare function GM_getTab(callback: (tab: object) => void): void;

/** 保存标签页的持久化存储对象。 */
declare function GM_saveTab(tab: object): void;

/** 获取所有标签页的持久化存储对象。 */
declare function GM_getTabs(callback: (tabs: { [key: number]: object }) => void): void;

/** 显示桌面通知。 */
declare function GM_notification(details: GMTypes.NotificationDetails, ondone?: GMTypes.NotificationOnDone): void;
declare function GM_notification(
  text: string,
  title: string,
  image: string,
  onclick?: GMTypes.NotificationOnClick
): void;

/** 根据 ID 关闭通知。 */
declare function GM_closeNotification(id: string): void;

/** 根据 ID 更新通知。 */
declare function GM_updateNotification(id: string, details: GMTypes.NotificationDetails): void;

/** 复制文本到剪贴板。 */
declare function GM_setClipboard(data: string, info?: string | { type?: string; mimetype?: string }): void;

/** 向页面添加 DOM 元素。 */
declare function GM_addElement(tag: string, attributes: Record<string, string | number | boolean>): Element | undefined;
declare function GM_addElement(
  parentNode: Node,
  tag: string,
  attrs: Record<string, string | number | boolean>
): Element | undefined;

/** 向页面注入 CSS 样式表。 */
declare function GM_addStyle(css: string): Element | undefined;

/**
 * 执行 Cookie 操作。`name` 和 `domain` 不能同时为空。
 * @param action - `"list"` | `"set"` | `"delete"`
 */
declare function GM_cookie(
  action: GMTypes.CookieAction,
  details: GMTypes.CookieDetails,
  ondone: (cookie: GMTypes.Cookie[], error: unknown | undefined) => void
): void;

// ===========================================================================
// GM.* 对象（Greasemonkey 4 / Tampermonkey 4+ Promise 风格 API）
// ===========================================================================

/** Promise 风格的 API 对象。每个方法对应一个 `GM_*` 函数。 */
declare const GM: {
  /** 脚本及环境元数据（同 `GM_info`）。 */
  readonly info: typeof GM_info;

  /** 获取存储的值。 */
  getValue<T = any>(name: string, defaultValue?: T): Promise<T>;

  /** 批量获取多个存储的值。若 `keysOrDefaults` 为对象，其值作为默认值。 */
  getValues(keysOrDefaults: { [key: string]: any } | string[] | null | undefined): Promise<{ [key: string]: any }>;

  /** 存储一个值。 */
  setValue(name: string, value: any): Promise<void>;

  /** 批量存储多个值。 */
  setValues(values: { [key: string]: any }): Promise<void>;

  /** 删除一个存储的值。 */
  deleteValue(name: string): Promise<void>;

  /** 批量删除多个存储的值。 */
  deleteValues(names: string[]): Promise<void>;

  /** 列出所有已存储的值的键名。 */
  listValues(): Promise<string[]>;

  /** 监听存储值的变化。 */
  addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): Promise<number>;
  /** 移除值变化监听器。 */
  removeValueChangeListener(listenerId: number): Promise<void>;

  /** 记录日志，可选等级和结构化标签。 */
  log(message: string, level?: GMTypes.LoggerLevel, ...labels: GMTypes.LoggerLabel[]): Promise<void>;

  /** 获取 `@resource` 的文本内容。 */
  getResourceText(name: string): Promise<string | undefined>;

  /** 获取 `@resource` 的 URL。 */
  getResourceURL(name: string, isBlobUrl?: boolean): Promise<string | undefined>;

  /** 注册菜单命令。 */
  registerMenuCommand(
    name: string,
    listener?: (inputValue?: any) => void,
    options_or_accessKey?:
      | {
          id?: number | string;
          accessKey?: string;
          autoClose?: boolean;
          title?: string;
          /** SC 扩展：菜单图标 URL。 */
          icon?: string;
          /** SC 扩展：`autoClose` 的别名。 */
          closeOnClick?: boolean;
        }
      | string
  ): Promise<number | string | undefined>;

  /** 注销菜单命令。 */
  unregisterMenuCommand(id: number | string): Promise<void>;

  /** 注入 CSS 样式表。 */
  addStyle(css: string): Promise<Element | undefined>;

  /** 显示桌面通知。 */
  notification(details: GMTypes.NotificationDetails, ondone?: GMTypes.NotificationOnDone): Promise<void>;
  notification(text: string, title: string, image: string, onclick?: GMTypes.NotificationOnClick): Promise<void>;
  /** 关闭通知。 */
  closeNotification(id: string): Promise<void>;
  /** 更新通知。 */
  updateNotification(id: string, details: GMTypes.NotificationDetails): Promise<void>;

  /** 复制文本到剪贴板。 */
  setClipboard(data: string, info?: string | { type?: string; mimetype?: string }): Promise<void>;

  /** 添加 DOM 元素。 */
  addElement(tag: string, attributes: Record<string, string | number | boolean>): Promise<HTMLElement>;
  addElement(parentNode: Node, tag: string, attrs: Record<string, string | number | boolean>): Promise<HTMLElement>;

  /** 执行跨域 XMLHttpRequest。返回的 Promise 同时具有 `.abort()` 方法。 */
  xmlHttpRequest(details: GMTypes.XHRDetails): Promise<GMTypes.XHRResponse> & GMTypes.AbortHandle<void>;

  /** 下载文件。 */
  download(details: GMTypes.DownloadDetails<string | Blob | File>): Promise<boolean>;
  download(url: string, filename: string): Promise<boolean>;

  /** 获取标签页的持久化存储对象。 */
  getTab(): Promise<object>;
  /** 保存标签页的持久化存储对象。 */
  saveTab(tab: object): Promise<void>;
  /** 获取所有标签页的持久化存储对象。 */
  getTabs(): Promise<{ [key: number]: object }>;

  /** 在新标签页中打开 URL。 */
  openInTab(url: string, options: GMTypes.OpenTabOptions): Promise<GMTypes.Tab | undefined>;
  openInTab(url: string, loadInBackground: boolean): Promise<GMTypes.Tab | undefined>;
  openInTab(url: string): Promise<GMTypes.Tab | undefined>;

  /** 关闭由 `openInTab` 打开的标签页。 */
  closeInTab(tabId: string): Promise<void>;

  /** Cookie 操作（含子方法）。 */
  cookie: {
    (action: GMTypes.CookieAction, details: GMTypes.CookieDetails): Promise<GMTypes.Cookie[]>;
    /** 设置 Cookie。 */
    set(details: GMTypes.CookieDetails): Promise<GMTypes.Cookie[]>;
    /** 列出匹配的 Cookie。 */
    list(details: GMTypes.CookieDetails): Promise<GMTypes.Cookie[]>;
    /** 删除 Cookie。 */
    delete(details: GMTypes.CookieDetails): Promise<GMTypes.Cookie[]>;
  };
};

// ===========================================================================
// CAT_* 函数（ScriptCat 专有扩展）
// ===========================================================================

/**
 * 设置浏览器代理规则。
 * @deprecated 已从稳定版移除；可能在 beta 版中恢复。
 */
declare function CAT_setProxy(rule: CATType.ProxyRule[] | string): void;

/**
 * 清除所有代理规则。
 * @deprecated 已从稳定版移除；可能在 beta 版中恢复。
 */
declare function CAT_clearProxy(): void;

/**
 * 在坐标 (x, y) 模拟真实点击。
 * @deprecated 已从稳定版移除；可能在 beta 版中恢复。
 */
declare function CAT_click(x: number, y: number): void;

/** 打开脚本的用户配置页面。 */
declare function CAT_userConfig(): void;

/**
 * 与托管文件存储系统交互。
 * 为当前脚本创建 `app/<uuid>` 目录（或使用 `baseDir`）。
 * 上传会覆盖同名文件。
 * @param action - `"list"` | `"upload"` | `"download"` | `"delete"` | `"config"`
 */
declare function CAT_fileStorage(
  action: "list",
  details: {
    /** 要列出的目录路径。 */
    path?: string;
    /** 基础目录；默认为脚本的 UUID。 */
    baseDir?: string;
    onload?: (files: CATType.FileStorageFileInfo[]) => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
declare function CAT_fileStorage(
  action: "download",
  details: {
    /** 文件信息对象（某些平台需要文件哈希）。 */
    file: CATType.FileStorageFileInfo;
    onload: (data: Blob) => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
declare function CAT_fileStorage(
  action: "delete",
  details: {
    /** 要删除的文件路径。 */
    path: string;
    onload?: () => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
declare function CAT_fileStorage(
  action: "upload",
  details: {
    /** 目标文件路径。 */
    path: string;
    /** 基础目录；默认为脚本的 UUID。 */
    baseDir?: string;
    /** 要上传的文件数据。 */
    data: Blob;
    onload?: () => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
/** 打开文件存储配置页面。 */
declare function CAT_fileStorage(action: "config"): void;

/**
 * 后台脚本重试错误。抛出此错误可让 ScriptCat 稍后重试。
 * 最小重试间隔为 5 秒。避免与脚本自身的调度重叠。
 */
declare class CATRetryError {
  /** @param message - 错误信息。 @param seconds - N 秒后重试。 */
  constructor(message: string, seconds: number);
  /** @param message - 错误信息。 @param date - 在指定时间重试。 */
  constructor(message: string, date: Date);
}

// ===========================================================================
// CATType 命名空间（ScriptCat 专有类型）
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
     * 错误码：
     * -1 = 未知，1 = 存储未配置，2 = 配置错误，3 = 路径不存在，
     * 4 = 上传失败，5 = 下载失败，6 = 删除失败，
     * 7 = 不允许的文件路径，8 = 网络错误
     */
    code: -1 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    error: string;
  }

  interface FileStorageFileInfo {
    /** 文件名。 */
    name: string;
    /** 相对文件路径。 */
    path: string;
    /** 存储空间中的绝对路径。 */
    absPath: string;
    /** 文件大小（字节）。 */
    size: number;
    /** 文件内容摘要/哈希。 */
    digest: string;
    /** 创建时间戳。 */
    createtime: number;
    /** 最后修改时间戳。 */
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
// GMTypes 命名空间（Greasemonkey/Tampermonkey 兼容类型）
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

  /** 值变化监听器。`tabid` 仅在后台脚本监听器中可用。 */
  type ValueChangeListener = (
    name: string,
    oldValue: unknown,
    newValue: unknown,
    remote: boolean,
    tabid?: number
  ) => unknown;

  interface OpenTabOptions {
    /**
     * 新标签页是否立即获得焦点。
     * - `true` — 前台打开。
     * - `false` — 后台打开。
     * @default true
     */
    active?: boolean;

    /**
     * 标签页插入位置。
     * - `true` / `1` — 插入到当前标签页之后。
     * - `false` — 追加到窗口末尾。
     * - `0` — 插入到当前标签页之前。
     * @default true
     */
    insert?: boolean | number;

    /**
     * 设置 opener 标签页 ID，以便浏览器追踪父子关系。
     * @default true
     */
    setParent?: boolean;

    /**
     * 在隐私/无痕窗口中打开。
     * 注意：ScriptCat 使用 `"incognito": "split"` — 在普通窗口中，
     * tabId/windowId 将不可用。
     * @default false
     */
    incognito?: boolean;

    /**
     * 旧版字段（仅 TM）。语义与 `active` **相反**：
     * `true` = 后台，`false` = 前台。
     * @default false
     * @deprecated 请使用 `active` 代替。
     */
    loadInBackground?: boolean;

    /**
     * 将新标签页固定在浏览器标签栏。
     * @default false
     */
    pinned?: boolean;

    /**
     * 使用 `window.open` 代替 `chrome.tabs.create`。
     * 适用于特殊协议如 `vscode://`、`m3u8dl://`。
     * 此模式下其他选项会被忽略。
     * @default false
     */
    useOpen?: boolean;
  }

  type SWOpenTabOptions = OpenTabOptions & Required<Pick<OpenTabOptions, "active">>;

  /**
   * XMLHttpRequest readyState 值。
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
    /** 响应类型。当前版本中 `"stream"` 支持有限。 */
    responseType?: "text" | "arraybuffer" | "blob" | "json" | "document" | "stream";
    overrideMimeType?: string;
    /** 发送不带 Cookie 的请求（Tampermonkey 兼容）。 */
    anonymous?: boolean;
    /** 发送不带 Cookie 的请求（Greasemonkey 兼容）。 */
    mozAnon?: boolean;
    /** 强制内部使用 Fetch API。 */
    fetch?: boolean;
    user?: string;
    password?: string;
    /** 禁用缓存。 */
    nocache?: boolean;
    /** 强制重新验证：允许缓存但使用前重新验证。 */
    revalidate?: boolean;
    /** 重定向处理。内部强制使用 fetch 模式。 */
    redirect?: "follow" | "error" | "manual";
    /** 分区 Cookie 键，用于存储分区。 */
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
    // 标准参数（TM/SC）
    url: URL;
    name: string;
    headers?: { [key: string]: string };
    saveAs?: boolean;
    conflictAction?: "uniquify" | "overwrite" | "prompt";

    // 扩展参数（SC/VM）
    timeout?: number;
    anonymous?: boolean;
    context?: ContextType;
    user?: string;
    password?: string;

    // SC 专有参数
    method?: "GET" | "POST";
    downloadMode?: "native" | "browser";
    cookie?: string;

    // 回调
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
    /** 最多 2 个按钮。 */
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

// ---- CAT.agent.conversation API ----

/** CAT Agent 对话、内容块和流式类型。 */
declare namespace CATAgent {
  // ---- 内容块类型 ----

  /** 纯文本内容块。 */
  type TextBlock = { type: "text"; text: string };

  /** 图片内容块。数据存储在 OPFS 中，通过 `attachmentId` 引用。 */
  type ImageBlock = { type: "image"; attachmentId: string; mimeType: string; name?: string };

  /** 文件内容块。 */
  type FileBlock = { type: "file"; attachmentId: string; mimeType: string; name: string; size?: number };

  /** 音频内容块。 */
  type AudioBlock = {
    type: "audio";
    attachmentId: string;
    mimeType: string;
    name?: string;
    /** 时长（毫秒）。 */
    durationMs?: number;
  };

  /** 所有内容块类型的联合类型。 */
  type ContentBlock = TextBlock | ImageBlock | FileBlock | AudioBlock;

  /** 消息内容：纯字符串或内容块数组（多模态）。 */
  type MessageContent = string | ContentBlock[];

  // ---- 工具类型 ----

  /**
   * 工具定义（含内联处理函数）。
   * 用于 `ConversationCreateOptions.tools` 或 `ChatOptions.tools`，注册可供 LLM 调用的工具。
   */
  interface ToolDefinition {
    /** 工具唯一名称。 */
    name: string;
    /** 工具描述。 */
    description: string;
    /** 描述工具参数的 JSON Schema。 */
    parameters: Record<string, unknown>;
    /** LLM 调用此工具时执行的处理函数。 */
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }

  /**
   * 自定义命令处理器。命令以 `/` 开头（如 `/new`）。
   * 返回字符串作为回复内容，或返回 void。
   */
  type CommandHandler = (args: string, conv: ConversationInstance) => Promise<string | void>;

  // ---- 对话选项 ----

  /** 通过 `CAT.agent.conversation.create()` 创建对话时的选项。 */
  interface ConversationCreateOptions {
    /** 自定义对话 ID，省略则自动生成。 */
    id?: string;
    /** 系统提示词。 */
    system?: string;
    /** 模型 ID，省略则使用默认模型。 */
    model?: string;
    /** 工具调用循环最大迭代次数（默认 20）。 */
    maxIterations?: number;
    /** 加载的 Skill：`"auto"` 加载全部已安装 Skill，或指定名称数组。 */
    skills?: "auto" | string[];
    /** 带内联处理函数的工具，在此对话生命周期内可用。 */
    tools?: ToolDefinition[];
    /**
     * 自定义斜杠命令处理器（如 `{ "/reset": handler }`）。
     * 内置的 `/new` 命令（清空对话）可被覆盖。
     */
    commands?: Record<string, CommandHandler>;
    /**
     * 临时模式：消息仅保留在内存中，不持久化。
     * 不加载内置工具/Skill，脚本需自行提供所有工具。
     */
    ephemeral?: boolean;
    /** 是否启用 prompt caching，默认 true。 */
    cache?: boolean;
  }

  /** 单次 `chat()` / `chatStream()` 调用的选项。 */
  interface ChatOptions {
    /** 仅用于此次调用的附加工具（与对话级工具合并）。 */
    tools?: ToolDefinition[];
  }

  // ---- 工具调用 ----

  /** 附件元数据，用于工具结果和消息。 */
  interface Attachment {
    /** 附件 ID。 */
    id: string;
    /** 附件类型。 */
    type: "image" | "file" | "audio";
    /** 文件名。 */
    name: string;
    /** MIME 类型（如 "image/jpeg"、"application/zip"）。 */
    mimeType: string;
    /** 文件大小（字节）。 */
    size?: number;
  }

  /** LLM 发起的工具调用记录。 */
  interface ToolCallInfo {
    /** 唯一调用 ID。 */
    id: string;
    /** 工具名称。 */
    name: string;
    /** JSON 序列化的参数。 */
    arguments: string;
    /** 工具执行结果（执行后填充）。 */
    result?: string;
    /** 工具执行产生的附件（如截图、文件）。 */
    attachments?: Attachment[];
    /** 调用状态。 */
    status?: "pending" | "running" | "completed" | "error";
  }

  // ---- 聊天回复 ----

  /** 非流式 `chat()` 调用的返回结果。 */
  interface ChatReply {
    /** 回复内容。 */
    content: MessageContent;
    /** 模型思考/推理文本（如有）。 */
    thinking?: string;
    /** 本轮中的工具调用。 */
    toolCalls?: ToolCallInfo[];
    /** Token 用量。 */
    usage?: { inputTokens: number; outputTokens: number };
    /** 当回复由命令处理器产生（而非 LLM）时为 `true`。 */
    command?: boolean;
  }

  /** 通过 `chatStream()` 流式返回的单个数据块。 */
  interface StreamChunk {
    /**
     * 数据块类型：
     * - `"content_delta"` — 增量文本
     * - `"thinking_delta"` — 增量思考/推理
     * - `"tool_call"` — 工具调用事件
     * - `"content_block"` — 完整的非文本内容块
     * - `"done"` — 流结束
     * - `"error"` — 发生错误
     */
    type: "content_delta" | "thinking_delta" | "tool_call" | "content_block" | "done" | "error";
    /** 文本增量（用于 content_delta / thinking_delta）。 */
    content?: string;
    /** 完整内容块（用于 content_block）。 */
    block?: ContentBlock;
    /** 工具调用信息（用于 tool_call）。 */
    toolCall?: ToolCallInfo;
    /** Token 用量（用于 done）。 */
    usage?: { inputTokens: number; outputTokens: number };
    /** 错误信息（用于 error）。 */
    error?: string;
    /** 错误分类码：`"rate_limit"` | `"auth"` | `"tool_timeout"` | `"max_iterations"` | `"api_error"` */
    errorCode?: string;
    /** 当数据块由命令处理器产生时为 `true`。 */
    command?: boolean;
  }

  // ---- 聊天消息 ----

  /** 对话中持久化的聊天消息。 */
  interface ChatMessage {
    /** 消息 ID。 */
    id: string;
    /** 所属对话 ID。 */
    conversationId: string;
    /** 消息角色。 */
    role: "user" | "assistant" | "system" | "tool";
    /** 消息内容（文本或多模态）。 */
    content: MessageContent;
    /** 模型思考/推理块。 */
    thinking?: { content: string };
    /** 此消息中的工具调用。 */
    toolCalls?: ToolCallInfo[];
    /** 关联的 tool_call ID（用于 role="tool" 的消息）。 */
    toolCallId?: string;
    /** 错误信息（当轮次出错时）。 */
    error?: string;
    /** 生成此消息使用的模型 ID。 */
    modelId?: string;
    /** 此消息的 Token 用量。 */
    usage?: {
      inputTokens: number;
      outputTokens: number;
      /** Anthropic 缓存创建输入 tokens。 */
      cacheCreationInputTokens?: number;
      /** Anthropic 缓存读取输入 tokens。 */
      cacheReadInputTokens?: number;
    };
    /** 总响应时长（毫秒）。 */
    durationMs?: number;
    /** 首 token 时间（毫秒）。 */
    firstTokenMs?: number;
    /** 父消息 ID（用于分支）。 */
    parentId?: string;
    /** 创建时间戳。 */
    createtime: number;
  }

  // ---- 对话实例 ----

  /**
   * 由 `CAT.agent.conversation.create()` 或 `.get()` 返回的对话实例。
   * 提供聊天、流式传输和管理消息历史的方法。
   */
  interface ConversationInstance {
    /** 对话 ID。 */
    readonly id: string;
    /** 对话标题。 */
    readonly title: string;
    /** 使用的模型 ID。 */
    readonly modelId: string;

    /** 发送消息并等待完整回复（自动执行工具调用循环）。 */
    chat(content: MessageContent, options?: ChatOptions): Promise<ChatReply>;

    /** 发送消息并接收流式响应。 */
    chatStream(content: MessageContent, options?: ChatOptions): Promise<AsyncIterable<StreamChunk>>;

    /** 获取此对话中的所有消息。 */
    getMessages(): Promise<ChatMessage[]>;

    /** 清空此对话中的所有消息。 */
    clear(): Promise<void>;

    /** 将对话持久化到存储。 */
    save(): Promise<void>;
  }

  // ---- 对话 API ----

  /**
   * `CAT.agent.conversation` — 创建和获取对话实例。
   * @grant CAT.agent.conversation
   */
  interface ConversationAPI {
    /** 创建新对话。 */
    create(options?: ConversationCreateOptions): Promise<ConversationInstance>;

    /** 根据 ID 获取已有对话。未找到时返回 `null`。 */
    get(id: string): Promise<ConversationInstance | null>;
  }
}

// ---- CAT.agent.dom — 浏览器 DOM 自动化 API ----

/** DOM 自动化类型 — 与浏览器标签页、页面和元素交互。 */
declare namespace CATAgentDom {
  /** 浏览器标签页信息。 */
  interface TabInfo {
    /** 标签页 ID。 */
    tabId: number;
    /** 当前 URL。 */
    url: string;
    /** 页面标题。 */
    title: string;
    /** 标签页是否处于激活状态。 */
    active: boolean;
    /** 窗口 ID。 */
    windowId: number;
    /** 标签页是否已被丢弃（从内存中卸载）。 */
    discarded: boolean;
  }

  /** DOM 操作（点击、填充等）的结果。 */
  interface ActionResult {
    /** 操作是否成功。 */
    success: boolean;
    /** 操作是否导致了导航。 */
    navigated?: boolean;
    /** 操作后的当前 URL。 */
    url?: string;
    /** 操作导致打开的新标签页。 */
    newTab?: { tabId: number; url: string };
  }

  /** `readPage()` 返回的页面内容。 */
  interface PageContent {
    /** 页面标题。 */
    title: string;
    /** 页面 URL。 */
    url: string;
    /** HTML 内容（或选定的片段）。 */
    html: string;
    /** 内容是否因 `maxLength` 而被截断。 */
    truncated?: boolean;
    /** 截断前的原始总长度。 */
    totalLength?: number;
  }

  /** `readPage()` 的选项。 */
  interface ReadPageOptions {
    /** 目标标签页 ID，默认为活动标签页。 */
    tabId?: number;
    /** 读取特定元素的 CSS 选择器。 */
    selector?: string;
    /** 最大内容长度（字符数）。 */
    maxLength?: number;
    /** 读取前要移除的标签/选择器（如 `["script", "style", "svg"]`）。 */
    removeTags?: string[];
  }

  /** DOM 操作（点击、填充）的选项。 */
  interface DomActionOptions {
    /** 目标标签页 ID。 */
    tabId?: number;
    /** 使用可信的（CDP 派发的）事件，而非合成 JS 事件。 */
    trusted?: boolean;
  }

  /** `screenshot()` 的选项。 */
  interface ScreenshotOptions {
    /** 目标标签页 ID。 */
    tabId?: number;
    /** JPEG 质量（0–100）。 */
    quality?: number;
    /** 捕获完整可滚动页面。 */
    fullPage?: boolean;
    /** CSS 选择器，截取指定元素区域。 */
    selector?: string;
    /** OPFS workspace 相对路径，截图后保存二进制。 */
    saveTo?: string;
  }

  /** `screenshot()` 调用的结果。 */
  interface ScreenshotResult {
    /** Base64 编码的 data URL。 */
    dataUrl: string;
    /** 使用 `saveTo` 时返回的 OPFS 路径。 */
    path?: string;
    /** 使用 `saveTo` 时返回的文件大小（字节）。 */
    size?: number;
  }

  /** `navigate()` 的选项。 */
  interface NavigateOptions {
    /** 目标标签页 ID。 */
    tabId?: number;
    /** 等待页面完全加载。 */
    waitUntil?: boolean;
    /** 导航超时时间（毫秒）。 */
    timeout?: number;
  }

  /** 滚动方向。 */
  type ScrollDirection = "up" | "down" | "top" | "bottom";

  /** `scroll()` 的选项。 */
  interface ScrollOptions {
    /** 目标标签页 ID。 */
    tabId?: number;
    /** 在特定元素内滚动。 */
    selector?: string;
  }

  /** 滚动操作的结果。 */
  interface ScrollResult {
    /** 当前滚动位置。 */
    scrollTop: number;
    /** 总可滚动高度。 */
    scrollHeight: number;
    /** 可见视口高度。 */
    clientHeight: number;
    /** 是否已滚动到底部。 */
    atBottom: boolean;
  }

  /** `navigate()` 调用的结果。 */
  interface NavigateResult {
    /** 标签页 ID。 */
    tabId: number;
    /** 导航后的最终 URL。 */
    url: string;
    /** 页面标题。 */
    title: string;
  }

  /** `waitFor()` 的选项。 */
  interface WaitForOptions {
    /** 目标标签页 ID。 */
    tabId?: number;
    /** 超时时间（毫秒）。 */
    timeout?: number;
  }

  /** `waitFor()` 的结果。 */
  interface WaitForResult {
    /** 是否找到了元素。 */
    found: boolean;
    /** 元素详情（找到时）。 */
    element?: {
      selector: string;
      tag: string;
      text: string;
      role?: string;
      type?: string;
      visible: boolean;
    };
  }

  /** `executeScript()` 的选项。 */
  interface ExecuteScriptOptions {
    /** 目标标签页 ID。 */
    tabId?: number;
  }

  /** `stopMonitor()` 的结果 — 监控期间收集的 DOM 变更。 */
  interface MonitorResult {
    /** 监控期间捕获的对话框。 */
    dialogs: Array<{ type: string; message: string }>;
    /** 监控期间新增的 DOM 节点。 */
    addedNodes: Array<{ tag: string; id?: string; class?: string; role?: string; text: string }>;
  }

  /** `peekMonitor()` 的结果 — 正在监控的 DOM 变更摘要。 */
  interface MonitorStatus {
    /** 是否检测到变更。 */
    hasChanges: boolean;
    /** 捕获的对话框数量。 */
    dialogCount: number;
    /** 捕获的新增 DOM 节点数量。 */
    nodeCount: number;
  }

  /**
   * `CAT.agent.dom` — 浏览器标签页和 DOM 自动化。
   * @grant CAT.agent.dom
   */
  interface DomAPI {
    /** 列出所有打开的浏览器标签页。 */
    listTabs(): Promise<TabInfo[]>;

    /** 导航标签页到指定 URL。 */
    navigate(url: string, options?: NavigateOptions): Promise<NavigateResult>;

    /** 读取页面的 HTML 内容（或选定元素）。 */
    readPage(options?: ReadPageOptions): Promise<PageContent>;

    /** 截取标签页的屏幕截图。 */
    screenshot(options?: ScreenshotOptions): Promise<ScreenshotResult>;

    /** 点击匹配 CSS 选择器的元素。 */
    click(selector: string, options?: DomActionOptions): Promise<ActionResult>;

    /** 向匹配 CSS 选择器的输入框/文本域填入指定值。 */
    fill(selector: string, value: string, options?: DomActionOptions): Promise<ActionResult>;

    /** 滚动页面或元素。 */
    scroll(direction: ScrollDirection, options?: ScrollOptions): Promise<ScrollResult>;

    /** 等待匹配 CSS 选择器的元素出现。 */
    waitFor(selector: string, options?: WaitForOptions): Promise<WaitForResult>;

    /** 在页面上下文中执行 JavaScript 代码。 */
    executeScript(code: string, options?: ExecuteScriptOptions): Promise<unknown>;

    /** 开始监控标签页上的 DOM 变更（对话框、新增节点）。 */
    startMonitor(tabId: number): Promise<void>;

    /** 停止监控并返回收集到的变更（对话框、新增节点）。 */
    stopMonitor(tabId: number): Promise<MonitorResult>;

    /** 查看标签页的当前监控状态。 */
    peekMonitor(tabId: number): Promise<MonitorStatus>;
  }
}

// ---- CAT.agent.task — 定时任务 API ----

/** 定时任务类型 — 创建基于 cron 的任务，运行 Agent 对话或发出事件。 */
declare namespace CATAgentTask {
  /** 定时 Agent 任务记录。 */
  interface AgentTask {
    /** 任务 ID。 */
    id: string;
    /** 任务名称。 */
    name: string;
    /** Cron 表达式。 */
    crontab: string;
    /**
     * 执行模式：
     * - `"internal"` — Service Worker 自动运行 LLM 对话。
     * - `"event"` — 通过 `addListener` 通知脚本。
     */
    mode: "internal" | "event";
    /** 任务是否启用。 */
    enabled: boolean;
    /** 触发时是否显示浏览器通知。 */
    notify: boolean;

    // --- internal 模式字段 ---
    /** 每次触发时发送的提示词。 */
    prompt?: string;
    /** 使用的模型 ID。 */
    modelId?: string;
    /** 要续接的已有对话 ID。 */
    conversationId?: string;
    /** 加载的 Skill。 */
    skills?: "auto" | string[];
    /** 工具调用最大迭代次数（默认 10）。 */
    maxIterations?: number;

    // --- event 模式字段 ---
    /** 创建此任务的脚本 UUID。 */
    sourceScriptUuid?: string;

    // --- 运行状态 ---
    /** 上次运行时间戳。 */
    lastruntime?: number;
    /** 下次计划运行时间戳。 */
    nextruntime?: number;
    /** 上次运行结果状态。 */
    lastRunStatus?: "success" | "error";
    /** 上次运行错误信息。 */
    lastRunError?: string;
    /** 创建时间戳。 */
    createtime: number;
    /** 最后更新时间戳。 */
    updatetime: number;
  }

  /** 任务触发时通过 `addListener` 回调传递的事件载荷。 */
  interface AgentTaskTrigger {
    /** 任务 ID。 */
    taskId: string;
    /** 任务名称。 */
    name: string;
    /** Cron 表达式。 */
    crontab: string;
    /** 触发时间戳。 */
    triggeredAt: number;
  }

  /** 创建新任务的选项（系统自动填充的字段已省略）。 */
  type AgentTaskCreateOptions = Omit<
    AgentTask,
    "id" | "createtime" | "updatetime" | "nextruntime" | "sourceScriptUuid"
  >;

  /**
   * `CAT.agent.task` — 创建和管理定时 Agent 任务。
   * @grant CAT.agent.task
   */
  interface TaskAPI {
    /** 创建新的定时任务。 */
    create(options: AgentTaskCreateOptions): Promise<AgentTask>;

    /** 列出所有任务。 */
    list(): Promise<AgentTask[]>;

    /** 根据 ID 获取任务。 */
    get(id: string): Promise<AgentTask | undefined>;

    /** 更新任务。 */
    update(id: string, task: Partial<AgentTask>): Promise<AgentTask>;

    /** 根据 ID 删除任务。 */
    remove(id: string): Promise<boolean>;

    /** 立即触发任务（不受 cron 计划限制）。 */
    runNow(id: string): Promise<void>;

    /**
     * 监听任务触发事件（用于 `mode: "event"` 的任务）。
     * 返回监听器 ID，可用于后续移除。
     */
    addListener(taskId: string, callback: (trigger: AgentTaskTrigger) => void): number;

    /** 移除之前注册的监听器。 */
    removeListener(listenerId: number): void;
  }
}

// ---- CAT.agent.skills — Skill 管理 API ----

/** Skill 管理类型 — 安装、卸载和查询 Agent Skill。 */
declare namespace CATAgentSkills {
  /** 已安装 Skill 的摘要信息。 */
  interface SkillSummary {
    /** Skill 名称。 */
    name: string;
    /** Skill 描述。 */
    description: string;
    /** 此 Skill 中打包的 Skill Script 名称（来自 `scripts/` 目录）。 */
    toolNames: string[];
    /** 参考资料名称（来自 `references/` 目录）。 */
    referenceNames: string[];
    /** 此 Skill 是否声明了配置字段。 */
    hasConfig?: boolean;
    /** 是否启用此 Skill，`undefined` 时视为 `true`。 */
    enabled?: boolean;
    /** 安装时间戳。 */
    installtime: number;
    /** 最后更新时间戳。 */
    updatetime: number;
  }

  /** SKILL.md frontmatter 中声明的配置字段定义。 */
  interface SkillConfigField {
    /** 显示标题。 */
    title: string;
    /** 控件类型。 */
    type: "text" | "number" | "select" | "switch";
    /** 值是否应被掩码显示（如 API 密钥）。 */
    secret?: boolean;
    /** 是否必填。 */
    required?: boolean;
    /** 默认值。 */
    default?: unknown;
    /** 允许的值（用于 `select` 类型）。 */
    values?: string[];
  }

  /** 包含 prompt 和配置模式的完整 Skill 记录。 */
  interface SkillRecord extends SkillSummary {
    /** SKILL.md 正文（去除 frontmatter 后的 markdown）。 */
    prompt: string;
    /** 来自 SKILL.md frontmatter 的配置模式。 */
    config?: Record<string, SkillConfigField>;
  }

  /**
   * `CAT.agent.skills` — 管理 Agent Skill（打包的提示词 + 工具 + 参考资料）。
   * @grant CAT.agent.skills
   */
  interface SkillsAPI {
    /** 列出所有已安装的 Skill。 */
    list(): Promise<SkillSummary[]>;

    /** 根据名称获取 Skill 的完整详情。未找到时返回 `null`。 */
    get(name: string): Promise<SkillRecord | null>;

    /**
     * 从 SKILL.md 字符串安装 Skill，可附带打包的脚本和参考资料。
     * @param skillMd - SKILL.md 内容（含 YAML frontmatter）。
     * @param scripts - 要打包的 Skill Script 脚本。
     * @param references - 要打包的参考资料。
     */
    install(
      skillMd: string,
      scripts?: Array<{ name: string; code: string }>,
      references?: Array<{ name: string; content: string }>
    ): Promise<SkillRecord>;

    /** 根据名称卸载 Skill。 */
    remove(name: string): Promise<boolean>;

    /** 按 Skill 名称和脚本名称调用 Skill 脚本，可传入参数。 */
    call(skillName: string, scriptName: string, params?: Record<string, unknown>): Promise<unknown>;
  }
}

// ---- CAT.agent.model — 模型配置查询 API ----

/** 模型配置类型 — 查询可用的 LLM 模型（只读，apiKey 已排除）。 */
declare namespace CATAgentModel {
  /** 模型配置摘要（出于安全考虑排除了 apiKey）。 */
  interface ModelSummary {
    /** 唯一模型配置 ID。 */
    id: string;
    /** 用户自定义显示名称（如 "GPT-4o"、"Claude Sonnet"）。 */
    name: string;
    /** LLM 提供商。 */
    provider: "openai" | "anthropic";
    /** API 基础 URL。 */
    apiBaseUrl: string;
    /** 发送给提供商 API 的模型标识符。 */
    model: string;
    /** 最大输出 tokens；未设置时省略。 */
    maxTokens?: number;
  }

  /**
   * `CAT.agent.model` — 查询已配置的 LLM 模型（只读）。
   * @grant CAT.agent.model
   */
  interface ModelAPI {
    /** 列出所有已配置的模型（排除 apiKey）。 */
    list(): Promise<ModelSummary[]>;

    /** 根据 ID 获取特定模型。未找到时返回 `null`。 */
    get(id: string): Promise<ModelSummary | null>;

    /** 获取默认模型 ID。未设置时返回空字符串。 */
    getDefault(): Promise<string>;

    /** 获取摘要（轻量）模型 ID。未设置时返回空字符串。 */
    getSummary(): Promise<string>;
  }
}

// ---- CAT.agent.opfs — 工作区文件系统 API ----

/** OPFS 工作区类型 — 读取、写入、列出和删除 Agent 工作区中的文件。 */
declare namespace CATAgentOPFS {
  /** `list()` 返回的条目信息。 */
  interface FileEntry {
    /** 文件或目录名称。 */
    name: string;
    /** 条目类型。 */
    type: "file" | "directory";
    /** 文件大小（字节，仅文件类型有此字段）。 */
    size?: number;
  }

  /** 写入结果。 */
  interface WriteResult {
    /** 规范化后的写入路径。 */
    path: string;
    /** 大小（字节）。 */
    size: number;
  }

  /** 读取结果。 */
  interface ReadResult {
    /** 规范化后的读取路径。 */
    path: string;
    /** 文件文本内容（当 format 为 "text" 或省略时）。 */
    content?: string;
    /** 文件 Blob 对象（当 format 为 "blob" 时）。通过 structured clone 传递。 */
    data?: Blob;
    /** 大小（字节）。 */
    size: number;
    /** 检测到的 MIME 类型（当 format 为 "blob" 时）。 */
    mimeType?: string;
  }

  /** 读取附件的返回结果。 */
  interface ReadAttachmentResult {
    /** 附件 ID。 */
    id: string;
    /** 附件 Blob 对象，通过 structured clone 传递。 */
    data: Blob;
    /** 大小（字节）。 */
    size: number;
    /** 检测到的 MIME 类型。 */
    mimeType?: string;
  }

  /**
   * `CAT.agent.opfs` — 工作区文件系统操作。
   * 所有路径相对于 OPFS 中的 `agents/workspace/`。
   * @grant CAT.agent.opfs
   */
  interface OPFSAPI {
    /** 写入内容到文件。自动创建父目录。支持字符串、Blob 或 data URL。 */
    write(path: string, content: string | Blob): Promise<WriteResult>;

    /** 读取文件内容。使用 `format: "blob"` 获取二进制文件的 Blob 对象。默认 "text" 返回文本内容。 */
    read(path: string, format?: "text" | "blob"): Promise<ReadResult>;

    /** 列出文件和目录。省略 path 时默认列出工作区根目录。 */
    list(path?: string): Promise<FileEntry[]>;

    /** 删除文件或目录。 */
    delete(path: string): Promise<{ success: true }>;

    /** 从内部附件存储读取附件（如 LLM 生成的图片）。直接返回 Blob 对象，通过 structured clone 传递。 */
    readAttachment(id: string): Promise<ReadAttachmentResult>;
  }
}

// ---- CAT 全局对象 ----

/**
 * ScriptCat Agent 全局对象 — 提供对话、工具、DOM、任务、Skill、模型和文件系统 API 的访问。
 * 每个子 API 需要各自的 `@grant` 声明。
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
 * Skill 配置值，运行时注入到 Skill Script 沙箱中。
 *
 * 在 SKILL.md frontmatter 的 `config` 块中声明，由用户在 Skill 设置 UI 中填写。
 * 注入时对象已被冻结，属性为只读。
 */
declare const CAT_CONFIG: Readonly<Record<string, unknown>>;

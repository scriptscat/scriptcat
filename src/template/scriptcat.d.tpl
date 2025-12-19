// @copyright https://github.com/silverwzw/Tampermonkey-Typescript-Declaration

declare const unsafeWindow: Window;

declare type ConfigType = "text" | "checkbox" | "select" | "mult-select" | "number" | "textarea" | "time";

declare interface Config {
  [key: string]: unknown;
  title: string;
  description: string;
  default?: unknown;
  type?: ConfigType;
  bind?: string;
  values?: unknown[];
  password?: boolean;
  // 文本类型时是字符串长度,数字类型时是最大值
  max?: number;
  min?: number;
  rows?: number; // textarea行数
  index: number; // 配置项排序位置
}

declare type UserConfig = { [key: string]: { [key: string]: Config } };

declare const GM_info: {
  version: string;
  scriptWillUpdate: boolean;
  scriptHandler: "ScriptCat";
  scriptUpdateURL?: string;
  // scriptSource: string;
  scriptMetaStr?: string;
  userConfig?: UserConfig;
  userConfigStr?: string;
  isIncognito: boolean;
  sandboxMode: "raw"; // "js" | "raw" | "none";
  userAgentData: {
    brands?: {
      brand: string;
      version: string;
    }[];
    mobile?: boolean;
    platform?: string;
    architecture?: string;
    bitness?: string;
  };
  downloadMode: "native"; // "native" | "disabled" | "browser";
  script: {
    author?: string;
    description?: string;
    // excludes: string[];
    grant: string[];
    header: string;
    // homepage?: string;
    icon?: string;
    icon64?: string;
    includes?: string[];
    // lastModified: number;
    matches: string[];
    name: string;
    namespace?: string;
    // position: number;
    "run-at": string;
    "run-in": string[];
    // resources: string[];
    // unwrap: boolean;
    version: string;
    /* options: {
      awareOfChrome: boolean;
      run_at: string;
      noframes?: boolean;
      compat_arrayLeft: boolean;
      compat_foreach: boolean;
      compat_forvarin: boolean;
      compat_metadata: boolean;
      compat_uW_gmonkey: boolean;
      override: {
        orig_excludes: string[];
        orig_includes: string[];
        use_includes: string[];
        use_excludes: string[];
        [key: string]: any;
      };
      [key: string]: any;
    }; */
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

declare function GM_listValues(): string[];

declare function GM_addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): number;

declare function GM_removeValueChangeListener(listenerId: number): void;

declare function GM_setValue(name: string, value: any): void;
// 设置多个值, values是一个对象, 键为值的名称, 值为值的内容
declare function GM_setValues(values: { [key: string]: any }): void;

declare function GM_getValue(name: string, defaultValue?: any): any;

// 获取多个值, 如果keysOrDefaults是一个对象, 则使用对象的值作为默认值
declare function GM_getValues(keysOrDefaults: { [key: string]: any } | string[] | null | undefined): {
  [key: string]: any;
};

declare function GM_deleteValue(name: string): void;

// 删除多个值, names是一个字符串数组
declare function GM_deleteValues(names: string[]): void;

// 支持level和label
declare function GM_log(message: string, level?: GMTypes.LoggerLevel, labels?: GMTypes.LoggerLabel): void;

declare function GM_getResourceText(name: string): string | undefined;

declare function GM_getResourceURL(name: string, isBlobUrl?: boolean): string | undefined;

function GM_registerMenuCommand(
  name: string,
  listener?: (inputValue?: any) => void,
  options_or_accessKey?:
    | {
        id?: number | string;
        accessKey?: string; // 菜单快捷键
        autoClose?: boolean; // 默认为 true，false 时点击后不关闭弹出菜单页面
        nested?: boolean; // SC特有配置，默认为 true，false 的话浏览器右键菜单项目由三级菜单升至二级菜单
        individual?: boolean; // SC特有配置，默认为 false，true 表示相同的菜单项不合并显示
      }
    | string
): number;

declare function GM_unregisterMenuCommand(id: number): void;

/**
 * 注册一个菜单输入框, 允许用户输入值, 并在输入完成后用回调函数
 */
declare function CAT_registerMenuInput(
  name: string,
  listener?: (inputValue?: any) => void,
  options_or_accessKey?:
    | {
        id?: number | string;
        accessKey?: string; // 菜单快捷键
        autoClose?: boolean; // 默认为 true，false 时点击后不关闭弹出菜单页面
        nested?: boolean; // SC特有配置，默认为 true，false 的话浏览器右键菜单项目由三级菜单升至二级菜单
        individual?: boolean; // SC特有配置，默认为 false，true 表示相同的菜单项不合并显示
        // 可选输入框
        inputType?: "text" | "number" | "boolean";
        title?: string; // title 只适用于输入框类型
        inputLabel?: string;
        inputDefaultValue?: string | number | boolean;
        inputPlaceholder?: string;
      }
    | string
): number;

declare const CAT_unregisterMenuInput: typeof GM_unregisterMenuCommand;

/**
 * 当使用 @early-start 时，可以使用此函数来等待脚本完全加载完成
 */
declare function CAT_scriptLoaded(): Promise<void>;

declare function GM_openInTab(url: string, options: GMTypes.OpenTabOptions): GMTypes.Tab | undefined;
declare function GM_openInTab(url: string, loadInBackground: boolean): GMTypes.Tab | undefined;
declare function GM_openInTab(url: string): GMTypes.Tab | undefined;

declare function GM_xmlhttpRequest(details: GMTypes.XHRDetails): GMTypes.AbortHandle<void>;

declare function GM_download(details: GMTypes.DownloadDetails<string | Blob | File>): GMTypes.AbortHandle<boolean>;
declare function GM_download(url: string, filename: string): GMTypes.AbortHandle<boolean>;

declare function GM_getTab(callback: (obj: object) => void): void;

declare function GM_saveTab(obj: object): Promise<void>;

declare function GM_getTabs(callback: (objs: { [key: number]: object }) => void): void;

declare function GM_notification(details: GMTypes.NotificationDetails, ondone?: GMTypes.NotificationOnDone): void;
declare function GM_notification(
  text: string,
  title: string,
  image: string,
  onclick?: GMTypes.NotificationOnClick
): void;

declare function GM_closeNotification(id: string): void;

declare function GM_updateNotification(id: string, details: GMTypes.NotificationDetails): void;

declare function GM_setClipboard(data: string, info?: string | { type?: string; mimetype?: string }): void;

declare function GM_addElement(tag: string, attributes: any): HTMLElement;
declare function GM_addElement(parentNode: Element, tag: string, attrs: any): HTMLElement;

declare function GM_addStyle(css: string): HTMLStyleElement;

// name和domain不能都为空
declare function GM_cookie(
  action: GMTypes.CookieAction,
  details: GMTypes.CookieDetails,
  ondone: (cookie: GMTypes.Cookie[], error: unknown | undefined) => void
): void;

/**
 * 设置浏览器代理
 * @deprecated 正式版中已废弃,后续可能会在beta版本中添加
 */
declare function CAT_setProxy(rule: CATType.ProxyRule[] | string): void;

/**
 * 清理所有代理规则
 * @deprecated 正式版中已废弃,后续可能会在beta版本中添加
 */
declare function CAT_clearProxy(): void;

/**
 * 输入x、y,模拟真实点击
 * @deprecated 正式版中已废弃,后续可能会在beta版本中添加
 */
declare function CAT_click(x: number, y: number): void;

/**
 * 打开脚本的用户配置页面
 */
declare function CAT_userConfig(): void;

/**
 * 操控管理器设置的储存系统,将会在目录下创建一个app/uuid目录供此 API 使用,如果指定了baseDir参数,则会使用baseDir作为基础目录
 * 上传时默认覆盖同名文件
 * @param action 操作类型 list 列出指定目录所有文件, upload 上传文件, download 下载文件, delete 删除文件, config 打开配置页, 暂时不提供move/mkdir等操作
 * @param details
 */
declare function CAT_fileStorage(
  action: "list",
  details: {
    // 文件路径
    path?: string;
    // 基础目录,如果未设置,则将脚本uuid作为目录
    baseDir?: string;
    onload?: (files: CATType.FileStorageFileInfo[]) => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
declare function CAT_fileStorage(
  action: "download",
  details: {
    file: CATType.FileStorageFileInfo; // 某些平台需要提供文件的hash值,所以需要传入文件信息
    onload: (data: Blob) => void;
    // onprogress?: (progress: number) => void;
    onerror?: (error: CATType.FileStorageError) => void;
    // public?: boolean;
  }
): void;
declare function CAT_fileStorage(
  action: "delete",
  details: {
    path: string;
    onload?: () => void;
    onerror?: (error: CATType.FileStorageError) => void;
    // public?: boolean;
  }
): void;
declare function CAT_fileStorage(
  action: "upload",
  details: {
    path: string;
    // 基础目录,如果未设置,则将脚本uuid作为目录
    baseDir?: string;
    data: Blob;
    onload?: () => void;
    // onprogress?: (progress: number) => void;
    onerror?: (error: CATType.FileStorageError) => void;
    // public?: boolean;
  }
): void;
declare function CAT_fileStorage(action: "config"): void;

/**
 * 脚本猫后台脚本重试, 当你的脚本出现错误时, 可以reject返回此错误, 以便脚本猫重试
 * 重试时间请注意不要与脚本执行时间冲突, 否则可能会导致重复执行, 最小重试时间为5s
 * @class CATRetryError
 */
declare class CATRetryError {
  /**
   * constructor 构造函数
   * @param {string} message 错误信息
   * @param {number} seconds x秒后重试, 单位秒
   */
  constructor(message: string, seconds: number);

  /**
   * constructor 构造函数
   * @param {string} message 错误信息
   * @param {Date} date 重试时间, 指定时间后重试
   */
  constructor(message: string, date: Date);
}

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
    // 错误码 -1 未知错误 1 用户未配置文件储存源 2 文件储存源配置错误 3 路径不存在
    // 4 上传失败 5 下载失败 6 删除失败 7 不允许的文件路径 8 网络类型的错误
    code: -1 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    error: string;
  }

  interface FileStorageFileInfo {
    // 文件名
    name: string;
    // 文件路径
    path: string;
    // 储存空间绝对路径
    absPath: string;
    // 文件大小
    size: number;
    // 文件摘要
    digest: string;
    // 文件创建时间
    createtime: number;
    // 文件修改时间
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

  // tabid是只有后台脚本监听才有的参数
  type ValueChangeListener = (
    name: string,
    oldValue: unknown,
    newValue: unknown,
    remote: boolean,
    tabid?: number
  ) => unknown;

  interface OpenTabOptions {
    /**
     * 决定新标签页是否在打开时获得焦点。
     *
     * - `true` → 新标签页会立即切换到前台。
     * - `false` → 新标签页在后台打开，不会打断当前页面的焦点。
     *
     * 默认值：true
     */
    active?: boolean;

    /**
     * 决定新标签页插入位置。
     *
     * - 如果是 `boolean`：
     *   - `true` → 插入在当前标签页之后。
     *   - `false` → 插入到窗口末尾。
     * - 如果是 `number`：
     *   - `0` → 插入到当前标签前一格。
     *   - `1` → 插入到当前标签后一格。
     *
     * 默认值：true
     */
    insert?: boolean | number;

    /**
     * 决定是否设置父标签页（即 `openerTabId`）。
     *
     * - `true` → 浏览器能追踪由哪个标签打开的子标签，
     *   有助于某些扩展（如标签树管理器）识别父子关系。
     *
     * 默认值：true
     */
    setParent?: boolean;

    /**
     * 是否在隐私窗口（无痕模式）中打开标签页。
     *
     * 注意：ScriptCat 的 manifest.json 配置了 `"incognito": "split"`，
     * 在 normal window 中执行时，tabId/windowId 将不可用，
     * 只能执行「打开新标签页」动作。
     *
     * 默认值：false
     */
    incognito?: boolean;

    /**
     * 历史兼容字段，仅 TM 支持。
     * 语义与 `active` **相反**：
     *
     * - `true` → 等价于 `active = false`（后台加载）。
     * - `false` → 等价于 `active = true`（前台加载）。
     *
     * ⚠️ 不推荐使用：与 `active` 功能重复且容易混淆。
     *
     * 默认值：false
     * @deprecated 请使用 `active` 替代
     */
    loadInBackground?: boolean;

    /**
     * 是否将新标签页固定（pin）在浏览器标签栏左侧。
     *
     * - `true` → 新标签页为固定状态。
     * - `false` → 普通标签页。
     *
     * 默认值：false
     */
    pinned?: boolean;

    /**
     * 使用 `window.open` 打开新标签，而不是 `chrome.tabs.create`
     * 在打开一些特殊协议的链接时很有用，例如 `vscode://`, `m3u8dl://`
     * 其他参数在这个打开方式下无效
     *
     * 相关：Issue #178 #1043
     * 默认值：false
     */
    useOpen?: boolean;
  }

  type SWOpenTabOptions = OpenTabOptions & Required<Pick<OpenTabOptions, "active">>;

  /**
   * XMLHttpRequest readyState 状态值
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
    responseType?: "text" | "arraybuffer" | "blob" | "json" | "document" | "stream"; // stream 在当前版本是一个较为简陋的实现
    overrideMimeType?: string;
    anonymous?: boolean;
    mozAnon?: boolean; // 发送请求时不携带cookie (兼容Greasemonkey)
    fetch?: boolean;
    user?: string;
    password?: string;
    nocache?: boolean;
    revalidate?: boolean; // 强制重新验证缓存内容：允许缓存，但必须在使用缓存内容之前重新验证
    redirect?: "follow" | "error" | "manual"; // 为了与tm保持一致, 在v0.17.0后废弃maxRedirects, 使用redirect替代, 会强制使用fetch模式
    cookiePartition?: Record<string, any> & {
      topLevelSite?: string; // 表示分区 cookie 的顶部帧站点
    }; // 包含用于发送和接收的分区 cookie 的分区键 https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies#storage_partitioning
    context?: any; // 自定义值，传递给响应的 response.context 属性

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
    // TM/SC 标准参数
    url: URL;
    name: string;
    headers?: { [key: string]: string };
    saveAs?: boolean;
    conflictAction?: "uniquify" | "overwrite" | "prompt";

    // 其他参数
    timeout?: number; // SC/VM
    anonymous?: boolean; // SC/VM
    context?: ContextType; // SC/VM
    user?: string; // SC/VM
    password?: string; // SC/VM

    method?: "GET" | "POST"; // SC
    downloadMode?: "native" | "browser"; // SC
    cookie?: string; // SC

    // TM/SC 标准回调
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
    text: NotificationDetails["tag"];
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
    // 只能存在2个
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

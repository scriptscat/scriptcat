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
  // isIncognito: boolean;
  // downloadMode: "native" | "disabled" | "browser";
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

declare function GM_addStyle(css: string): HTMLElement;

declare function GM_deleteValue(name: string): void;

declare function GM_listValues(): string[];

declare function GM_addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): number;

declare function GM_removeValueChangeListener(listenerId: number): void;

// 可以使用Promise实际等待值的设置完成
declare function GM_setValue(name: string, value: unknown): Promise;

declare function GM_getValue(name: string, defaultValue?: unknown): unknown;

// 支持level和label
declare function GM_log(message: string, level?: GMTypes.LoggerLevel, labels?: GMTypes.LoggerLabel): unknown;

declare function GM_getResourceText(name: string): string | undefined;

declare function GM_getResourceURL(name: string, isBlobUrl?: boolean): string | undefined;

declare function GM_registerMenuCommand(name: string, listener: () => void, accessKey?: string): number;

declare function GM_unregisterMenuCommand(id: number): void;

declare function GM_openInTab(url: string, options: GMTypes.OpenTabOptions): tab;
declare function GM_openInTab(url: string, loadInBackground: boolean): tab;
declare function GM_openInTab(url: string): tab;

declare function GM_xmlhttpRequest(details: GMTypes.XHRDetails): GMTypes.AbortHandle<void>;

declare function GM_download(details: GMTypes.DownloadDetails): GMTypes.AbortHandle<boolean>;
declare function GM_download(url: string, filename: string): GMTypes.AbortHandle<boolean>;

declare function GM_getTab(callback: (obj: object) => unknown): void;

declare function GM_saveTab(obj: object): Promise<void>;

declare function GM_getTabs(callback: (objs: { [key: number]: object }) => unknown): void;

declare function GM_notification(details: GMTypes.NotificationDetails, ondone?: GMTypes.NotificationOnDone): void;
declare function GM_notification(
  text: string,
  title: string,
  image: string,
  onclick?: GMTypes.NotificationOnClick
): void;

declare function GM_closeNotification(id: string): void;

declare function GM_updateNotification(id: string, details: GMTypes.NotificationDetails): void;

declare function GM_setClipboard(data: string, info?: string | { type?: string; minetype?: string }): void;

declare function GM_addElement(tag: string, attribubutes: unknown);
declare function GM_addElement(parentNode: Element, tag: string, attrs: unknown);

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
}

declare namespace GMTypes {
  type CookieAction = "list" | "delete" | "set";

  type LoggerLevel = "debug" | "info" | "warn" | "error";

  type LoggerLabel = {
    [key: string]: string | boolean | number | undefined;
  };

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
    active?: boolean;
    insert?: boolean;
    setParent?: boolean;
    useOpen?: boolean; // 这是一个实验性/不兼容其他管理器/不兼容Firefox的功能 表示使用window.open打开新窗口 #178
  }

  interface XHRResponse {
    finalUrl?: string;
    readyState?: 0 | 1 | 2 | 3 | 4;
    responseHeaders?: string;
    status?: number;
    statusText?: string;
    response?: string | Blob | ArrayBuffer | Document | ReadableStream | null;
    responseText?: string;
    responseXML?: Document | null;
    responseType?: "text" | "arraybuffer" | "blob" | "json" | "document" | "stream";
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

  interface XHRDetails {
    method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
    url: string;
    headers?: { [key: string]: string };
    data?: string | FormData | Blob;
    cookie?: string;
    binary?: boolean;
    timeout?: number;
    context?: ContextType;
    responseType?: "text" | "arraybuffer" | "blob" | "json" | "document" | "stream"; // stream 在当前版本是一个较为简陋的实现
    overrideMimeType?: string;
    anonymous?: boolean;
    fetch?: boolean;
    user?: string;
    password?: string;
    nocache?: boolean;
    redirect?: "follow" | "error" | "manual";// 为了与tm保持一致, 在v0.17.0后废弃maxRedirects, 使用redirect替代, 会强制使用fetch模式

    onload?: Listener<XHRResponse>;
    onloadstart?: Listener<XHRResponse>;
    onloadend?: Listener<XHRResponse>;
    onprogress?: Listener<XHRProgress>;
    onreadystatechange?: Listener<XHRResponse>;
    ontimeout?: () => void;
    onabort?: () => void;
    onerror?: (err: string) => void;
  }

  interface AbortHandle<RETURN_TYPE> {
    abort(): RETURN_TYPE;
  }

  interface DownloadError {
    error: "not_enabled" | "not_whitelisted" | "not_permitted" | "not_supported" | "not_succeeded" | "unknown";
    details?: string;
  }

  interface DownloadDetails {
    method?: "GET" | "POST";
    url: string;
    name: string;
    headers?: { [key: string]: string };
    saveAs?: boolean;
    timeout?: number;
    cookie?: string;
    anonymous?: boolean;

    onerror?: Listener<DownloadError>;
    ontimeout?: () => void;
    onload?: Listener<object>;
    onprogress?: Listener<XHRProgress>;
  }

  interface NotificationThis extends NotificationDetails {
    id: string;
  }

  type NotificationOnClick = (this: NotificationThis, id: string, index?: number) => unknown;
  type NotificationOnDone = (this: NotificationThis, user: boolean) => unknown;

  interface NotificationButton {
    title: string;
    iconUrl?: string;
  }

  interface NotificationDetails {
    text?: string;
    title?: string;
    image?: string;
    highlight?: boolean;
    silent?: boolean;
    timeout?: number;
    onclick?: NotificationOnClick;
    ondone?: NotificationOnDone;
    progress?: number;
    oncreate?: NotificationOnClick;
    buttons?: NotificationButton[];
  }

  interface Tab {
    close(): void;

    onclose?: () => void;
    closed?: boolean;
    name?: string;
  }
}

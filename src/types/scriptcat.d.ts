// @copyright https://github.com/silverwzw/Tampermonkey-Typescript-Declaration

declare const unsafeWindow: Window;

declare const GM_info: {
  version: string;
  scriptWillUpdate: boolean;
  scriptHandler: "ScriptCat";
  scriptUpdateURL?: string;
  scriptSource: string;
  scriptMetaStr?: string;
  isIncognito: boolean;
  downloadMode: "native" | "disabled" | "browser";
  script: {
    author?: string;
    description?: string;
    excludes: string[];
    homepage?: string;
    icon?: string;
    icon64?: string;
    includes?: string[];
    lastModified: number;
    matches: string[];
    name: string;
    namespace?: string;
    position: number;
    "run-at": string;
    resources: string[];
    unwrap: boolean;
    version: string;
    options: {
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
    };
    [key: string]: any;
  };
  [key: string]: any;
};

declare function GM_addStyle(css: string): HTMLElement;

declare function GM_deleteValue(name: string): void;

declare function GM_listValues(): string[];

declare function GM_addValueChangeListener(
  name: string,
  listener: GMTypes.ValueChangeListener,
): number;

declare function GM_removeValueChangeListener(listenerId: number): void;

// 可以使用Promise实际等待值的设置完成
declare function GM_setValue(name: string, value: any): Promise;

declare function GM_getValue(name: string, defaultValue?: any): any;

// 支持level和label
declare function GM_log(
  message: string,
  level?: GMTypes.LoggerLevel,
  labels?: GMTypes.LoggerLabel,
): any;

declare function GM_getResourceText(name: string): string | undefined;

declare function GM_getResourceURL(
  name: string,
  isBlobUrl?: boolean = false,
): string | undefined;

declare function GM_registerMenuCommand(
  name: string,
  listener: () => void,
  accessKey?: string,
): number;

declare function GM_unregisterMenuCommand(id: number): void;

declare function GM_openInTab(
  url: string,
  options: GMTypes.OpenTabOptions,
): tab;
declare function GM_openInTab(url: string, loadInBackground: boolean): tab;
declare function GM_openInTab(url: string): tab;

declare function GM_xmlhttpRequest(
  details: GMTypes.XHRDetails,
): GMTypes.AbortHandle<void>;

declare function GM_download(
  details: GMTypes.DownloadDetails,
): GMTypes.AbortHandle<boolean>;
declare function GM_download(
  url: string,
  filename: string,
): GMTypes.AbortHandle<boolean>;

declare function GM_getTab(callback: (obj: object) => any): void;

declare function GM_saveTab(obj: object): Promise<void>;

declare function GM_getTabs(
  callback: (objs: { [key: number]: object }) => any,
): void;

declare function GM_notification(
  details: GMTypes.NotificationDetails,
  ondone?: GMTypes.NotificationOnDone,
): void;
declare function GM_notification(
  text: string,
  title: string,
  image: string,
  onclick?: GMTypes.NotificationOnClick,
): void;

declare function GM_closeNotification(id: string): void;

declare function GM_updateNotification(
  id: string,
  details: GMTypes.NotificationDetails,
): void;

declare function GM_setClipboard(
  data: string,
  info?: string | { type?: string; minetype?: string },
): void;

declare function GM_addElement(tag: string, attribubutes: any);
declare function GM_addElement(parentNode: Element, tag: string, attrs: any);

// name和domain不能都为空
declare function GM_cookie(
  action: GMTypes.CookieAction,
  details: GMTypes.CookieDetails,
  ondone: (cookie: GMTypes.Cookie[], error: any | undefined) => void,
): void;

/**
 * 可以通过GM_addValueChangeListener获取tabid
 * 再通过tabid(前后端通信可能用到,ValueChangeListener会返回tabid),获取storeid,后台脚本用.
 * 请注意这是一个实验性质的API,后续可能会改变
 * @param tabid 页面的tabid
 * @param ondone 完成事件
 * @param callback.storeid 该页面的storeid,可以给GM_cookie使用
 * @param callback.error 错误信息
 * @deprecated 已废弃,请使用GM_cookie("store", tabid)替代
 */
declare function GM_getCookieStore(
  tabid: number,
  ondone: (storeId: number | undefined, error: any | undefined) => void,
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
 * 操控脚本同步配置的文件储存源,将会在同步目录下创建一个app/(uuid或者storageName)目录供此 API 使用
 * 当声明了@storageName时,可以使用public参数,将创建一个公共的储存空间,可以将文件数据储存至公共的储存空间
 * 否则默认储存在私有储存空间下(app/uuid),使用公共储存空间时,会弹出权限确认用户页面由用户授权
 * 多个脚本也可用此声明共用一个储存空间,上传时默认覆盖同名文件
 * 请注意,当前版本还未支持公共空间
 * @param action 操作类型 list 列出指定目录所有文件, upload 上传文件, download 下载文件, delete 删除文件
 * @param details
 */
declare function CAT_fileStorage(
  action: "list",
  details: {
    path?: string;
    onload?: (files: CATType.FileStorageFileInfo[]) => void;
    onerror?: (error: FileStorageError) => void;
    // public?: boolean;
  },
): void;
declare function CAT_fileStorage(
  action: "download",
  details: {
    filename: string;
    onload: (data: Blob) => void;
    onprogress?: (progress: number) => void;
    onerror?: (error: FileStorageError) => void;
    // public?: boolean;
  },
): void;
declare function CAT_fileStorage(
  action: "delete",
  details: {
    filename: string;
    onload?: () => void;
    onerror?: (error: FileStorageError) => void;
    // public?: boolean;
  },
): void;
declare function CAT_fileStorage(
  action: "upload",
  details: {
    filename: string;
    data: Blob;
    onload?: () => void;
    onprogress?: (progress: number) => void;
    onerror?: (error: FileStorageError) => void;
    // public?: boolean;
  },
): void;

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
    // 错误码 1 用户未配置文件储存源 2 文件储存源配置错误 3 路径不存在
    // 4 文件不存在 5 文件已存在 6 上传失败 7 下载失败 8 删除失败
    code: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    msg: string;
  }

  interface FileStorageFileInfo {
    path: string;
    name: string;
    size: number;
    isDir: boolean;
  }
}

declare namespace GMTypes {
  /*
   * store为获取隐身窗口之类的cookie,这是一个实验性质的API,后续可能会改变
   */
  type CookieAction = "list" | "delete" | "set" | "store";

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
    storeId?: string;
    httpOnly?: boolean;
    expirationDate?: number;
    // store用
    tabId?: number;
  }

  interface Cookie {
    domain: string;
    name: string;
    storeId: string;
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
    oldValue: any,
    newValue: any,
    remote: boolean,
    tabid?: number,
  ) => any;

  interface OpenTabOptions {
    active?: boolean;
    insert?: boolean;
    setParent?: boolean;
  }

  interface XHRResponse {
    finalUrl?: string;
    readyState?: 0 | 1 | 2 | 3 | 4;
    responseHeaders?: string;
    status?: number;
    statusText?: string;
    response?: any;
    responseText?: string;
    responseXML?: Document | null;
    responseType?: "text" | "arraybuffer" | "blob" | "json";
  }

  interface XHRProgress extends XHRResponse {
    done: number;
    lengthComputable: boolean;
    loaded: number;
    position?: number;
    total: number;
    totalSize: number;
  }

  type Listener<OBJ> = (event: OBJ) => any;
  type ContextType = any;

  interface XHRDetails {
    method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
    url: string;
    headers?: { [key: string]: string };
    data?: string | FormData | Blob;
    cookie?: string;
    binary?: boolean;
    timeout?: number;
    context?: ContextType;
    responseType?: "text" | "arraybuffer" | "blob" | "json";
    overrideMimeType?: string;
    anonymous?: boolean;
    fetch?: boolean;
    user?: string;
    password?: string;
    nocache?: boolean;
    maxRedirects?: number;

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
    error:
      | "not_enabled"
      | "not_whitelisted"
      | "not_permitted"
      | "not_supported"
      | "not_succeeded"
      | "unknown";
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

  type NotificationOnClick = (
    this: NotificationThis,
    id: string,
    index?: number,
  ) => any;
  type NotificationOnDone = (this: NotificationThis, user: boolean) => any;

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

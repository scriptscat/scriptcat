declare module "@App/types/scriptcat.d.ts";
declare module "*.tpl";
declare module "*.json";
declare module "*.yaml";
declare module "@App/app/types.d.ts";

type Override<T, U> = Omit<T, keyof U> & U;
type RequireField<T, K extends keyof T> = T & Required<Pick<T, K>>;
type ValueOf<T> = T[keyof T];
type ReactStateSetter<T> = (value: T | ((prev: T) => T)) => void;

declare const sandbox: Window;

declare const self: ServiceWorkerGlobalScope;

type FileSystemEventCallback = (records: any[], observer: FileSystemObserverInstance) => void;

declare const FileSystemObserver: {
  new (callback: FileSystemEventCallback): FileSystemObserverInstance;
};

interface FileSystemChangeRecord {
  root: FileSystemFileHandle | FileSystemDirectoryHandle | FileSystemSyncAccessHandle;
  type: string;
  changedHandle: FileSystemFileHandle;
}

interface FileSystemObserverInstance {
  disconnect(): void;
  observe(handle: FileSystemFileHandle | FileSystemDirectoryHandle | FileSystemSyncAccessHandle): Promise<void>;
}

// File System Access API：标准 DOM lib 未声明，仅 Chromium 提供，运行时以特性检测兜底
interface DataTransferItem {
  getAsFileSystemHandle(): Promise<FileSystemHandle | null>;
}

interface Window {
  showOpenFilePicker(options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandle[]>;
}

declare const UserAgentData: typeof GM_info.userAgentData | undefined;

// 可以让content与inject环境交换携带dom的对象
declare let cloneInto: ((obj: object, targetScope: object, options?: object) => object) | undefined;

declare namespace GMSend {
  interface XHRDetails {
    method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
    url: string;
    headers?: { [key: string]: string };
    data?: string | Array<XHRFormData> | any;
    cookie?: string;
    /**
     *
     * @link https://developer.mozilla.org/zh-CN/docs/Mozilla/Add-ons/WebExtensions/API/cookies#storage_partitioning
     */
    cookiePartition?: {
      topLevelSite?: string;
    };
    binary?: boolean;
    timeout?: number;
    context?: CONTEXT_TYPE;
    responseType?: "" | "text" | "arraybuffer" | "blob" | "json" | "document" | "stream";
    overrideMimeType?: string;
    anonymous?: boolean;
    /** Send request without cookies (Greasemonkey) */
    mozAnon?: boolean;
    fetch?: boolean;
    user?: string;
    password?: string;
    nocache?: boolean;
    /** Force revalidation of cached content: may cache, but must revalidate before using cached content */
    revalidate?: boolean;
    dataType?: "FormData" | "Blob";
    redirect?: "follow" | "error" | "manual";
    byPassConnect?: boolean;
  }

  interface XHRFormDataFile {
    type: "file";
    key: string;
    val: string;
    mimeType: string;
    filename: string;
    lastModified: number;
  }

  interface XHRFormDataText {
    type: "text";
    key: string;
    val: string;
  }

  type XHRFormData = XHRFormDataFile | XHRFormDataText;
}

declare namespace globalThis {
  interface Window {
    external?: External;
  }
  interface External {
    Tampermonkey?: App.ExternalTampermonkey;
    Violentmonkey?: App.ExternalViolentmonkey;
    FireMonkey?: App.ExternalFireMonkey;
    Scriptcat?: App.ExternalScriptCat;
  }
}

// Firefox 在 chrome.* 命名空间下同样支持 browser.cookies 的 firstPartyDomain 参数，但 @types/chrome 未声明
// @link https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/cookies#storage_partitioning
declare namespace chrome.cookies {
  interface GetAllDetails {
    // getAll 专属：字面量 null 代表不按 firstPartyDomain 过滤，且跳过 FPI 必填校验（remove/set 无此语义，见
    // gm_api.ts 内 GM_cookie 的详细注释，依据实测的 Firefox ext-cookies.js 源码，而非 MDN 文档）
    firstPartyDomain?: string | null;
  }
  interface SetDetails {
    firstPartyDomain?: string;
  }
  interface CookieDetails {
    firstPartyDomain?: string;
  }
  interface Cookie {
    firstPartyDomain?: string;
  }
}

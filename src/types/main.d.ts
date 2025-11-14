declare module "@App/types/scriptcat.d.ts";
declare module "*.tpl";
declare module "*.json";
declare module "*.yaml";
declare module "@App/app/types.d.ts";

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

interface MessageFlags {
  // inject 环境flag
  injectFlag: string;
  // content 环境flag
  contentFlag: string;
  // 通信flag
  messageFlag: string;
  // 脚本加载完成事件
  scriptLoadComplete: string;
  // 环境加载完成事件
  envLoadComplete: string;
}

declare const MessageFlags: MessageFlags;

// 可以让content与inject环境交换携带dom的对象
declare let cloneInto: ((detail: any, view: any) => any) | undefined;

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

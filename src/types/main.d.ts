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

declare const MessageFlag: string;
declare const EarlyScriptFlag: string[];

// 可以让content与inject环境交换携带dom的对象
declare let cloneInto: ((detail: any, view: any) => any) | undefined;

declare namespace GMSend {
  interface XHRDetails {
    method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
    url: string;
    headers?: { [key: string]: string };
    data?: string | Array<XHRFormData>;
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
    responseType?: "text" | "arraybuffer" | "blob" | "json" | "document" | "stream";
    overrideMimeType?: string;
    anonymous?: boolean;
    fetch?: boolean;
    user?: string;
    password?: string;
    nocache?: boolean;
    dataType?: "FormData" | "Blob";
    redirect?: "follow" | "error" | "manual";
  }

  interface XHRFormData {
    type?: "file" | "text";
    key: string;
    val: string;
    filename?: string;
  }
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

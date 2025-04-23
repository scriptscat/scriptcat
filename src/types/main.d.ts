declare module "@App/types/scriptcat.d.ts";
declare module "*.tpl";
declare module "*.json";
declare module "*.yaml";

declare const sandbox: Window;

declare const self: ServiceWorkerGlobalScope;

declare const MessageFlag: string;

// 可以让content与inject环境交换携带dom的对象
declare let cloneInto: ((detail: any, view: any) => any) | undefined;

declare namespace GMSend {
  interface XHRDetails {
    method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
    url: string;
    headers?: { [key: string]: string };
    data?: string | Array<XHRFormData>;
    cookie?: string;
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
    maxRedirects?: number; // 为了与tm保持一致, 在v0.17.0后废弃, 使用redirect替代
  }

  interface XHRFormData {
    type?: "file" | "text";
    key: string;
    val: string;
    filename?: string;
  }
}

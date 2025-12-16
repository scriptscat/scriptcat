import { type TMessageCommAction } from "@Packages/message/types";

export const scXhrRequests = new Map<string, string>(); // 关联SC后台发出的 xhr/fetch 的 requestId
export const redirectedUrls = new Map<string, string>(); // 关联SC后台发出的 xhr/fetch 的 redirectUrl
export const nwErrorResults = new Map<string, string>(); // 关联SC后台发出的 xhr/fetch 的 network error
export const nwErrorResultPromises = new Map<string, any>();
// net::ERR_NAME_NOT_RESOLVED, net::ERR_CONNECTION_REFUSED, net::ERR_ABORTED, net::ERR_FAILED

// 接收 xhr/fetch 的 responseHeaders
export const headersReceivedMap = new Map<
  string,
  { responseHeaders: chrome.webRequest.HttpHeader[] | undefined | null; statusCode: number | null }
>();
// 特殊方式处理：以 DNR Rule per request 方式处理 header 修改 (e.g. cookie, unsafeHeader)
export const headerModifierMap = new Map<
  string,
  {
    rule: chrome.declarativeNetRequest.Rule;
    redirectNotManual: boolean;
  }
>();

export class SWRequestResultParams {
  resultParamFinalUrl: string = "";
  resultParamStatusCode: number = 0;
  resultParamResponseHeader: string = "";

  constructor(public markerID: string) {}

  get statusCode() {
    const responsed = headersReceivedMap.get(this.markerID);
    if (responsed && typeof responsed.statusCode === "number") {
      this.resultParamStatusCode = responsed.statusCode;
      responsed.statusCode = null; // 设为 null 避免重复处理
    }
    return this.resultParamStatusCode;
  }

  get responseHeaders() {
    const responsed = headersReceivedMap.get(this.markerID);
    const responseHeaders = responsed && responsed.responseHeaders;
    if (responseHeaders) {
      let out = "";
      let separator = "";
      for (const h of responseHeaders) {
        // TM兼容: 使用 \r\n 及不包含空白
        out += `${separator}${h.name}:${h.value}`;
        separator = "\r\n";
      }
      this.resultParamResponseHeader = out;
      responsed.responseHeaders = null; // 设为 null 避免重复处理
    }
    return this.resultParamResponseHeader;
  }

  get finalUrl() {
    this.resultParamFinalUrl = redirectedUrls.get(this.markerID) || "";
    return this.resultParamFinalUrl;
  }
}

export interface GMXhrStrategy {
  fixMsg(
    msg: TMessageCommAction<{
      finalUrl: any;
      responseHeaders: any;
      readyState: 0 | 1 | 2 | 3 | 4;
      status: number;
      statusText: string;
      useFetch: boolean;
      eventType: string;
      ok: boolean;
      contentType: string;
      error: string | undefined;
    }>
  ): Promise<void>;
}

// fetch策略
export class GMXhrFetchStrategy implements GMXhrStrategy {
  protected requestUrl: string = "";

  public isRedirectError: boolean;

  constructor(
    protected details: GMSend.XHRDetails,
    protected resultParam: SWRequestResultParams
  ) {
    this.requestUrl = details.url;
    this.isRedirectError = details.redirect === "error";
  }

  async fixMsg(msg: TMessageCommAction) {
    // 修正 statusCode 在 接收responseHeader 后会变化的问题 (例如 401 -> 200)
    if (msg.data?.status && this.resultParam.statusCode > 0 && this.resultParam.statusCode !== msg.data?.status) {
      this.resultParam.resultParamStatusCode = msg.data.status;
    }
    if (msg.data?.status === 301) {
      // 兼容TM - redirect: manual 显示原网址
      redirectedUrls.delete(this.resultParam.markerID);
      this.resultParam.resultParamFinalUrl = this.requestUrl;
      msg.data.finalUrl = this.requestUrl;
    } else if (msg.action === "onerror" && this.isRedirectError && msg.data) {
      let nwErr = nwErrorResults.get(this.resultParam.markerID);
      if (!nwErr) {
        // 等 Network Error 捕捉
        await Promise.race([
          new Promise((resolve) => {
            nwErrorResultPromises.set(this.resultParam.markerID, resolve);
          }),
          new Promise((r) => setTimeout(r, 800)),
        ]);
        nwErr = nwErrorResults.get(this.resultParam.markerID);
      }
      if (nwErr) {
        msg.data.status = 408;
        msg.data.statusText = "";
        msg.data.responseHeaders = "";
      }
    }
  }
}

export class GMXhrXhrStrategy implements GMXhrStrategy {
  constructor(protected resultParam: SWRequestResultParams) {}

  async fixMsg(msg: TMessageCommAction) {
    // 修正 statusCode 在 接收responseHeader 后会变化的问题 (例如 401 -> 200)
    if (msg.data?.status && this.resultParam.statusCode > 0 && this.resultParam.statusCode !== msg.data?.status) {
      this.resultParam.resultParamStatusCode = this.resultParam.statusCode;
    }
  }
}

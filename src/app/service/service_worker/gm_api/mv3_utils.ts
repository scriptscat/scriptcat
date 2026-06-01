import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { isFirefox } from "@App/pkg/utils/utils";
import { type FetchXHR } from "@App/pkg/utils/xhr/fetch_xhr";
import { scXhrRequests } from "./gm_xhr";

const bFirefox = isFirefox();
type TbgMarkerMapEntry = {
  markerID: string;
  reqId?: string;
  r?: any;
  url: string;
  resolvePromise: (r: any) => void;
};
const bgMarkerMap = new Map<string, TbgMarkerMapEntry>();
export const normalizeBackgroundRequestUrl = (url: string) => {
  const u = new URL(url);
  // input "https://user:passwd@httpbun.com/basic-auth/user/passwd?q=1&r=2"
  // output "https://httpbun.com/basic-auth/user/passwd?q=1&r=2"
  return `${u.origin}${u.pathname}${u.search}`;
};

export type IWebRequestDetails = {
  /** The value 0 indicates that the request happens in the main frame; a positive value indicates the ID of a subframe in which the request happens. If the document of a (sub-)frame is loaded (`type` is `main_frame` or `sub_frame`), `frameId` indicates the ID of this frame, not the ID of the outer frame. Frame IDs are unique within a tab. */
  frameId: number;
  /** Standard HTTP method. */
  method: string;
  /** ID of frame that wraps the frame which sent the request. Set to -1 if no parent frame exists. */
  parentFrameId: number;
  /** The ID of the request. Request IDs are unique within a browser session. As a result, they could be used to relate different events of the same request. */
  requestId: string;
  /** The ID of the tab in which the request takes place. Set to -1 if the request isn't related to a tab. */
  tabId: number;
  /** The time when this signal is triggered, in milliseconds since the epoch. */
  timeStamp: number;
  /** How the requested resource will be used. */
  type: `${chrome.declarativeNetRequest.ResourceType}`;
  url: string;
  /** [Chrome 63+] The origin where the request was initiated. This does not change through redirects. If this is an opaque origin, the string 'null' will be used. */
  initiator?: string; // chrome MV3
  /** [Firefox 54+] URL of the document in which the resource will be loaded. */
  documentUrl?: string; // firefox MV3
  /** [Firefox 48+] URL of the resource which triggered the request. */
  originUrl?: string; // firefox MV3
};

/** Minimum Requirements: Chrome 63+ or Firefox 54+ */
export const isRequestInitiatorOriginMatched = (request: IWebRequestDetails, targetOrigin: string) => {
  let url: string | undefined;
  try {
    if (typeof request.initiator === "string") {
      url = request.initiator;
    } else if (typeof request.documentUrl === "string" && typeof request.originUrl === "string") {
      url = request.originUrl;
    }
    if (url && url.length > 8 && targetOrigin && targetOrigin.length > 8) {
      // avoid "null"; requires something like "abc://def"
      return url.startsWith(targetOrigin);
    }
  } catch (e) {
    console.error(e);
  }
  return false;
};

type SetupParams = {
  cleanupOnAPIError: (requestId: string) => void;
};

type SendContext = {
  markerID: string;
  url: string;
};

export interface GmXhrRequestLinker {
  setup(params: SetupParams): void;
  prepareRequest(details: GMSend.XHRDetails, headers: { [key: string]: string }, markerID: string): void;
  send(
    baseXHR: FetchXHR | XMLHttpRequest,
    data: XMLHttpRequestBodyInit | null | undefined,
    context: SendContext
  ): Promise<any> | any;
}

const resolver = (o: TbgMarkerMapEntry) => {
  const resolvePromise = o.resolvePromise;
  const result = o.r;
  bgMarkerMap.delete(o.url);
  bgMarkerMap.delete(o.markerID);
  scXhrRequests.set(o.reqId!, o.markerID);
  scXhrRequests.set(o.markerID, o.reqId!);
  o.r = null;
  resolvePromise(result);
};

export class FirefoxWebRequestLinker implements GmXhrRequestLinker {
  private readonly currentOrigin: string = new URL(chrome.runtime.getURL("/")).origin;
  setup({ cleanupOnAPIError }: SetupParams) {
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.webRequest.onBeforeRequest:", lastError);
          // webRequest API 出错不进行后续处理
          cleanupOnAPIError(details?.requestId);
          return undefined;
        }
        if (details.tabId === -1 && isRequestInitiatorOriginMatched(details, this.currentOrigin)) {
          const wURL = normalizeBackgroundRequestUrl(details.url);
          const o = bgMarkerMap.get(wURL);
          if (o) {
            bgMarkerMap.delete(wURL);
            o.reqId = details.requestId;
            resolver(o);
          } else if (scXhrRequests.has(details.requestId)) {
            // redirection to new url
          } else {
            console.error(`onBeforeRequest: No marker ID record for ${wURL}`);
          }
        }
      },
      {
        urls: ["<all_urls>"],
        types: ["xmlhttprequest"],
        tabId: chrome.tabs.TAB_ID_NONE, // 只限于后台 service_worker / offscreen
      }
    );
  }

  prepareRequest(_details: GMSend.XHRDetails, _headers: { [key: string]: string }, _markerID: string) {
    // Firefox links background requests through webRequest requestId capture.
  }

  async send(
    baseXHR: FetchXHR | XMLHttpRequest,
    data: XMLHttpRequestBodyInit | null | undefined,
    { markerID, url }: SendContext
  ) {
    // Send data (if any)
    if (!markerID) return baseXHR.send(data);
    const fn = (resolve: any, _reject: any) => {
      const wURL = normalizeBackgroundRequestUrl(url);
      const o: TbgMarkerMapEntry = {
        url: wURL,
        markerID,
        resolvePromise: resolve,
      };
      bgMarkerMap.delete(markerID);
      bgMarkerMap.delete(wURL);
      bgMarkerMap.set(markerID, o);
      bgMarkerMap.set(wURL, o);
      // Send data (if any)
      o.r = baseXHR.send(data);
    };
    return await stackAsyncTask("bg_gm_xhr_queue", () => new Promise(fn));
  }
}

export class ChromiumHeaderMarkerLinker implements GmXhrRequestLinker {
  setup(_params: SetupParams) {
    const ruleId = 999;
    const rule = {
      id: ruleId,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          {
            header: "x-sc-request-marker",
            operation: "remove",
          },
        ] satisfies chrome.declarativeNetRequest.ModifyHeaderInfo[],
      },
      priority: 1,
      condition: {
        resourceTypes: ["xmlhttprequest"],
        tabIds: [chrome.tabs.TAB_ID_NONE], // 只限于后台 service_worker / offscreen
      },
    } as chrome.declarativeNetRequest.Rule;
    chrome.declarativeNetRequest.updateSessionRules(
      {
        removeRuleIds: [ruleId],
        addRules: [rule],
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.declarativeNetRequest.updateSessionRules:", lastError);
        }
      }
    );
  }

  prepareRequest(_details: GMSend.XHRDetails, headers: { [key: string]: string }, markerID: string) {
    // HTTP/1.1 and HTTP/2
    // https://www.rfc-editor.org/rfc/rfc7540#section-8.1.2
    // https://datatracker.ietf.org/doc/html/rfc6648
    // All header names in HTTP/2 are lower case, and CF will convert if needed.
    // All headers comparisons in HTTP/1.1 should be case insensitive.
    headers["x-sc-request-marker"] = `${markerID}`;
  }

  send(baseXHR: FetchXHR | XMLHttpRequest, data: XMLHttpRequestBodyInit | null | undefined, _context?: SendContext) {
    return baseXHR.send(data);
  }
}

export const gmXhrRequestLinker: GmXhrRequestLinker = bFirefox
  ? new FirefoxWebRequestLinker()
  : new ChromiumHeaderMarkerLinker();

import type { GMXhrStrategy } from "@App/app/service/service_worker/gm_api/gm_xhr";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { chunkUint8, uint8ToBase64 } from "@App/pkg/utils/datatype";
import type { MessageConnect, TMessageCommAction } from "@Packages/message/types";
import { dataDecode } from "./xhr_data";
import { FetchXHR } from "./fetch_xhr";

export type RequestResultParams = {
  statusCode: number;
  responseHeaders: string;
  finalUrl: string;
};

type BgGMXhrCallbackResult = Record<string, any> & {
  //
  readyState: GMTypes.ReadyState;
  status: number;
  statusText: string;
  responseHeaders: string | null;
  //
  useFetch: boolean;
  eventType: string;
  ok: boolean;
  contentType: string;
  error: string | Error | undefined;
  // progress
  total?: number;
  loaded?: number;
  lengthComputable?: boolean;
};

type XHRProgressEvents = "progress";
type XHREvent = ({ type: XHRProgressEvents } & Omit<ProgressEvent<EventTarget>, "type">) | Event;

const isProgressEvent = (e: XHREvent): e is ProgressEvent<EventTarget> & { type: "progress" } => {
  return e.type === "progress";
};

/**
 * ## GM_xmlhttpRequest(details)
 *
 * The `GM_xmlhttpRequest` function allows userscripts to send HTTP requests and handle responses.
 * It accepts a single parameter — an object that defines the request details and callback functions.
 *
 * ---
 * ### Parameters
 *
 * **`details`** — An object describing the HTTP request options:
 *
 * | Property | Type | Description |
 * |-----------|------|-------------|
 * | `method` | `string` | HTTP method (e.g. `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"HEAD"`). |
 * | `url` | `string \| URL \| File \| Blob` | Target URL or file/blob to send. |
 * | `headers` | `Record<string, string>` | Optional headers (e.g. `User-Agent`, `Referer`). Some headers may be restricted on Safari/Android. |
 * | `data` | `string \| Blob \| File \| Object \| Array \| FormData \| URLSearchParams` | Data to send with POST/PUT requests. |
 * | `redirect` | `"follow" \| "error" \| "manual"` | How redirects are handled. |
 * | `cookie` | `string` | Additional cookie to include with the request. |
 * | `cookiePartition` | `object` | (TM5.2+) Cookie partition key. |
 * | `cookiePartition.topLevelSite` | `string` | (TM5.2+) Top frame site for partitioned cookies. |
 * | `binary` | `boolean` | Sends data in binary mode. |
 * | `nocache` | `boolean` | Prevents caching of the resource. |
 * | `revalidate` | `boolean` | Forces cache revalidation. |
 * | `timeout` | `number` | Timeout in milliseconds. |
 * | `context` | `any` | Custom value added to the response object. |
 * | `responseType` | `"arraybuffer" \| "blob" \| "json" \| "stream"` | Type of response data. |
 * | `overrideMimeType` | `string` | MIME type override. |
 * | `anonymous` | `boolean` | If true, cookies are not sent with the request. |
 * | `fetch` | `boolean` | Uses `fetch()` instead of `XMLHttpRequest`. Note: disables `timeout` and progress callbacks in Chrome. |
 * | `user` | `string` | Username for authentication. |
 * | `password` | `string` | Password for authentication. |
 *
 * ---
 * ### Callback Functions
 *
 * | Callback | Description |
 * |-----------|-------------|
 * | `onabort(response)` | Called if the request is aborted. |
 * | `onerror(response)` | Called if the request encounters an error. |
 * | `onloadstart(response)` | Called when the request starts. Provides access to the stream if `responseType` is `"stream"`. |
 * | `onprogress(response)` | Called periodically while the request is loading. |
 * | `onreadystatechange(response)` | Called when the request’s `readyState` changes. |
 * | `ontimeout(response)` | Called if the request times out. |
 * | `onload(response)` | Called when the request successfully completes. |
 *
 * ---
 * ### Response Object
 *
 * Each callback receives a `response` object with the following properties:
 *
 * | Property | Type | Description |
 * |-----------|------|-------------|
 * | `finalUrl` | `string` | The final URL after all redirects. |
 * | `readyState` | `number` | The current `readyState` of the request. |
 * | `status` | `number` | The HTTP status code. |
 * | `statusText` | `string` | The HTTP status text. |
 * | `responseHeaders` | `string` | The raw response headers. |
 * | `response` | `any` | Parsed response data (depends on `responseType`). |
 * | `responseXML` | `Document` | Response data as XML (if applicable). |
 * | `responseText` | `string` | Response data as plain text. |
 *
 * ---
 * ### Return Value
 *
 * `GM_xmlhttpRequest` returns an object with:
 * - `abort()` — Function to cancel the request.
 *
 * The promise-based equivalent is `GM.xmlHttpRequest` (note the capital **H**).
 * It resolves with the same `response` object and also provides an `abort()` method.
 *
 * ---
 * ### Example Usage
 *
 * **Callback-based:**
 * ```ts
 * GM_xmlhttpRequest({
 *   method: "GET",
 *   url: "https://example.com/",
 *   headers: { "Content-Type": "application/json" },
 *   onload: (response) => {
 *     console.log(response.responseText);
 *   },
 * });
 * ```
 *
 * **Promise-based:**
 * ```ts
 * const response = await GM.xmlHttpRequest({ url: "https://example.com/" })
 *   .catch(err => console.error(err));
 *
 * console.log(response.responseText);
 * ```
 *
 * ---
 * **Note:**
 * - The `synchronous` flag in `details` is **not supported**.
 * - You must declare appropriate `@connect` permissions in your userscript header.
 */

// 后台处理端 GM Xhr 实现
export class BgGMXhr {
  private taskId: string;

  private isConnDisconnected: boolean = false;

  constructor(
    private details: GMSend.XHRDetails,
    private resultParams: RequestResultParams,
    private msgConn: MessageConnect,
    private strategy?: GMXhrStrategy
  ) {
    this.taskId = `${Date.now()}:${Math.random()}`;
    this.isConnDisconnected = false;
  }

  onDataReceived(param: { chunk: boolean; type: string; data: any }) {
    stackAsyncTask(this.taskId, async () => {
      if (this.isConnDisconnected) return;
      try {
        let buf: Uint8Array<ArrayBufferLike> | undefined;
        // text / stream (uint8array) / buffer (uint8array) / arraybuffer
        if (param.data instanceof Uint8Array) {
          buf = param.data;
        } else if (param.data instanceof ArrayBuffer) {
          buf = new Uint8Array(param.data);
        }

        if (buf instanceof Uint8Array) {
          const d = buf as Uint8Array<ArrayBuffer>;
          const chunks = chunkUint8(d);
          if (!param.chunk) {
            const msg: TMessageCommAction = {
              action: `reset_chunk_${param.type}`,
              data: {},
            };
            this.msgConn.sendMessage(msg);
          }
          for (const chunk of chunks) {
            const msg: TMessageCommAction = {
              action: `append_chunk_${param.type}`,
              data: {
                chunk: uint8ToBase64(chunk),
              },
            };
            this.msgConn.sendMessage(msg);
          }
        } else if (typeof param.data === "string") {
          const d = param.data as string;
          const c = 2 * 1024 * 1024;
          if (!param.chunk) {
            const msg: TMessageCommAction = {
              action: `reset_chunk_${param.type}`,
              data: {},
            };
            this.msgConn.sendMessage(msg);
          }
          for (let i = 0, l = d.length; i < l; i += c) {
            const chunk = d.substring(i, i + c);
            if (chunk.length) {
              const msg: TMessageCommAction = {
                action: `append_chunk_${param.type}`,
                data: {
                  chunk: chunk,
                },
              };
              this.msgConn.sendMessage(msg);
            }
          }
        }
      } catch (e: any) {
        console.error(e);
      }
    });
  }

  callback(result: BgGMXhrCallbackResult) {
    const data = {
      ...result,
      finalUrl: this.resultParams.finalUrl,
      responseHeaders: this.resultParams.responseHeaders || result.responseHeaders || "",
    };
    const eventType = result.eventType;
    const msg: TMessageCommAction = {
      action: `on${eventType}`,
      data: data,
    };
    stackAsyncTask(this.taskId, async () => {
      await this.strategy?.fixMsg(msg);
      if (eventType === "loadend") {
        this.onloaded?.();
      }
      if (this.isConnDisconnected) return;
      this.msgConn.sendMessage(msg);
    });
  }

  private onloaded: (() => void) | undefined;

  onLoaded(fn: () => void) {
    this.onloaded = fn;
  }

  abort: (() => void) | undefined;

  async bgXhrRequestFn() {
    const details = this.details;

    details.data = dataDecode(details.data as any);
    if (details.data === undefined) delete details.data;

    const anonymous = details.anonymous ?? details.mozAnon ?? false;

    const redirect = details.redirect;

    const isFetch = details.fetch ?? false;

    const isBufferStream = details.responseType === "stream";

    let xhrResponseType: "arraybuffer" | "text" | "" = "";

    const useFetch = isFetch || !!redirect || anonymous || isBufferStream;

    const isNoCache = !!details.nocache;

    const prepareXHR = async () => {
      let rawData = (details.data = await details.data);

      const baseXHR = useFetch
        ? new FetchXHR(isBufferStream, this.onDataReceived.bind(this), (opts: RequestInit) => {
            if (redirect) {
              opts.redirect = redirect;
            }
            if (anonymous) {
              opts.credentials = "omit"; // ensures no cookies or auth headers are sent
              // opts.referrerPolicy = "no-referrer"; // https://javascript.info/fetch-api
            }
            // details for nocache and revalidate shall refer to the following issue:
            // https://github.com/Tampermonkey/tampermonkey/issues/962
            if (isNoCache) {
              // 除了传统的 "Cache-Control", 在浏览器fetch API层面也做一做处理
              opts.cache = "no-store";
            }
          })
        : new XMLHttpRequest();

      this.abort = () => {
        baseXHR.abort();
      };

      const url = details.url;
      if (details.overrideMimeType) {
        baseXHR.overrideMimeType(details.overrideMimeType);
      }

      let contentType = "";
      let responseHeaders: string | null = null;
      let finalStateChangeEvent: XHREvent | null = null;
      let canTriggerFinalStateChangeEvent = false;
      const callback = (evt: XHREvent, err?: Error | string) => {
        const xhr = baseXHR;
        const eventType = evt.type;
        const isProgressEvt = isProgressEvent(evt);

        if (eventType === "load") {
          canTriggerFinalStateChangeEvent = true;
          if (finalStateChangeEvent) callback(finalStateChangeEvent);
        } else if (eventType === "readystatechange" && xhr.readyState === 4) {
          // readyState4 的readystatechange或会重复，见 https://github.com/violentmonkey/violentmonkey/issues/1862
          if (!canTriggerFinalStateChangeEvent) {
            finalStateChangeEvent = evt;
            return;
          }
        }
        canTriggerFinalStateChangeEvent = false;
        finalStateChangeEvent = null;

        // contentType 和 responseHeaders 只读一次
        contentType = contentType || xhr.getResponseHeader("Content-Type") || "";
        if (contentType && !responseHeaders) {
          responseHeaders = xhr.getAllResponseHeaders();
        }
        if (!(xhr instanceof FetchXHR)) {
          const response = xhr.response;
          if (xhr.readyState === 4 && eventType === "readystatechange") {
            if (xhrResponseType === "" || xhrResponseType === "text") {
              this.onDataReceived({ chunk: false, type: "text", data: xhr.responseText });
            } else if (xhrResponseType === "arraybuffer" && response instanceof ArrayBuffer) {
              this.onDataReceived({ chunk: false, type: "arraybuffer", data: response });
            }
          }
        }

        const result: BgGMXhrCallbackResult = {
          /*
        
        
          finalUrl: string; // sw handle
          readyState: 0 | 4 | 2 | 3 | 1;
          status: number;
          statusText: string;
          responseHeaders: string;
          error?: string; // sw handle?

          useFetch: boolean,
          eventType: string,
          ok: boolean,
          contentType: string,
          error: undefined | string,

        */

          useFetch: useFetch,
          eventType: eventType,
          ok: xhr.status >= 200 && xhr.status < 300,
          contentType,
          // Always
          readyState: xhr.readyState as GMTypes.ReadyState,
          // After response headers
          status: xhr.status,
          statusText: xhr.statusText,
          // After load
          // response: response,
          // responseText: responseText,
          // responseXML: responseXML,
          // After headers received
          responseHeaders: responseHeaders,
          responseURL: xhr.responseURL,
          // How to get the error message in native XHR ?
          error: eventType !== "error" ? undefined : (err as Error)?.message || err || "Unknown Error",
        } satisfies BgGMXhrCallbackResult;

        if (isProgressEvt) {
          result.total = evt.total;
          result.loaded = evt.loaded;
          result.lengthComputable = evt.lengthComputable;
        }

        this.callback(result);

        evt.type;
      };
      baseXHR.onabort = callback;
      baseXHR.onloadstart = callback;
      baseXHR.onload = callback;
      baseXHR.onerror = callback;
      baseXHR.onprogress = callback;
      baseXHR.ontimeout = callback;
      baseXHR.onreadystatechange = callback;
      baseXHR.onloadend = callback;

      baseXHR.open(details.method ?? "GET", url, true, details.user, details.password);

      if (details.responseType === "blob" || details.responseType === "document") {
        const err = new Error(
          "Invalid Internal Calling. The internal network function shall only do text/arraybuffer/stream"
        );
        throw err;
      }
      // "" | "arraybuffer" | "blob" | "document" | "json" | "text"
      if (details.responseType === "json") {
        // 故意忽略，json -> text，兼容TM
      } else if (details.responseType === "stream") {
        xhrResponseType = baseXHR.responseType = "arraybuffer";
      } else if (details.responseType) {
        xhrResponseType = baseXHR.responseType = details.responseType;
      }
      if (details.timeout) baseXHR.timeout = details.timeout;
      baseXHR.withCredentials = true;

      // Apply headers
      if (details.headers) {
        for (const [key, value] of Object.entries(details.headers)) {
          baseXHR.setRequestHeader(key, value);
        }
      }

      // details for nocache and revalidate shall refer to the following issue:
      // https://github.com/Tampermonkey/tampermonkey/issues/962
      if (details.nocache) {
        // Never cache anything (always fetch new)
        //
        // Explanation:
        // - The browser and proxies are not allowed to store this response anywhere.
        // - Useful for sensitive or secure data (like banking info or private dashboards).
        // - Ensures no cached version exists on disk, in memory, or in intermediary caches.
        //
        baseXHR.setRequestHeader("Cache-Control", "no-cache, no-store");
        baseXHR.setRequestHeader("Pragma", "no-cache"); // legacy HTTP/1.0 fallback
        baseXHR.setRequestHeader("Expires", "0"); // legacy HTTP/1.0 fallback
      } else if (details.revalidate) {
        // Cache is allowed but must verify with server
        //
        // Explanation:
        // - The response can be cached locally, but it’s marked as “immediately stale”.
        // - On each request, the browser must check with the server (via ETag or Last-Modified)
        //   to confirm whether it can reuse the cached version.
        // - Ideal for data that rarely changes but should always be validated for freshness.
        //
        baseXHR.setRequestHeader("Cache-Control", "max-age=0, must-revalidate");
      }

      // --- Handle request body ---
      // 标准 xhr request 的 body 类型： https://developer.mozilla.org/en/docs/Web/API/XMLHttpRequest/send
      const isStandardRequestBody =
        rawData instanceof URLSearchParams ||
        typeof rawData === "string" ||
        typeof rawData === "number" ||
        typeof rawData === "boolean" ||
        rawData === null ||
        rawData === undefined ||
        rawData instanceof Blob ||
        rawData instanceof FormData ||
        rawData instanceof ArrayBuffer ||
        rawData instanceof Uint8Array;
      // 其他标准以外的物件类型则尝试 JSON 转换
      if (!isStandardRequestBody && typeof rawData === "object") {
        if ((baseXHR.getResponseHeader("Content-Type") || "application/json") !== "application/json") {
          // JSON body
          try {
            rawData = JSON.stringify(rawData);
            baseXHR.setRequestHeader("Content-Type", "application/json");
          } catch {
            rawData = undefined;
          }
        } else {
          rawData = undefined;
        }
      }

      if (details.binary && typeof rawData === "string") {
        // Send the data string as a blob. Compatibility with TM/VM/GM
        rawData = new Blob([rawData], { type: "application/octet-stream" });
      }

      // Send data (if any)
      baseXHR.send(rawData ?? null);
    };

    await prepareXHR();
  }

  do() {
    this.bgXhrRequestFn().catch((e: any) => {
      this.abort?.();
      console.error(e);
    });
    this.msgConn.onDisconnect(() => {
      this.isConnDisconnected = true;
      this.abort?.();
      // console.warn("msgConn.onDisconnect");
    });
  }
}

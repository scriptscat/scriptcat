import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import type GMApi from "./gm_api";
import { dataEncode } from "@App/pkg/utils/xhr/xhr_data";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import { base64ToUint8, concatUint8 } from "@App/pkg/utils/datatype";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import LoggerCore from "@App/app/logger/core";

export type ContextType = unknown;

export type GMXHRResponseType = {
  DONE: number;
  HEADERS_RECEIVED: number;
  LOADING: number;
  OPENED: number;
  UNSENT: number;
  RESPONSE_TYPE_TEXT: string;
  RESPONSE_TYPE_ARRAYBUFFER: string;
  RESPONSE_TYPE_BLOB: string;
  RESPONSE_TYPE_DOCUMENT: string;
  RESPONSE_TYPE_JSON: string;
  RESPONSE_TYPE_STREAM: string;
  context?: ContextType;
  finalUrl: string;
  readyState: 0 | 1 | 4 | 2 | 3;
  status: number;
  statusText: string;
  responseHeaders: string;
  responseType: "" | "text" | "arraybuffer" | "blob" | "json" | "document" | "stream";
  readonly response: string | ArrayBuffer | Blob | Document | ReadableStream<Uint8Array<ArrayBufferLike>> | null;
  readonly responseXML: Document | null;
  readonly responseText: string;
  toString: () => string;
  error?: string;
};

export type GMXHRResponseTypeWithError = GMXHRResponseType & Required<Pick<GMXHRResponseType, "error">>;

export const toBlobURL = (a: GMApi, blob: Blob): Promise<string> | string => {
  // content_GMAPI 都应该在前台的内容脚本或真实页面执行。如果没有 typeof URL.createObjectURL 才使用信息传递交给后台
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(blob);
  } else {
    return a.sendMessage("CAT_createBlobUrl", [blob]);
  }
};

/** Convert a Blob/File to base64 data URL */
export const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.onabort = reject;
    reader.readAsDataURL(blob);
  });
};

export const convObjectToURL = async (object: string | URL | Blob | File | undefined | null) => {
  let url = "";
  if (typeof object === "string") {
    url = object;
  } else if (object instanceof URL) {
    url = object.href;
  } else if (object instanceof Blob) {
    // 不使用 blob URL
    // 1. service worker 不能生成 blob URL
    // 2. blob URL 有效期管理麻烦

    const blob = object;
    url = await blobToDataURL(blob);
  }
  return url;
};

export const urlToDocumentInContentPage = async (a: GMApi, url: string) => {
  // url (e.g. blob url) -> XMLHttpRequest (CONTENT) -> Document (CONTENT)
  const nodeId = await a.sendMessage("CAT_fetchDocument", [url]);
  return (<CustomEventMessage>a.message).getAndDelRelatedTarget(nodeId) as Document;
};

export function GM_xmlhttpRequest(
  a: GMApi,
  details: GMTypes.XHRDetails,
  requirePromise: boolean,
  isDownload: boolean = false
) {
  let reqDone = false;
  if (a.isInvalidContext()) {
    return {
      retPromise: requirePromise ? Promise.reject("GM_xmlhttpRequest: Invalid Context") : null,
      abort: () => {},
    };
  }
  let retPromiseResolve: (value: unknown) => void | undefined;
  let retPromiseReject: (reason?: any) => void | undefined;
  const retPromise = requirePromise
    ? new Promise((resolve, reject) => {
        retPromiseResolve = resolve;
        retPromiseReject = reject;
      })
    : null;
  const urlPromiseLike = typeof details.url === "object" ? convObjectToURL(details.url) : details.url;
  const dataPromise = dataEncode(details.data);
  const headers = details.headers;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "cookie") {
        details.cookie = headers[key];
        delete headers[key];
      }
    }
  }
  const contentContext = details.context;

  const param: GMSend.XHRDetails = {
    method: details.method,
    timeout: details.timeout,
    url: "",
    headers: details.headers,
    cookie: details.cookie,
    responseType: details.responseType,
    overrideMimeType: details.overrideMimeType,
    anonymous: details.anonymous,
    user: details.user,
    password: details.password,
    redirect: details.redirect,
    fetch: details.fetch,
  };
  if (!param.headers) {
    param.headers = {};
  }
  if (details.nocache) {
    param.headers["Cache-Control"] = "no-cache";
  }
  let connect: MessageConnect | null;
  const responseTypeOriginal = details.responseType?.toLocaleLowerCase() || "";
  let doAbort: any = null;
  const handler = async () => {
    const [urlResolved, dataResolved] = await Promise.all([urlPromiseLike, dataPromise]);
    const u = new URL(urlResolved, window.location.href);
    param.url = u.href;
    param.data = dataResolved;

    // 处理返回数据
    let readerStream: ReadableStream<Uint8Array> | undefined;
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    // 如果返回类型是arraybuffer或者blob的情况下,需要将返回的数据转化为blob
    // 在background通过URL.createObjectURL转化为url,然后在content页读取url获取blob对象
    if (responseTypeOriginal === "stream") {
      readerStream = new ReadableStream<Uint8Array>({
        start(ctrl) {
          controller = ctrl;
        },
      });
    } else {
      // document类型读取blob,然后在content页转化为document对象
      switch (responseTypeOriginal) {
        case "arraybuffer":
        case "blob":
          param.responseType = "arraybuffer";
          break;
        case "document":
        case "json":
        case "":
        case "text":
        default:
          param.responseType = "text";
          break;
      }
    }
    const xhrType = param.responseType;
    const responseType = responseTypeOriginal; // 回传用

    // 发送信息
    a.connect(isDownload ? "GM_download" : "GM_xmlhttpRequest", [param]).then((con) => {
      // 注意。在此 callback 里，不应直接存取 param, 否则会影响 GC
      connect = con;
      const resultTexts = [] as string[]; // 函数参考清掉后，变数会被GC
      const resultBuffers = [] as Uint8Array<ArrayBuffer>[]; // 函数参考清掉后，变数会被GC
      let finalResultBuffers: Uint8Array<ArrayBuffer> | null = null; // 函数参考清掉后，变数会被GC
      let finalResultText: string | null = null; // 函数参考清掉后，变数会被GC
      let isEmptyResult = true;
      const asyncTaskId = `${Date.now}:${Math.random()}`;
      let lastStateAndCode = "";

      let errorOccur: string | null = null;
      let response: unknown = null;
      let responseText: string | undefined | false = "";
      let responseXML: unknown = null;
      let resultType = 0;
      if (readerStream) {
        response = readerStream;
        responseText = undefined; // 兼容
        responseXML = undefined; // 兼容
      }
      readerStream = undefined;

      let refCleanup: (() => void) | null = () => {
        // 清掉函数参考，避免各变数参考无法GC
        makeXHRCallbackParam = null;
        onMessageHandler = null;
        doAbort = null;
        refCleanup = null;
        connect = null;
      };

      const makeXHRCallbackParam_ = (
        res: {
          //
          finalUrl: string;
          readyState: 0 | 4 | 2 | 3 | 1;
          status: number;
          statusText: string;
          responseHeaders: string;
          error?: string;
          //
          useFetch: boolean;
          eventType: string;
          ok: boolean;
          contentType: string;
        } & Record<string, any>
      ) => {
        let resError: Record<string, any> | null = null;
        if (
          (typeof res.error === "string" &&
            (res.status === 0 || res.status >= 300 || res.status < 200) &&
            !res.statusText &&
            isEmptyResult) ||
          res.error === "aborted"
        ) {
          resError = {
            error: res.error as string,
            readyState: res.readyState as 0 | 4 | 2 | 3 | 1,
            // responseType: responseType as "text" | "arraybuffer" | "blob" | "json" | "document" | "stream" | "",
            response: null,
            responseHeaders: res.responseHeaders as string,
            responseText: "",
            status: res.status as number,
            statusText: "",
          };
        }
        let retParam;
        if (resError) {
          retParam = {
            DONE: 4,
            HEADERS_RECEIVED: 2,
            LOADING: 3,
            OPENED: 1,
            UNSENT: 0,
            RESPONSE_TYPE_TEXT: "text",
            RESPONSE_TYPE_ARRAYBUFFER: "arraybuffer",
            RESPONSE_TYPE_BLOB: "blob",
            RESPONSE_TYPE_DOCUMENT: "document",
            RESPONSE_TYPE_JSON: "json",
            RESPONSE_TYPE_STREAM: "stream",
            toString: () => "[object Object]", // follow TM
            ...resError,
          } as GMXHRResponseType;
        } else {
          retParam = {
            DONE: 4,
            HEADERS_RECEIVED: 2,
            LOADING: 3,
            OPENED: 1,
            UNSENT: 0,
            RESPONSE_TYPE_TEXT: "text",
            RESPONSE_TYPE_ARRAYBUFFER: "arraybuffer",
            RESPONSE_TYPE_BLOB: "blob",
            RESPONSE_TYPE_DOCUMENT: "document",
            RESPONSE_TYPE_JSON: "json",
            RESPONSE_TYPE_STREAM: "stream",
            finalUrl: res.finalUrl as string,
            readyState: res.readyState as 0 | 4 | 2 | 3 | 1,
            status: res.status as number,
            statusText: res.statusText as string,
            responseHeaders: res.responseHeaders as string,
            responseType: responseType as "text" | "arraybuffer" | "blob" | "json" | "document" | "stream" | "",
            get response() {
              if (response === false) {
                switch (responseTypeOriginal) {
                  case "json": {
                    const text = this.responseText;
                    let o = undefined;
                    try {
                      o = JSON.parse(text);
                    } catch {
                      // ignored
                    }
                    response = o; // TM兼容 -> o : object | undefined
                    break;
                  }
                  case "document": {
                    response = this.responseXML;
                    break;
                  }
                  case "arraybuffer": {
                    finalResultBuffers ||= concatUint8(resultBuffers);
                    const full = finalResultBuffers;
                    response = full.buffer; // ArrayBuffer
                    break;
                  }
                  case "blob": {
                    finalResultBuffers ||= concatUint8(resultBuffers);
                    const full = finalResultBuffers;
                    const type = res.contentType || "application/octet-stream";
                    response = new Blob([full], { type }); // Blob
                    break;
                  }
                  default: {
                    // text
                    response = `${this.responseText}`;
                    break;
                  }
                }
                if (reqDone) {
                  resultTexts.length = 0;
                  resultBuffers.length = 0;
                }
              }
              return response as string | ArrayBuffer | Blob | Document | ReadableStream<Uint8Array> | null;
            },
            get responseXML() {
              if (responseXML === false) {
                const text = this.responseText;
                if (
                  ["application/xhtml+xml", "application/xml", "image/svg+xml", "text/html", "text/xml"].includes(
                    res.contentType
                  )
                ) {
                  responseXML = new DOMParser().parseFromString(text, res.contentType as DOMParserSupportedType);
                } else {
                  responseXML = new DOMParser().parseFromString(text, "text/xml");
                }
              }
              return responseXML as Document | null;
            },
            get responseText() {
              if (responseTypeOriginal === "document") {
                // console.log(resultType, resultBuffers.length, resultTexts.length);
              }
              if (responseText === false) {
                if (resultType === 2) {
                  finalResultBuffers ||= concatUint8(resultBuffers);
                  const buf = finalResultBuffers.buffer as ArrayBuffer;
                  const decoder = new TextDecoder("utf-8");
                  const text = decoder.decode(buf);
                  responseText = text;
                } else {
                  // resultType === 3
                  if (finalResultText === null) finalResultText = `${resultTexts.join("")}`;
                  responseText = finalResultText;
                }
                if (reqDone) {
                  resultTexts.length = 0;
                  resultBuffers.length = 0;
                }
              }
              return responseText as string;
            },
            toString: () => "[object Object]", // follow TM
          } as GMXHRResponseType;
          if (res.error) {
            retParam.error = res.error;
          }
          if (responseType === "json" && retParam.response === null) {
            response = undefined; // TM不使用null，使用undefined
          }
        }
        if (typeof contentContext !== "undefined") {
          retParam.context = contentContext;
        }
        return retParam;
      };
      let makeXHRCallbackParam: typeof makeXHRCallbackParam_ | null = makeXHRCallbackParam_;
      doAbort = (data: any) => {
        if (!reqDone) {
          errorOccur = "AbortError";
          details.onabort?.(makeXHRCallbackParam?.(data) ?? {});
          reqDone = true;
          refCleanup?.();
        }
        doAbort = null;
      };

      let onMessageHandler: ((data: TMessage<any>) => void) | null = (msgData: TMessage<any>) => {
        stackAsyncTask(asyncTaskId, async () => {
          const data = msgData.data as Record<string, any> & {
            //
            finalUrl: string;
            readyState: 0 | 4 | 2 | 3 | 1;
            status: number;
            statusText: string;
            responseHeaders: string;
            //
            useFetch: boolean;
            eventType: string;
            ok: boolean;
            contentType: string;
            error: undefined | string;
          };
          if (msgData.code === -1) {
            // 处理错误
            LoggerCore.logger().error("GM_xmlhttpRequest error", {
              code: msgData.code,
              message: msgData.message,
            });
            details.onerror?.({
              readyState: 4,
              error: msgData.message || "unknown",
            });
            return;
          }
          // 处理返回
          switch (msgData.action) {
            case "reset_chunk_arraybuffer":
            case "reset_chunk_blob":
            case "reset_chunk_buffer": {
              resultBuffers.length = 0;
              isEmptyResult = true;
              break;
            }
            case "reset_chunk_document":
            case "reset_chunk_json":
            case "reset_chunk_text": {
              resultTexts.length = 0;
              isEmptyResult = true;
              break;
            }
            case "append_chunk_stream": {
              const d = msgData.data.chunk as string;
              const u8 = base64ToUint8(d);
              resultBuffers.push(u8);
              isEmptyResult = false;
              controller?.enqueue(base64ToUint8(d));
              resultType = 1;
              break;
            }
            case "append_chunk_arraybuffer":
            case "append_chunk_blob":
            case "append_chunk_buffer": {
              const d = msgData.data.chunk as string;
              const u8 = base64ToUint8(d);
              resultBuffers.push(u8);
              isEmptyResult = false;
              resultType = 2;
              break;
            }
            case "append_chunk_document":
            case "append_chunk_json":
            case "append_chunk_text": {
              const d = msgData.data.chunk as string;
              resultTexts.push(d);
              isEmptyResult = false;
              resultType = 3;
              break;
            }
            case "onload":
              details.onload?.(makeXHRCallbackParam?.(data) ?? {});
              break;
            case "onloadend": {
              reqDone = true;
              responseText = false;
              finalResultBuffers = null;
              finalResultText = null;
              const xhrReponse = makeXHRCallbackParam?.(data) ?? {};
              details.onloadend?.(xhrReponse);
              if (errorOccur === null) {
                retPromiseResolve?.(xhrReponse);
              } else {
                retPromiseReject?.(errorOccur);
              }
              refCleanup?.();
              break;
            }
            case "onloadstart":
              details.onloadstart?.(makeXHRCallbackParam?.(data) ?? {});
              break;
            case "onprogress": {
              if (details.onprogress) {
                if (!xhrType || xhrType === "text") {
                  responseText = false; // 设为false 表示需要更新。在 get setter 中更新
                  response = false; // 设为false 表示需要更新。在 get setter 中更新
                  responseXML = false; // 设为false 表示需要更新。在 get setter 中更新
                }
                const res = {
                  ...(makeXHRCallbackParam?.(data) ?? {}),
                  lengthComputable: data.lengthComputable as boolean,
                  loaded: data.loaded as number,
                  total: data.total as number,
                  done: data.loaded,
                  totalSize: data.total,
                };
                details.onprogress?.(res);
              }
              break;
            }
            case "onreadystatechange": {
              // 避免xhr的readystatechange多次触发问题。见 https://github.com/violentmonkey/violentmonkey/issues/1862
              const curStateAndCode = `${data.readyState}:${data.status}`;
              if (curStateAndCode === lastStateAndCode) return;
              lastStateAndCode = curStateAndCode;
              if (data.readyState === 4) {
                if (resultType === 1) {
                  // stream type
                  controller = undefined; // GC用
                } else if (resultType === 2) {
                  // buffer type
                  responseText = false; // 设为false 表示需要更新。在 get setter 中更新
                  response = false; // 设为false 表示需要更新。在 get setter 中更新
                  responseXML = false; // 设为false 表示需要更新。在 get setter 中更新
                  /*
                    if (xhrType === "blob") {
                      const full = concatUint8(resultBuffers);
                      const type = data.data.contentType || "application/octet-stream";
                      response = new Blob([full], { type }); // Blob
                      if (responseTypeOriginal === "document") {
                        const blobURL = await toBlobURL(a, response as Blob);
                        const document = await urlToDocumentLocal(a, blobURL);
                        response = document;
                        responseXML = document;
                      }
                    } else if (xhrType === "arraybuffer") {
                      const full = concatUint8(resultBuffers);
                      response = full.buffer; // ArrayBuffer
                    }
                      */
                } else if (resultType === 3) {
                  // string type

                  responseText = false; // 设为false 表示需要更新。在 get setter 中更新
                  response = false; // 设为false 表示需要更新。在 get setter 中更新
                  responseXML = false; // 设为false 表示需要更新。在 get setter 中更新
                  /*
                    if (xhrType === "json") {
                      const full = resultTexts.join("");
                      try {
                        response = JSON.parse(full);
                      } catch {
                        response = null;
                      }
                      responseText = full; // XHR exposes responseText even for JSON
                    } else if (xhrType === "document") {
                      // 不应该出现 document type
                      console.error("ScriptCat: Invalid Calling in GM_xmlhttpRequest");
                      responseText = "";
                      response = null;
                      responseXML = null;
                      // const full = resultTexts.join("");
                      // try {
                      //   response = strToDocument(a, full, data.data.contentType as DOMParserSupportedType);
                      // } catch {
                      //   response = null;
                      // }
                      // if (response) {
                      //   responseXML = response;
                      // }
                    } else {
                      const full = resultTexts.join("");
                      response = full;
                      responseText = full;
                    }
                      */
                }
              }
              details.onreadystatechange?.(makeXHRCallbackParam?.(data) ?? {});
              break;
            }
            case "ontimeout":
              if (!reqDone) {
                errorOccur = "TimeoutError";
                details.ontimeout?.(makeXHRCallbackParam?.(data) ?? {});
                reqDone = true;
                refCleanup?.();
              }
              break;
            case "onerror":
              if (!reqDone) {
                data.error ||= "Unknown Error";
                errorOccur = data.error;
                details.onerror?.((makeXHRCallbackParam?.(data) ?? {}) as GMXHRResponseTypeWithError);
                reqDone = true;
                refCleanup?.();
              }
              break;
            case "onabort":
              doAbort?.(data);
              break;
            // case "onstream":
            //   controller?.enqueue(new Uint8Array(data));
            //   break;
            default:
              LoggerCore.logger().warn("GM_xmlhttpRequest resp is error", {
                data: msgData,
              });
              break;
          }
        });
      };

      connect?.onMessage((msgData) => onMessageHandler?.(msgData));
    });
  };
  // 由于需要同步返回一个abort，但是一些操作是异步的，所以需要在这里处理
  handler();
  return {
    retPromise,
    abort: () => {
      if (connect) {
        connect.disconnect();
        connect = null;
      }
      if (doAbort && details.onabort && !reqDone) {
        // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/abort
        // When a request is aborted, its readyState is changed to XMLHttpRequest.UNSENT (0) and the request's status code is set to 0.
        doAbort?.({
          error: "aborted",
          responseHeaders: "",
          readyState: 0,
          status: 0,
          statusText: "",
        }) as GMXHRResponseType;
        reqDone = true;
      }
    },
  };
}

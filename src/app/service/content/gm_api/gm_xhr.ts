import { Native } from "../global";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import type GMApi from "./gm_api";
import { dataEncode } from "@App/pkg/utils/xhr/xhr_data";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import { base64ToUint8, concatUint8 } from "@App/pkg/utils/datatype";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import LoggerCore from "@App/app/logger/core";

const ChunkResponseCode = {
  NONE: 0,
  READABLE_STREAM: 1,
  UINT8_ARRAY_BUFFER: 2,
  STRING: 3,
} as const;

type ChunkResponseCode = ValueOf<typeof ChunkResponseCode>;

const ReadyStateCode = {
  UNSENT: 0,
  OPENED: 1,
  HEADERS_RECEIVED: 2,
  LOADING: 3,
  DONE: 4,
} as const;

type ReadyStateCode = ValueOf<typeof ReadyStateCode>;

type GMXhrResponseObjectType = ArrayBuffer | Blob | Document | ReadableStream<Uint8Array<ArrayBufferLike>>;

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
  readyState: ReadyStateCode;
  status: number;
  statusText: string;
  responseHeaders: string;
  responseType: "" | "text" | "arraybuffer" | "blob" | "json" | "document" | "stream";
  readonly response?: string | GMXhrResponseObjectType | null | undefined;
  readonly responseXML?: Document | null | undefined;
  readonly responseText?: string | undefined;
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

const getMimeType = (contentType: string) => {
  let mime = contentType;
  const i = mime.indexOf(";");
  if (i > 0) mime = mime.substring(0, i);
  mime = mime.trim().toLowerCase();
  return mime;
};

const docParseTypes = new Set(["application/xhtml+xml", "application/xml", "image/svg+xml", "text/html", "text/xml"]);

const retStateFnMap = new WeakMap<ThisType<GMXHRResponseType>, RetStateFnRecord>();

interface RetStateFnRecord {
  getResponseText(): string | undefined;
  getResponseXML(): Document | null | undefined;
  getResponse(): string | GMXhrResponseObjectType | null | undefined;
}

// 对齐 TM, getter属性 enumerable=false 及 configurable=false
// 这影响 Object.assign({}, response) 的行为
const xhrResponseGetters = {
  response: {
    get() {
      const retTemp = retStateFnMap.get(this);
      return retTemp?.getResponse();
    },
    enumerable: false,
    configurable: false,
  },
  responseXML: {
    get() {
      const retTemp = retStateFnMap.get(this);
      return retTemp?.getResponseXML();
    },
    enumerable: false,
    configurable: false,
  },
  responseText: {
    get() {
      const retTemp = retStateFnMap.get(this);
      return retTemp?.getResponseText();
    },
    enumerable: false,
    configurable: false,
  },
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
  if (details.method) {
    details.method = `${details.method}`.toUpperCase() as typeof details.method;
  }

  let param: GMSend.XHRDetails | null = {
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
  (async () => {
    const [urlResolved, dataResolved] = await Promise.all([urlPromiseLike, dataPromise]);
    const u = new URL(urlResolved, window.location.href);
    param.url = u.href;
    param.data = dataResolved;

    // 处理返回数据
    const isStreamResponse = responseTypeOriginal === "stream";
    let readerStream: ReadableStream<Uint8Array<ArrayBufferLike>> | undefined;
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    // 如果返回类型是arraybuffer或者blob的情况下,需要将返回的数据转化为blob
    // 在background通过URL.createObjectURL转化为url,然后在content页读取url获取blob对象
    if (isStreamResponse) {
      readerStream = new ReadableStream<Uint8Array<ArrayBufferLike>>({
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
    // const xhrType = param.responseType;
    // const responseType = responseTypeOriginal; // 回传用

    // 发送信息
    let connectMessage: Promise<MessageConnect>;
    if (isDownload) {
      // 如果是下载，带上 downloadMode 参数，呼叫 SW 的 GM_download
      // 在 SW 中处理，实际使用 GM_xmlhttpRequest 进行下载
      const method = param.method === "POST" ? "POST" : "GET";
      const downloadParam: GMTypes.DownloadDetails<string> = { ...param, method, downloadMode: "native", name: "" };
      connectMessage = a.connect("GM_download", [downloadParam]);
    } else {
      // 一般 GM_xmlhttpRequest，呼叫 SW 的 GM_xmlhttpRequest
      connectMessage = a.connect("GM_xmlhttpRequest", [param]);
    }
    param = null; // GC
    connect = await connectMessage;

    const resultTexts = [] as string[]; // 函数参考清掉后，变数会被GC
    const resultBuffers = [] as Uint8Array<ArrayBuffer>[]; // 函数参考清掉后，变数会被GC
    let finalResultBuffers: Uint8Array<ArrayBuffer> | null = null; // 函数参考清掉后，变数会被GC
    let finalResultText: string | null = null; // 函数参考清掉后，变数会被GC
    let isEmptyResult = true;
    const asyncTaskId = `${Date.now()}:${Math.random()}`;
    let lastStateAndCode = "";
    let allowResponse = false; // readyState 未达至 4 (DONE) 时，不提供 response, responseText, responseXML

    let errorOccur: string | null = null;
    let response: unknown = null;
    let responseText: string | undefined | false = "";
    let responseXML: unknown = null;
    let resultType: ChunkResponseCode = ChunkResponseCode.NONE;
    if (readerStream) {
      allowResponse = true; // TM 特殊处理。 fetchXhr stream 无视 readyState
      response = readerStream;
      responseText = undefined; // TM兼容
      responseXML = undefined; // TM兼容
      readerStream = undefined;
    }

    let refCleanup: (() => void) | null = () => {
      // 清掉函数参考，避免各变数参考无法GC
      makeXHRCallbackParam = null;
      onMessageHandler = null;
      doAbort = null;
      refCleanup = null;
      connect = null;
    };

    const markResponseDirty = () => {
      // 标记内部变数需要重新读取
      // reqDone 或 readerStream 的情况，不需要重置
      if (!reqDone && !isStreamResponse) {
        response = false;
        responseText = false;
        responseXML = false;
        finalResultText = null;
        finalResultBuffers = null;
      }
    };

    const makeRetTemp = (contentType: string) => {
      return {
        getResponse() {
          if (response === false) {
            // 注： isStreamResponse 为 true 时 response 不会为 false
            switch (responseTypeOriginal) {
              case "json": {
                const text = this.getResponseText();
                let o = undefined;
                if (text) {
                  try {
                    o = Native.jsonParse(text);
                  } catch {
                    // ignored
                  }
                }
                response = o; // TM兼容 -> o : object | undefined
                break;
              }
              case "document": {
                response = this.getResponseXML();
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
                const type = contentType || "application/octet-stream";
                response = new Blob([full], { type }); // Blob
                break;
              }
              default: {
                // text
                response = `${this.getResponseText()}`;
                break;
              }
            }
            if (reqDone) {
              resultTexts.length = 0;
              resultBuffers.length = 0;
            }
          }
          if (responseTypeOriginal === "json" && response === null) {
            response = undefined; // TM不使用null，使用undefined
          }
          return response as string | GMXhrResponseObjectType | null | undefined;
        },
        getResponseXML() {
          if (responseXML === false) {
            // 注： isStreamResponse 为 true 时 responseXML 不会为 false
            const text = this.getResponseText();
            const mime = getMimeType(contentType);
            const parseType = docParseTypes.has(mime) ? (mime as DOMParserSupportedType) : "text/xml";
            if (text !== undefined) {
              try {
                responseXML = new DOMParser().parseFromString(text, parseType);
              } catch (e) {
                // 对齐 TM 处理。Trusted Type Policy受限制时返回 null
                responseXML = null;
                console.error(e);
              }
            } else {
              responseXML = undefined;
            }
          }
          return responseXML as Document | null | undefined;
        },
        getResponseText() {
          if (responseText === false) {
            // 注： isStreamResponse 为 true 时 responseText 不会为 false
            if (resultType === ChunkResponseCode.UINT8_ARRAY_BUFFER) {
              finalResultBuffers ||= concatUint8(resultBuffers);
              const buf = finalResultBuffers.buffer as ArrayBuffer;
              const decoder = new TextDecoder("utf-8");
              const text = decoder.decode(buf);
              responseText = text;
            } else {
              // resultType === ChunkResponseCode.STRING
              if (finalResultText === null) finalResultText = `${resultTexts.join("")}`;
              responseText = finalResultText;
            }
            if (reqDone) {
              resultTexts.length = 0;
              resultBuffers.length = 0;
            }
          }
          return responseText as string | undefined;
        },
      };
    };

    const makeResponseRet = (retParam: GMXHRResponseType, addGetters: boolean, contentType: string) => {
      let descriptors: ReturnType<typeof Object.getOwnPropertyDescriptors<GMXHRResponseType>> = {
        ...Object.getOwnPropertyDescriptors(retParam),
      };
      if (!addGetters) return Object.create(null, descriptors);
      descriptors = {
        ...descriptors,
        ...xhrResponseGetters,
      };
      // 对齐 TM, res.constructor = undefined, res.__proto__ = undefined
      const retParamObject: GMXHRResponseType = Object.create(null, descriptors);
      // 外部没引用 retParamObject 时，retTemp 会被自动GC
      const retTemp = makeRetTemp(contentType);
      retStateFnMap.set(retParamObject, retTemp);
      return retParamObject;
    };

    const makeXHRCallbackParam_ = (
      res: {
        //
        finalUrl: string;
        readyState: ReadyStateCode;
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
      if ((res.readyState === 4 || reqDone) && res.eventType !== "progress") allowResponse = true;
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
          readyState: res.readyState as ReadyStateCode,
          // responseType: responseType as "text" | "arraybuffer" | "blob" | "json" | "document" | "stream" | "",
          response: null,
          responseHeaders: res.responseHeaders as string,
          responseText: "",
          status: res.status as number,
          statusText: "",
        };
      }
      const responseTypeDef = {
        DONE: ReadyStateCode.DONE,
        HEADERS_RECEIVED: ReadyStateCode.HEADERS_RECEIVED,
        LOADING: ReadyStateCode.LOADING,
        OPENED: ReadyStateCode.OPENED,
        UNSENT: ReadyStateCode.UNSENT,
        RESPONSE_TYPE_TEXT: "text",
        RESPONSE_TYPE_ARRAYBUFFER: "arraybuffer",
        RESPONSE_TYPE_BLOB: "blob",
        RESPONSE_TYPE_DOCUMENT: "document",
        RESPONSE_TYPE_JSON: "json",
        RESPONSE_TYPE_STREAM: "stream",
        toString: () => "[object Object]", // follow TM
      } as GMXHRResponseType;
      let retParam: GMXHRResponseType;
      let addGetters = false;
      if (resError) {
        retParam = {
          ...responseTypeDef,
          ...resError,
        } as GMXHRResponseType;
      } else {
        const retParamBase = {
          ...responseTypeDef,
          finalUrl: res.finalUrl as string,
          readyState: res.readyState as ReadyStateCode,
          status: res.status as number,
          statusText: res.statusText as string,
          responseHeaders: res.responseHeaders as string,
          responseType: responseTypeOriginal as "text" | "arraybuffer" | "blob" | "json" | "document" | "stream" | "",
        };
        if (allowResponse) {
          // 依照 TM 的规则：当 readyState 不等于 4 时，回应中不会有 response、responseXML 或 responseText。
          addGetters = true;
        }
        retParam = retParamBase;
        if (res.error) {
          retParam.error = res.error;
        }
      }
      if (typeof contentContext !== "undefined") {
        retParam.context = contentContext;
      }

      return makeResponseRet(retParam, addGetters, res.contentType);
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
          readyState: ReadyStateCode;
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
            readyState: ReadyStateCode.DONE,
            error: msgData.message || "unknown",
          });
          return;
        }
        // 处理返回
        switch (msgData.action) {
          case "reset_chunk_arraybuffer":
          case "reset_chunk_blob":
          case "reset_chunk_buffer": {
            if (reqDone || isStreamResponse) {
              // 理论上不应发生，仅作为逻辑控制的保护。
              console.error("Invalid call of reset_chunk [buf]");
              break;
            }
            resultBuffers.length = 0;
            isEmptyResult = true;
            markResponseDirty();
            break;
          }
          case "reset_chunk_document":
          case "reset_chunk_json":
          case "reset_chunk_text": {
            if (reqDone || isStreamResponse) {
              // 理论上不应发生，仅作为逻辑控制的保护。
              console.error("Invalid call of reset_chunk [str]");
              break;
            }
            resultTexts.length = 0;
            isEmptyResult = true;
            markResponseDirty();
            break;
          }
          case "append_chunk_stream": {
            // by fetch_xhr, isStreamResponse = true
            const d = msgData.data.chunk as string;
            const u8 = base64ToUint8(d);
            resultBuffers.push(u8);
            isEmptyResult = false;
            controller?.enqueue(base64ToUint8(d));
            resultType = ChunkResponseCode.READABLE_STREAM;
            break;
          }
          case "append_chunk_arraybuffer":
          case "append_chunk_blob":
          case "append_chunk_buffer": {
            if (reqDone || isStreamResponse) {
              // 理论上不应发生，仅作为逻辑控制的保护。
              console.error("Invalid call of append_chunk [buf]");
              break;
            }
            const d = msgData.data.chunk as string;
            const u8 = base64ToUint8(d);
            resultBuffers.push(u8);
            isEmptyResult = false;
            resultType = ChunkResponseCode.UINT8_ARRAY_BUFFER;
            markResponseDirty();
            break;
          }
          case "append_chunk_document":
          case "append_chunk_json":
          case "append_chunk_text": {
            if (reqDone || isStreamResponse) {
              // 理论上不应发生，仅作为逻辑控制的保护。
              console.error("Invalid call of append_chunk [str]");
              break;
            }
            const d = msgData.data.chunk as string;
            resultTexts.push(d);
            isEmptyResult = false;
            resultType = ChunkResponseCode.STRING;
            markResponseDirty();
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
            if (isStreamResponse && data.readyState === ReadyStateCode.DONE) {
              // readable stream 的 controller 可以释放
              controller = undefined; // GC用
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
  })();
  // 由于需要同步返回一个abort，但是一些操作是异步的，所以需要在这里处理
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

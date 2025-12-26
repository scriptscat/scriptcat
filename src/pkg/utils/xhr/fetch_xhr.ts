interface ProgressLikeEvent {
  loaded: number;
  total: number;
  lengthComputable: boolean;
}

type ResponseType = "" | "text" | "json" | "blob" | "arraybuffer" | "document";

export class FetchXHR {
  constructor(
    private isBufferStream: boolean,
    private onDataReceived: (param: { chunk: boolean; type: string; data: any }) => void,
    private extraOptsFn: (opts: RequestInit) => void
  ) {}

  // XHR-like constants for convenience
  static readonly UNSENT = 0 as const;
  static readonly OPENED = 1 as const;
  static readonly HEADERS_RECEIVED = 2 as const;
  static readonly LOADING = 3 as const;
  static readonly DONE = 4 as const;

  // Public XHR-ish fields
  readyState: GMTypes.ReadyState = 0;
  status = 0;
  statusText = "";
  responseURL = "";
  responseType: ResponseType = "";
  response: unknown = null;
  responseText = ""; // not used
  responseXML = null; // not used
  timeout = 0; // ms; 0 = no timeout
  withCredentials = false; // fetch doesn’t support cookies toggling per-request; kept for API parity

  // Event handlers
  onreadystatechange: ((evt: Partial<Event>) => void) | null = null;
  onloadstart: ((evt: Partial<Event>) => void) | null = null;
  onload: ((evt: Partial<Event>) => void) | null = null;
  onloadend: ((evt: Partial<Event>) => void) | null = null;
  onerror: ((evt: Partial<Event>, err?: Error | string) => void) | null = null;
  onprogress: ((evt: Partial<ProgressLikeEvent> & { type: string }) => void) | null = null;
  onabort: ((evt: Partial<Event>) => void) | null = null;
  ontimeout: ((evt: Partial<Event>) => void) | null = null;

  private isAborted: boolean = false;
  private reqDone: boolean = false;

  // Internal
  private method: string | null = null;
  private url: string | null = null;
  private headers = new Headers();
  private body: BodyInit | null = null;
  private controller: AbortController | null = null;
  private timedOut = false;
  private timeoutId: number | null = null;
  private _responseHeaders: {
    getAllResponseHeaders: () => string;
    getResponseHeader: (name: string) => string | null;
    cache: Record<any, any>;
  } | null = null;

  open(method: string, url: string, _async?: boolean, username?: string, password?: string) {
    if (username && password !== undefined) {
      this.headers.set("Authorization", "Basic " + btoa(`${username}:${password}`));
    } else if (username && password === undefined) {
      this.headers.set("Authorization", "Basic " + btoa(`${username}:`));
    }
    this.method = method.toUpperCase();
    this.url = url;
    this.readyState = FetchXHR.OPENED;
    // 对齐 TM 的实现：上层不处理 readyState 从 0 到 1 的 onreadystatechange 事件。
    // 说明：底层核心实现应尽量保持通用性，避免为 TM 引入特殊处理。
    this._emitReadyStateChange();
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  getAllResponseHeaders(): string {
    if (this._responseHeaders === null) return "";
    return this._responseHeaders.getAllResponseHeaders();
  }

  getResponseHeader(name: string): string | null {
    // Per XHR semantics, header names are case-insensitive
    if (this._responseHeaders === null) return null;
    return this._responseHeaders.getResponseHeader(name);
  }

  overrideMimeType(_mime: string) {
    // Not supported by fetch; no-op to keep parity.
  }

  async send(body?: BodyInit | null) {
    if (this.readyState !== FetchXHR.OPENED || !this.method || !this.url) {
      throw new Error("Invalid state: call open() first.");
    }
    this.reqDone = false;

    this.body = body ?? null;
    this.controller = new AbortController();

    // Setup timeout if specified
    if (this.timeout > 0) {
      this.timeoutId = setTimeout(() => {
        if (this.controller && !this.reqDone) {
          this.timedOut = true;
          this.controller.abort();
        }
      }, this.timeout) as unknown as number;
    }

    try {
      const opts: RequestInit = {
        method: this.method,
        headers: this.headers,
        body: this.body,
        signal: this.controller.signal,
        // credentials: 'include' cannot be toggled per request like XHR.withCredentials; set at app level if needed.
      };
      this.extraOptsFn?.(opts);
      this.onloadstart?.({ type: "loadstart" });
      const res = await fetch(this.url, opts);

      // Update status + headers
      this.status = res.status;
      this.statusText = res.statusText ?? "";
      this.responseURL = res.url ?? this.url;
      this._responseHeaders = {
        getAllResponseHeaders(): string {
          let ret: string | undefined = this.cache[""];
          if (ret === undefined) {
            // 对齐 TM 的实现：由上层负责将 getAllResponseHeaders() 的格式对齐
            // 说明：底层核心实现应尽量保持通用性，避免针对 TM 引入特殊处理。
            ret = "";
            for (const [k, v] of res.headers) {
              ret += `${k}: ${v}\r\n`;
            }
            this.cache[""] = ret;
          }
          return ret;
        },
        getResponseHeader(name: string): string | null {
          if (!name) return null;
          return (this.cache[name] ||= res.headers.get(name)) as string | null;
        },
        cache: {},
      };

      const ct = res.headers.get("content-type")?.toLowerCase() || "";
      const ctI = ct.indexOf("charset=");
      let encoding = "utf-8"; // fetch defaults are UTF-8
      if (ctI >= 0) {
        let ctJ = ct.indexOf(";", ctI + 8);
        ctJ = ctJ > ctI ? ctJ : ct.length;
        encoding = ct.substring(ctI + 8, ctJ).trim() || encoding;
      }

      this.readyState = FetchXHR.HEADERS_RECEIVED;
      this._emitReadyStateChange();

      let responseOverrided: ReadableStream<Uint8Array<ArrayBufferLike>> | null = null;

      // Storage buffers for different responseTypes
      // const chunks: Uint8Array<ArrayBufferLike>[] = [];

      // From Chromium 105, you can start a request before you have the whole body available by using the Streams API.
      // https://developer.chrome.com/docs/capabilities/web-apis/fetch-streaming-requests?hl=en
      // -> TextDecoderStream

      let textDecoderStream;
      let textDecoder;
      const receiveAsPlainText =
        this.responseType === "" ||
        this.responseType === "text" ||
        this.responseType === "document" || // SC的处理是把 document 当作 blob 处理。仅保留这处理实现完整工具库功能
        this.responseType === "json";

      if (receiveAsPlainText) {
        if (typeof TextDecoderStream === "function" && Symbol.asyncIterator in ReadableStream.prototype) {
          // try ReadableStream
          try {
            textDecoderStream = new TextDecoderStream(encoding);
          } catch {
            textDecoderStream = new TextDecoderStream("utf-8");
          }
        } else {
          // fallback to ReadableStreamDefaultReader
          // fatal: true - throw on errors instead of inserting the replacement char
          try {
            textDecoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true });
          } catch {
            textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
          }
        }
      }

      let customStatus = null;
      if (res.body === null) {
        if (res.type === "opaqueredirect") {
          customStatus = 301;
        } else {
          throw new Error("Response Body is null");
        }
      } else if (res.body !== null) {
        // Stream body for progress
        let streamReader;
        let streamReadable;
        if (textDecoderStream) {
          streamReadable = res.body?.pipeThrough(textDecoderStream);
          if (!streamReadable) throw new Error("streamReadable is undefined.");
        } else {
          streamReader = res.body?.getReader();
          if (!streamReader) throw new Error("streamReader is undefined.");
        }

        let didLoaded = false;

        const contentLengthHeader = res.headers.get("content-length");
        const total = contentLengthHeader ? Number(contentLengthHeader) : -1;
        let loaded = 0;
        const firstLoad = () => {
          if (!didLoaded) {
            didLoaded = true;
            // Move to LOADING state as soon as we start reading
            this.readyState = FetchXHR.LOADING;
            // 对齐 TM 的实现：上层不处理 readyState 从 2 到 3 的 onreadystatechange 事件。
            // 说明：底层核心实现应尽量保持通用性，避免为 TM 引入特殊处理。
            this._emitReadyStateChange();
          }
        };
        let streamDecoding = false;
        const pushBuffer = (chunk: Uint8Array<ArrayBuffer> | string | undefined | null) => {
          if (!chunk) return;
          const added = typeof chunk === "string" ? chunk.length : chunk.byteLength;
          if (added) {
            loaded += added;
            if (typeof chunk === "string") {
              this.onDataReceived({ chunk: true, type: "text", data: chunk });
            } else if (this.isBufferStream) {
              this.onDataReceived({ chunk: true, type: "stream", data: chunk });
            } else if (receiveAsPlainText) {
              streamDecoding = true;
              const data = textDecoder!.decode(chunk, { stream: true }); // keep decoder state between chunks
              this.onDataReceived({ chunk: true, type: "text", data: data });
            } else {
              this.onDataReceived({ chunk: true, type: "buffer", data: chunk });
            }

            if (this.onprogress) {
              this.onprogress({
                type: "progress",
                loaded, // decoded buffer bytelength. no specification for decoded or encoded. https://developer.mozilla.org/en-US/docs/Web/API/ProgressEvent/loaded
                total, // Content-Length. The total encoded bytelength (gzip/br)
                lengthComputable: false, // always assume compressed data. See https://developer.mozilla.org/en-US/docs/Web/API/ProgressEvent/lengthComputable
              });
            }
          }
        };

        if (this.isBufferStream && streamReader) {
          const streamReaderConst = streamReader;
          let myController = null;
          const makeController = async (controller: ReadableStreamDefaultController<any>) => {
            try {
              while (true) {
                const { done, value } = await streamReaderConst.read();
                firstLoad();
                if (done) break;
                controller.enqueue(new Uint8Array(value));
                pushBuffer(value);
              }
              controller.close();
            } catch {
              controller.error("XHR failed");
            }
          };
          responseOverrided = new ReadableStream<Uint8Array<ArrayBufferLike>>({
            start(controller) {
              myController = controller;
            },
          });
          this.response = responseOverrided;
          await makeController(myController!);
        } else if (streamReadable) {
          // receiveAsPlainText
          if (Symbol.asyncIterator in streamReadable && typeof streamReadable[Symbol.asyncIterator] === "function") {
            // https://developer.mozilla.org/ja/docs/Web/API/ReadableStream
            //@ts-ignore
            for await (const chunk of streamReadable) {
              firstLoad(); // ensure firstLoad() is always called
              if (chunk.length) {
                pushBuffer(chunk);
              }
            }
          } else {
            const streamReader = streamReadable.getReader();
            try {
              while (true) {
                const { done, value } = await streamReader.read();
                firstLoad(); // ensure firstLoad() is always called
                if (done) break;
                pushBuffer(value);
              }
            } catch (e) {
              console.error("streamReader error", e);
            } finally {
              streamReader.releaseLock();
            }
          }
        } else if (streamReader) {
          try {
            while (true) {
              const { done, value } = await streamReader.read();
              firstLoad(); // ensure firstLoad() is always called
              if (done) {
                if (streamDecoding) {
                  const data = textDecoder!.decode(); // flush trailing bytes
                  // this.onDataReceived({ chunk: true, type: "text", data: data });
                  pushBuffer(data);
                }
                break;
              }
              pushBuffer(value);
            }
          } catch (e) {
            console.error("streamReader error", e);
          } finally {
            streamReader.releaseLock();
          }
        } else {
          firstLoad();
          // Fallback: no streaming support — read fully
          const buf = new Uint8Array<ArrayBuffer>(await res.arrayBuffer());
          pushBuffer(buf);
          if (streamDecoding) {
            const data = textDecoder!.decode(); // flush trailing bytes
            // this.onDataReceived({ chunk: true, type: "text", data: data });
            pushBuffer(data);
          }
        }
      }

      this.status = customStatus || res.status;
      this.statusText = res.statusText ?? "";
      this.responseURL = res.url ?? this.url;

      if (this.isAborted) {
        const err = new Error("AbortError");
        err.name = "AbortError";
        throw err;
      }

      this.readyState = FetchXHR.DONE;
      this._emitReadyStateChange();
      this.onload?.({ type: "load" });
    } catch (err) {
      this.controller = null;
      if (this.timeoutId != null) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.status = 0;

      if (this.timedOut && !this.reqDone) {
        this.reqDone = true;
        this.ontimeout?.({ type: "timeout" });
        return;
      }

      if ((err as any)?.name === "AbortError" && !this.reqDone) {
        this.reqDone = true;
        this.readyState = FetchXHR.UNSENT;
        this.status = 0;
        this.statusText = "";
        this.onabort?.({ type: "abort" });
        return;
      }

      this.readyState = FetchXHR.DONE;
      if (!this.reqDone) {
        this.reqDone = true;
        this.onerror?.({ type: "error" }, (err || "Unknown Error") as Error | string);
      }
    } finally {
      this.controller = null;
      if (this.timeoutId != null) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.reqDone = true;
      this.onloadend?.({ type: "loadend" });
    }
  }

  abort() {
    this.isAborted = true;
    if (!this.reqDone) {
      this.controller?.abort();
    }
  }

  // Utility to fire readyState changes
  private _emitReadyStateChange() {
    this.onreadystatechange?.({ type: "readystatechange" });
  }
}

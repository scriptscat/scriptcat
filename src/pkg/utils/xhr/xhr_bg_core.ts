
/**
 * Greasemonkey/Tampermonkey GM_xmlhttpRequest API.
 * @example
 * GM_xmlhttpRequest({
 *   method: 'GET',
 *   url: 'https://example.com/',
 *   onload: (res) => console.log(res.responseText),
 * });
 */

/**
 * 在后台实际进行 xhr / fetch 的操作
 * Network Request in Background
 * 只接受 "", "text", "arraybuffer", 及 "stream"
 * @param details Input
 * @param settings Control
 */
export const bgXhrRequestFn = async <T = any>(details: XmlhttpRequestFnDetails<T>, settings: any) => {
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

    // console.log("rawData", rawData);

    const baseXHR = useFetch
      ? new FetchXHR({
          extraOptsFn: (opts: RequestInit) => {
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
          },
          isBufferStream,
          onDataReceived: settings.onDataReceived,
        })
      : new XMLHttpRequest();

    settings.abort = () => {
      baseXHR.abort();
    };

    const url = details.url;
    if (details.overrideMimeType) {
      baseXHR.overrideMimeType(details.overrideMimeType);
    }

    let contentType = "";
    let responseHeaders: string | null = null;
    let finalStateChangeEvent: Event | ProgressEvent<EventTarget> | null = null;
    let canTriggerFinalStateChangeEvent = false;
    const callback = (evt: Event | ProgressEvent<EventTarget>, err?: Error | string) => {
      const xhr = baseXHR;
      const eventType = evt.type;

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
            settings.onDataReceived({ chunk: false, type: "text", data: xhr.responseText });
          } else if (xhrResponseType === "arraybuffer" && response instanceof ArrayBuffer) {
            settings.onDataReceived({ chunk: false, type: "arraybuffer", data: response });
          }
        }
      }
      settings.callback({
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
        readyState: xhr.readyState,
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
      });

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

    // // --- Handle request body ---
    // if (
    //   rawData instanceof URLSearchParams ||
    //   typeof rawData === "string" ||
    //   rawData instanceof Blob ||
    //   rawData instanceof FormData
    // ) {
    //   requestInit.body = rawData as BodyInit;
    // } else if (rawData && typeof rawData === "object" && !(rawData instanceof ArrayBuffer)) {
    //   // JSON body
    //   requestInit.body = JSON.stringify(rawData);
    //   if (!headers.has("Content-Type")) {
    //     headers.set("Content-Type", "application/json");
    //   }
    // }

    // // --- Handle cookies (if any) ---
    // if (cookie) {
    //   requestInit.headers ||= {};
    //   // if (!headers.has("Cookie")) {
    //   headers.set("Cookie", cookie);
    //   // }
    // }

    // --- Handle request body ---
    if (
      rawData instanceof URLSearchParams ||
      typeof rawData === "string" ||
      typeof rawData === "number" ||
      typeof rawData === "boolean" ||
      rawData === null ||
      rawData === undefined ||
      rawData instanceof Blob ||
      rawData instanceof FormData ||
      rawData instanceof ArrayBuffer ||
      rawData instanceof Uint8Array
    ) {
      //
    } else if (rawData && typeof rawData === "object" && !(rawData instanceof ArrayBuffer)) {
      if ((baseXHR.getResponseHeader("Content-Type") || "application/json") !== "application/json") {
        // JSON body
        rawData = JSON.stringify(rawData);
        baseXHR.setRequestHeader("Content-Type", "application/json");
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
};

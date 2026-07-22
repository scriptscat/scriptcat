// ==UserScript==
// @name         GM_xmlhttpRequest Exhaustive Test Harness v3
// @namespace    tm-gmxhr-test
// @version      1.3.0
// @description  Comprehensive in-page tests for GM_xmlhttpRequest: normal, abnormal, and edge cases with clear pass/fail output.
// @author       you
// @match        *://*/*?GM_XHR_TEST_SC
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @connect      httpbingo.org
// @connect      nonexistent-domain-abcxyz.test
// @connect      raw.githubusercontent.com
// @connect      translate.googleapis.com
// @noframes
// ==/UserScript==

/*
  WHAT THIS DOES
  --------------
  - Runs a battery of tests probing GM_xmlhttpRequest options, callbacks, and edge/abnormal paths.
  - Uses httpbin.org endpoints for deterministic echo/response behavior.
  - Prints a summary and a detailed per-test log with assertions.

  NOTE: Endpoints now point to https://httpbingo.org (a faster httpbin-like service).
        See https://httpbingo.org for docs and exact paths. (Also supports /get, /post, /bytes/{n}, /delay/{s}, /status/{code}, /redirect-to, /headers, /any, etc.)
*/

/*
  WHAT IT COVERS
  --------------
  ✓ method (GET/POST/PUT/DELETE/HEAD/OPTIONS)
  ✓ url & redirects (finalUrl)
  ✓ headers (custom headers echoed by server)
  ✓ data (form-encoded, JSON, and raw/binary body)
  ✓ responseType: '', 'json', 'arraybuffer', 'blob'
  ✓ overrideMimeType
  ✓ timeout + ontimeout
  ✓ onprogress (with streaming-ish endpoint)
  ✓ onload (non-2xx still onload)
  ✓ onerror (DNS/blocked host)
  ✓ onabort (manual abort)
  ✓ anonymous (no cookies)
  ✓ basic auth (user/password)
  ✓ edge cases: huge headers trimmed? invalid method; invalid URL; missing @connect domain triggers onerror
*/

const enableTool = true;
(async function () {
  "use strict";
  if (!enableTool) return;

  const { describe, it, expect, run } = SCTest.create({ name: "GM_xmlhttpRequest 完整测试" });

  // value type helper
  const typing = (x) => {
    let t = x === null ? "null" : typeof x;
    if (!x) t = `<${t}>`;
    if (t === "object") {
      try {
        return x[Symbol.toStringTag] || "object";
      } catch (e) {}
    }
    return t;
  };

  const statusCode = (response) => {
    return (+response.readyState + +response.status / 1000).toFixed(3);
  };

  const resPrint = (r) => {
    const a = statusCode(r);
    const b1 = "response" in r ? typing(r.response) : "missing";
    const b2 = "responseText" in r ? typing(r.responseText) : "missing";
    const b3 = "responseXML" in r ? typing(r.responseXML) : "missing";
    return `${a};r=${b1};t=${b2};x=${b3}`;
  };

  const isFirefox = typeof mozInnerScreenX === "number";

  // ---------- Request helper ----------
  function gmRequest(details, { abortAfterMs } = {}) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const req = GM_xmlhttpRequest({
        ...details,
        onload: (res) => resolve({ kind: "load", res, ms: performance.now() - t0 }),
        onerror: (res) => reject({ kind: "error", res, ms: performance.now() - t0 }),
        ontimeout: (res) => reject({ kind: "timeout", res, ms: performance.now() - t0 }),
        onabort: (res) => reject({ kind: "abort", res, ms: performance.now() - t0 }),
        onprogress: details.onprogress,
      });
      if (abortAfterMs != null) {
        setTimeout(() => {
          try {
            req.abort();
          } catch (_) {
            /* ignore */
          }
        }, abortAfterMs);
      }
    });
  }

  // Switched base host from httpbin to httpbingo (faster).
  // See: https://httpbingo.org (endpoints: /get, /post, /bytes/{n}, /delay/{s}, /status/{code}, /redirect-to, /headers, /any, etc.)
  const HB = "https://httpbingo.org";

  // Helper: handle minor schema diffs between httpbin/httpbingo for query echo
  function getQueryObj(body) {
    // httpbin uses "args", httpbingo may use "query" (and still often provides "args" for compatibility).
    return body.args || body.query || body.params || {};
  }

  const encodedBase64 =
    "VGhlIHF1aWNrIGJyb3duIGZveCBqdW1wcyBvdmVyIHRoZSBsYXp5IGRvZy4gVGhpcyBzZW50ZW5jZSBjb250YWlucyBldmVyeSBsZXR0ZXIgb2YgdGhlIEVuZ2xpc2ggYWxwaGFiZXQgYW5kIGlzIG9mdGVuIHVzZWQgZm9yIHR5cGluZyBwcmFjdGljZSwgZm9udCB0ZXN0aW5nLCBhbmQgZW5jb2RpbmcgZXhwZXJpbWVudHMuIEJhc2U2NCBlbmNvZGluZyB0cmFuc2Zvcm1zIHRoaXMgcmVhZGFibGUgdGV4dCBpbnRvIGEgc2VxdWVuY2Ugb2YgQVNDSUkgY2hhcmFjdGVycyB0aGF0IGNhbiBzYWZlbHkgYmUgdHJhbnNtaXR0ZWQgb3Igc3RvcmVkIGluIHN5c3RlbXMgdGhhdCBoYW5kbGUgdGV4dC1vbmx5IGRhdGEu";
  const decodedBase64 =
    "The quick brown fox jumps over the lazy dog. This sentence contains every letter of the English alphabet and is often used for typing practice, font testing, and encoding experiments. Base64 encoding transforms this readable text into a sequence of ASCII characters that can safely be transmitted or stored in systems that handle text-only data.";

  // ---------- Tests ----------
  const basicTests = [
    {
      name: "GET basic [responseType: undefined]",
      async run(fetch) {
        const url = `${HB}/base64/${encodedBase64}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(decodedBase64);
        expect(res.response).toBe(decodedBase64);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET basic [responseType: ""]',
      async run(fetch) {
        const url = `${HB}/base64/${encodedBase64}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(decodedBase64);
        expect(res.response).toBe(decodedBase64);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET basic [responseType: "text"]',
      async run(fetch) {
        const url = `${HB}/base64/${encodedBase64}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "text",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(decodedBase64);
        expect(res.response).toBe(decodedBase64);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },

    {
      name: 'GET basic [responseType: "json"]',
      async run(fetch) {
        const url = `${HB}/base64/${encodedBase64}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "json",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(decodedBase64);
        expect(res.response).toBe(undefined);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET basic [responseType: "document"]',
      async run(fetch) {
        const url = `${HB}/base64/${encodedBase64}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "document",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(decodedBase64);
        expect(res.response instanceof XMLDocument).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET basic [responseType: "stream"]',
      async run(fetch) {
        const url = `${HB}/base64/${encodedBase64}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "stream",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(undefined);
        expect(res.response instanceof ReadableStream).toBe(true);
        expect(res.responseXML).toBe(undefined);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET basic [responseType: "arraybuffer"]',
      async run(fetch) {
        const url = `${HB}/base64/${encodedBase64}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "arraybuffer",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(decodedBase64);
        expect(res.response instanceof ArrayBuffer).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET basic [responseType: "blob"]',
      async run(fetch) {
        const url = `${HB}/base64/${encodedBase64}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "blob",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(decodedBase64);
        expect(res.response instanceof Blob).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "GET json [responseType: undefined]",
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          fetch,
        });
        expect(res.status).toBe(200);
        expect(`${res.responseText}`.includes('"method": "GET"')).toBe(true);
        expect(`${res.response}`.includes('"method": "GET"')).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET json [responseType: ""]',
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(`${res.responseText}`.includes('"method": "GET"')).toBe(true);
        expect(`${res.response}`.includes('"method": "GET"')).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET json [responseType: "text"]',
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "text",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(`${res.responseText}`.includes('"method": "GET"')).toBe(true);
        expect(`${res.response}`.includes('"method": "GET"')).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET json [responseType: "json"]',
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "json",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(`${res.responseText}`.includes('"method": "GET"')).toBe(true);
        expect(typeof res.response === "object" && res.response?.method === "GET").toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET json [responseType: "document"]',
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "document",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(`${res.responseText}`.includes('"method": "GET"')).toBe(true);
        expect(res.response instanceof XMLDocument).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET json [responseType: "stream"]',
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "stream",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(undefined);
        expect(res.response instanceof ReadableStream).toBe(true);
        expect(res.responseXML).toBe(undefined);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET json [responseType: "arraybuffer"]',
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "arraybuffer",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(`${res.responseText}`.includes('"method": "GET"')).toBe(true);
        expect(res.response instanceof ArrayBuffer).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET json [responseType: "blob"]',
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "blob",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(`${res.responseText}`.includes('"method": "GET"')).toBe(true);
        expect(res.response instanceof Blob).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "GET bytes [responseType: undefined]",
      async run(fetch) {
        const url = `${HB}/bytes/32`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText?.length >= 8 && res.responseText?.length <= 32).toBe(true);
        expect(res.response).toBe(res.responseText);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET bytes [responseType: ""]',
      async run(fetch) {
        const url = `${HB}/bytes/32`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText?.length >= 8 && res.responseText?.length <= 32).toBe(true);
        expect(res.response).toBe(res.responseText);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET bytes [responseType: "text"]',
      async run(fetch) {
        const url = `${HB}/bytes/32`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "text",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText?.length >= 8 && res.responseText?.length <= 32).toBe(true);
        expect(res.response).toBe(res.responseText);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET bytes [responseType: "json"]',
      async run(fetch) {
        const url = `${HB}/bytes/32`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "json",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText?.length >= 8 && res.responseText?.length <= 32).toBe(true);
        expect(res.response).toBe(undefined);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET bytes [responseType: "document"]',
      async run(fetch) {
        const url = `${HB}/bytes/32`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "document",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText?.length >= 8 && res.responseText?.length <= 32).toBe(true);
        expect(res.response instanceof XMLDocument).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET bytes [responseType: "stream"]',
      async run(fetch) {
        const url = `${HB}/bytes/32`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "stream",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText).toBe(undefined);
        expect(res.response instanceof ReadableStream).toBe(true);
        expect(res.responseXML).toBe(undefined);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET bytes [responseType: "arraybuffer"]',
      async run(fetch) {
        const url = `${HB}/bytes/32`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "arraybuffer",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText?.length >= 8 && res.responseText?.length <= 32).toBe(true);
        expect(res.response instanceof ArrayBuffer).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET bytes [responseType: "blob"]',
      async run(fetch) {
        const url = `${HB}/bytes/32`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "blob",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText?.length >= 8 && res.responseText?.length <= 32).toBe(true);
        expect(res.response instanceof Blob).toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "GET basic + headers + finalUrl",
      async run(fetch) {
        const url = `${HB}/get?x=1`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          headers: { "X-Custom": "Hello", Accept: "application/json" },
          fetch,
        });
        const body = JSON.parse(res.responseText);
        expect(res.status).toBe(200);
        const q = getQueryObj(body);
        expect(q.x?.[0] ?? q.x).toBe("1");
        const hdrs = body.headers || {};
        const customHeader = hdrs["X-Custom"] || hdrs["x-custom"];
        expect(Array.isArray(customHeader) ? customHeader[0] : customHeader).toBe("Hello");
        expect(res.finalUrl).toBe(url);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [default]",
      async run(fetch) {
        const target = `${HB}/get?z=92`;
        const url = `${HB}/redirect-to?url=${encodeURIComponent(target)}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.finalUrl).toBe(target);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [follow]",
      async run(fetch) {
        const target = `${HB}/get?z=94`;
        const url = `${HB}/redirect-to?url=${encodeURIComponent(target)}`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          redirect: "follow",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.finalUrl).toBe(target);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [error]",
      async run(fetch) {
        const target = `${HB}/get?z=96`;
        const url = `${HB}/redirect-to?url=${encodeURIComponent(target)}`;

        let res;
        try {
          res = await Promise.race([
            gmRequest({
              method: "GET",
              url,
              redirect: "error",
              fetch,
            }),
            new Promise((resolve) => setTimeout(resolve, 4000)),
          ]);
          throw new Error("Expected error, got load");
        } catch (e) {
          expect(e?.kind).toBe("error");
          expect(e?.res?.status).toBe(408);
          expect(!e?.res?.finalUrl).toBe(true);
          expect(e?.res?.responseHeaders).toBe("");
          expect(objectProps(e?.res)).toBe("ok");
        }
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [manual]",
      async run(fetch) {
        const target = `${HB}/get?z=98`;
        const url = `${HB}/redirect-to?url=${encodeURIComponent(target)}`;

        const { res } = await Promise.race([
          gmRequest({
            method: "GET",
            url,
            redirect: "manual",
            fetch,
          }),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
        expect(res?.status).toBe(301);
        expect(res?.finalUrl).toBe(url);
        expect(typeof res?.responseHeaders).toBe("string");
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "POST form-encoded data",
      async run(fetch) {
        const params = new URLSearchParams({ a: "1", b: "two" }).toString();
        const { res } = await gmRequest({
          method: "POST",
          url: `${HB}/post`,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          data: params,
          fetch,
        });
        const body = JSON.parse(res.responseText);
        expect(res.status).toBe(200);
        expect((body.form?.a || [])[0]).toBe("1");
        expect((body.form?.b || [])[0]).toBe("two");
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "POST JSON body",
      async run(fetch) {
        const payload = { alpha: 123, beta: "hey" };
        const { res } = await gmRequest({
          method: "POST",
          url: `${HB}/post`,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify(payload),
          fetch,
        });
        const body = JSON.parse(res.responseText);
        expect(res.status).toBe(200);
        expect(body.json).toEqual(payload);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Send binary body (Uint8Array) + responseType text",
      async run(fetch) {
        const bytes = new Uint8Array([1, 2, 3, 4, 5]);
        const { res } = await gmRequest({
          method: "POST",
          url: `${HB}/post`,
          binary: true,
          data: bytes,
          fetch,
        });
        const body = JSON.parse(res.responseText);
        expect(res.status).toBe(200);
        expect(body.data && body.data.length > 0).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "responseType=arraybuffer (download bytes)",
      async run(fetch) {
        let progressCounter = 0;
        const size = 40; // MAX 90
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/bytes/${size}`,
          responseType: "arraybuffer",
          onprogress() {
            progressCounter++;
          },
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.response instanceof ArrayBuffer).toBeTruthy();
        expect(res.response.byteLength).toBe(size);
        expect(progressCounter >= 1).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "responseType=blob",
      async run(fetch) {
        let progressCounter = 0;
        const size = 40; // MAX 90
        // httpbingo doesn't have /image/png; use /bytes to ensure blob download
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/bytes/${size}`,
          responseType: "blob",
          onprogress() {
            progressCounter++;
          },
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.response instanceof Blob).toBeTruthy();
        const buf = await res.response.arrayBuffer();
        expect(buf.byteLength).toBe(size);
        expect(progressCounter >= 1).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
        // Do not assert image MIME; httpbingo returns octet-stream here.
      },
    },
    {
      name: "responseType=json",
      async run(fetch) {
        // Use /ip which returns JSON
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/ip`,
          responseType: "json",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.response && typeof res.response === "object").toBeTruthy();
        expect(res.response.origin).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "responseType=document(parse ok)",
      async run(fetch) {
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/base64/PHRlc3QtMTIzPmhlbGxvPC90ZXN0LTEyMz4=`,
          responseType: "document",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.response instanceof Document).toBeTruthy();
        expect(res.responseXML !== null).toBeTruthy();
        expect(!!res.responseXML.querySelector("test-123")).toBeTruthy();
      },
    },
    {
      name: "responseType=document(parser error)",
      async run(fetch) {
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/base64/AAAAAAEAAQA=`,
          responseType: "document",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.response instanceof Document).toBeTruthy();
        expect(res.responseXML !== null).toBeTruthy();
        expect(!!res.responseXML.querySelector("parsererror")).toBeTruthy();
      },
    },
    {
      name: "overrideMimeType (force text)",
      async run(fetch) {
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/ip`,
          overrideMimeType: "text/plain;charset=utf-8",
          fetch,
        });
        expect(res.status).toBe(200);
        expect(typeof res.responseText === "string" && res.responseText.length > 0).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Timeout + ontimeout",
      async run(fetch) {
        try {
          await gmRequest({
            method: "GET",
            url: `${HB}/delay/3`, // waits ~3s
            timeout: 1000,
            fetch,
          });
          throw new Error("Expected timeout, got load");
        } catch (e) {
          expect(e.kind).toBe("timeout");
        }
      },
    },
    {
      name: "GM_xhr abort timeout onloadend events",
      async run(fetch) {
        const runCase = (details, { abortAfterMs } = {}) => {
          return new Promise((resolve, reject) => {
            const events = [];
            const timeoutMs = Math.max((details.timeout || 0) + (abortAfterMs || 0) + 8000, 12000);
            const timer = setTimeout(() => {
              reject(new Error(`Expected onloadend; events=${events.join(",")}`));
            }, timeoutMs);
            const req = GM_xmlhttpRequest({
              method: details.method || "GET",
              url: details.url,
              timeout: details.timeout,
              fetch,
              onload() {
                events.push("onload");
              },
              onerror() {
                events.push("onerror");
              },
              onabort() {
                events.push("onabort");
              },
              ontimeout() {
                events.push("ontimeout");
              },
              onloadend(response) {
                events.push("onloadend");
                clearTimeout(timer);
                resolve({ events, response });
              },
            });
            if (abortAfterMs != null) {
              setTimeout(() => req.abort(), abortAfterMs);
            }
          });
        };

        const normal = await runCase({
          url: `${HB}/get`,
        });
        expect(normal.events).toEqual(["onload", "onloadend"]);
        expect(normal.response.status).toBe(200);

        const timeout = await runCase({
          url: `${HB}/delay/5`,
          timeout: 2000,
        });
        expect(timeout.events).toEqual(["ontimeout", "onloadend"]);

        const abort = await runCase(
          {
            url: `${HB}/delay/10`,
          },
          { abortAfterMs: 4000 }
        );
        expect(abort.events).toEqual(["onabort", "onloadend"]);

        const nwError1 = await runCase(
          {
            url: `https://nonexistent-domain-abcxyz.test/abc.html`, // allowed domain
          },
          { abortAfterMs: 500 }
        );
        expect(nwError1.events).toEqual(["onerror", "onloadend"]);

        const nwError2 = await runCase(
          {
            url: `https://nonexistent-domain-abcxyz.reject/abc.html`, // disallowed domain
          },
          { abortAfterMs: 500 }
        );
        expect(nwError2.events).toEqual(["onerror", "onloadend"]);
      },
    },
    {
      name: "onprogress fires while downloading [arraybuffer]",
      async run(fetch) {
        let progressEvents = 0;
        let lastLoaded = 0;
        let response = null;
        // Use drip endpoint to stream bytes
        const { res } = await new Promise((resolve, reject) => {
          const start = performance.now();
          GM_xmlhttpRequest({
            method: "GET",
            url: `${HB}/drip?duration=2&delay=1&numbytes=2048`, // ~2KB
            responseType: "arraybuffer",
            onprogress: (ev) => {
              progressEvents++;
              if (ev.loaded != null) lastLoaded = ev.loaded;
              response = ev.response;
            },
            onload: (res) => resolve({ res, ms: performance.now() - start }),
            onerror: (res) => reject({ kind: "error", res }),
            ontimeout: (res) => reject({ kind: "timeout", res }),
            fetch,
          });
        });
        expect(res.status).toBe(200);
        expect(progressEvents >= 4).toBeTruthy();
        expect(lastLoaded > 0).toBeTruthy();
        expect(!response).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "onprogress fires while downloading [stream]",
      async run(fetch) {
        let progressEvents = 0;
        let lastLoaded = 0;
        let response = null;
        // Use drip endpoint to stream bytes
        const { res } = await new Promise((resolve, reject) => {
          const start = performance.now();
          GM_xmlhttpRequest({
            method: "GET",
            url: `${HB}/drip?duration=2&delay=1&numbytes=2048`, // ~2KB
            responseType: "stream",
            onloadstart: async (ev) => {
              const reader = ev.response?.getReader();
              if (reader) {
                let loaded = 0;
                while (true) {
                  const { done, value } = await reader.read(); // value is Uint8Array
                  if (value) {
                    progressEvents++;
                    loaded += value.length;
                    if (loaded != null) lastLoaded = loaded;
                    response = ev.response;
                  }
                  if (done) break;
                }
              }
            },
            onloadend: (res) => resolve({ res, ms: performance.now() - start }),
            onerror: (res) => reject({ kind: "error", res }),
            ontimeout: (res) => reject({ kind: "timeout", res }),
            fetch,
          });
        });
        expect(res.status).toBe(200);
        expect(progressEvents >= 4).toBeTruthy();
        expect(lastLoaded > 0).toBeTruthy();
        expect(response instanceof ReadableStream && typeof response.getReader === "function").toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "HEAD request - ensure body exist",
      async run(fetch) {
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/response-headers`,
          fetch,
        });
        expect(res.status).toBe(200);
        expect((res.responseText || "")?.length > 0).toBeTruthy();
        expect(typeof res.responseHeaders === "string").toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "HEAD request - without body",
      async run(fetch) {
        const { res } = await gmRequest({
          method: "HEAD",
          url: `${HB}/response-headers`,
          fetch,
        });
        expect(res.status).toBe(200);
        expect(res.responseText || "").toBe("");
        expect(typeof res.responseHeaders === "string").toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "OPTIONS request",
      async run(fetch) {
        const { res } = await gmRequest({
          method: "OPTIONS",
          url: `${HB}/any`,
          fetch,
        });
        // httpbingo commonly returns 200 for OPTIONS
        expect(res.status === 200 || res.status === 204).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "DELETE request",
      async run(fetch) {
        const { res } = await gmRequest({
          method: "DELETE",
          url: `${HB}/delete`,
          fetch,
        });
        expect(res.status).toBe(200);
        const body = JSON.parse(res.responseText);
        expect(body.method).toBe("DELETE");
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'anonymous TEST - set cookie "abc"',
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/cookies/set?abc=123`,
          fetch,
        });
      },
    },
    {
      name: "anonymous TEST - get cookie",
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/cookies`,
          fetch,
        });
        expect(res.status).toBe(200);
        const body = JSON.parse(res.responseText);
        const cookieABC = body.cookies.abc;
        expect(cookieABC).toBe("123");
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "anonymous: true (no cookies sent)",
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/headers`,
          anonymous: true,
          fetch,
        });
        const body = JSON.parse(res.responseText);
        const cookies = body.headers.Cookie || body.headers.cookie;
        expect(!`${cookies}`.includes("abc=123")).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "anonymous: false (cookies sent)",
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/headers`,
          fetch,
        });
        const body = JSON.parse(res.responseText);
        const cookies = body.headers.Cookie || body.headers.cookie;
        expect(`${cookies}`.includes("abc=123")).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "anonymous TEST - delete cookies",
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/cookies/delete?abc`,
          anonymous: true,
          fetch,
        });
      },
    },
    {
      name: 'anonymous: true[2] - set cookie "def"',
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/cookies/set?def=456`,
          anonymous: true,
          fetch,
        });
      },
    },
    {
      name: "anonymous: true[2] (no cookies sent)",
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/headers`,
          anonymous: true,
          fetch,
        });
        const body = JSON.parse(res.responseText);
        const cookies = body.headers.Cookie || body.headers.cookie;
        expect(!cookies).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "anonymous TEST - delete cookies",
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/cookies/delete?def`,
          anonymous: true,
          fetch,
        });
      },
    },
    {
      name: "Basic auth with user/password",
      async run(fetch) {
        const user = "user",
          pass = "passwd";
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/basic-auth/${user}/${pass}`,
          user,
          password: pass,
          fetch,
        });
        expect(res.status).toBe(200);
        const body = JSON.parse(res.responseText);
        expect(body.authenticated).toBe(true);
        expect(body.user).toBe("user");
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Non-2xx stays in onload (status 418)",
      async run(fetch) {
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/status/418`,
          fetch,
        });
        expect(res.status).toBe(418);
        expect(objectProps(res)).toBe("ok");
        // Still triggers onload, not onerror
      },
    },
    {
      name: "Invalid method -> expected server 405 or 200 echo",
      async run(fetch) {
        // httpbingo accepts any method on /headers (per docs), so status may be 200
        const { res } = await gmRequest({
          method: "FOOBAR",
          url: `${HB}/headers`,
          fetch,
        });
        expect([200, 405].includes(res.status)).toBeTruthy();
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "onerror for blocked domain (missing @connect) [https]",
      async run(fetch) {
        // We did not include @connect for example.org; Tampermonkey should block and call onerror.
        try {
          await gmRequest({
            method: "GET",
            url: "https://example.org/",
            fetch,
          });
          throw new Error("Expected onerror due to @connect, but got onload");
        } catch (e) {
          expect(e.kind).toBe("error");
          expect(e.res).toBeTruthy();
          expect(e.res.status).toBe(0);
          expect(e.res.statusText).toBe("");
          expect(e.res.finalUrl).toBe(undefined);
          expect(e.res.readyState).toBe(4);
          expect(!e.res.response).toBe(true);
          expect(e.res.responseText).toBe("");
          expect(e.res.responseXML).toBe(undefined);
          expect(typeof (e.res.error || undefined)).toBe("string");
          expect(`${e.res.error}`.includes(`Refused to connect to "https://example.org/": `)).toBe(true);
          expect(objectProps(e.res)).toBe("ok");
        }
      },
    },
    {
      name: "onerror for blocked domain (missing @connect) [http]",
      async run(fetch) {
        try {
          await gmRequest({
            method: "GET",
            url: "http://domain-abcxyz.test/",
            fetch,
          });
          throw new Error("Expected error, got load");
        } catch (e) {
          expect(e.kind).toBe("error");
          expect(e.res).toBeTruthy();
          expect(e.res.status).toBe(0);
          expect(e.res.statusText).toBe("");
          expect(e.res.finalUrl).toBe(undefined);
          expect(e.res.readyState).toBe(4);
          expect(!e.res.response).toBe(true);
          expect(e.res.responseText).toBe("");
          expect(e.res.responseXML).toBe(undefined);
          expect(typeof (e.res.error || undefined)).toBe("string");
          expect(`${e.res.error}`.includes(`Refused to connect to "http://domain-abcxyz.test/": `)).toBe(true);
          expect(objectProps(e.res)).toBe("ok");
        }
      },
    },
    {
      name: "onerror for DNS failure",
      async run(fetch) {
        try {
          await gmRequest({
            method: "GET",
            url: "https://nonexistent-domain-abcxyz.test/",
            fetch,
          });
          throw new Error("Expected error, got load");
        } catch (e) {
          expect(e.kind).toBe("error");
          expect(e.res).toBeTruthy();
          expect(!e.res.response).toBe(true);
          expect(e.res.responseXML).toBe(undefined);
          expect(e.res.responseHeaders).toBe("");
          expect(e.res.readyState).toBe(4);
          expect(objectProps(e.res)).toBe("ok");
        }
      },
    },
    {
      name: "Manual abort + onabort",
      async run(fetch) {
        try {
          await Promise.race([
            gmRequest(
              {
                method: "GET",
                url: `${HB}/delay/5`,
                fetch,
              },
              { abortAfterMs: 200 }
            ),
            new Promise((resolve) => setTimeout(resolve, 800)),
          ]);
          throw new Error("Expected abort, got load");
        } catch (e) {
          expect(e.kind).toBe("abort");
        }
      },
    },
    {
      name: "Test bug #1078",
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "json",
          fetch,
          onprogress() {},
        });
        expect(res.status).toBe(200);
        expect(`${res.responseText}`.includes('"method": "GET"')).toBe(true);
        expect(typeof res.response === "object" && res.response?.method === "GET").toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Test bug #1080",
      async run(fetch) {
        const readyStateList = [];
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "json",
          fetch,
          onreadystatechange: (resp) => {
            readyStateList.push(resp.readyState);
          },
        });
        expect(res.status).toBe(200);
        expect(`${res.responseText}`.includes('"method": "GET"')).toBe(true);
        expect(typeof res.response === "object" && res.response?.method === "GET").toBe(true);
        expect(res.responseXML instanceof XMLDocument).toBe(true);
        expect(readyStateList).toEqual(fetch ? [2, 4] : [1, 2, 3, 4]);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "General Sequence",
      async run(fetch) {
        const resultList = [];
        const url = `https://raw.githubusercontent.com/mdn/content/54fd6eaad3924076e0b546e7eff1f6f466f6139f/.editorconfig?d=${Date.now()}`;
        await new Promise((resolve, reject) =>
          GM_xmlhttpRequest({
            method: "GET",
            url,
            fetch,
            nocache: true,
            onreadystatechange: function (response) {
              resultList.push("onreadystatechange " + resPrint(response));
            },
            onload: function (response) {
              resultList.push("onload " + resPrint(response));
            },
            onloadend: function (response) {
              resultList.push("onloadend " + resPrint(response));
              resolve();
            },
            onerror: () => reject(),
            ontimeout: () => reject(),
          })
        );
        if (!fetch) {
          expect(resultList).toEqual([
            "onreadystatechange 1.000;r=missing;t=missing;x=missing",
            "onreadystatechange 2.200;r=missing;t=missing;x=missing",
            "onreadystatechange 3.200;r=missing;t=missing;x=missing",
            "onreadystatechange 4.200;r=string;t=string;x=XMLDocument",
            "onload 4.200;r=string;t=string;x=XMLDocument",
            "onloadend 4.200;r=string;t=string;x=XMLDocument",
          ]);
        } else {
          expect(resultList).toEqual([
            "onreadystatechange 2.200;r=missing;t=missing;x=missing",
            "onreadystatechange 4.200;r=string;t=string;x=XMLDocument",
            "onload 4.200;r=string;t=string;x=XMLDocument",
            "onloadend 4.200;r=string;t=string;x=XMLDocument",
          ]);
        }
      },
    },
    {
      name: "Progress & JSON Fallback",
      async run(fetch) {
        const resultSet = new Set();
        let progressCount = 0;
        const url = `https://raw.githubusercontent.com/dscape/spell/3f1d4dd2a6dfcad65578eadaf29cae1800a1be13/test/resources/big.txt?d=${Date.now()}`;
        await new Promise((resolve, reject) =>
          GM_xmlhttpRequest({
            method: "GET",
            url,
            fetch,
            nocache: true,
            responseType: "json",
            onreadystatechange: function (response) {
              resultSet.add("onreadystatechange " + resPrint(response));
            },
            onprogress: function (response) {
              resultSet.add("onprogress " + resPrint(response));
              progressCount++;
            },
            onload: function (response) {
              resultSet.add("onload " + resPrint(response));
            },
            onloadend: function (response) {
              resultSet.add("onloadend " + resPrint(response));
              resolve();
            },
            onerror: () => reject(),
            ontimeout: () => reject(),
          })
        );
        const resultList = [...resultSet];
        if (!fetch) {
          expect(progressCount >= 2).toBe(true);
          expect(resultList).toEqual([
            "onreadystatechange 1.000;r=missing;t=missing;x=missing",
            "onreadystatechange 2.200;r=missing;t=missing;x=missing",
            "onreadystatechange 3.200;r=missing;t=missing;x=missing",
            "onprogress 3.200;r=missing;t=missing;x=missing",
            isFirefox ? "" : "onprogress 4.200;r=missing;t=missing;x=missing",
            "onreadystatechange 4.200;r=<undefined>;t=string;x=XMLDocument",
            "onload 4.200;r=<undefined>;t=string;x=XMLDocument",
            "onloadend 4.200;r=<undefined>;t=string;x=XMLDocument",
          ].filter(Boolean));
        } else {
          expect(progressCount >= 2).toBe(true);
          expect(resultList).toEqual([
            "onreadystatechange 2.200;r=missing;t=missing;x=missing",
            "onprogress 3.200;r=missing;t=missing;x=missing",
            "onreadystatechange 4.200;r=<undefined>;t=string;x=XMLDocument",
            "onload 4.200;r=<undefined>;t=string;x=XMLDocument",
            "onloadend 4.200;r=<undefined>;t=string;x=XMLDocument",
          ]);
        }
      },
    },
    {
      name: "Progress & JSON Object",
      async run(fetch) {
        const resultSet = new Set();
        let progressCount = 0;
        const url = `https://raw.githubusercontent.com/json-iterator/test-data/0bce379832b475a6c21726ce37f971f8d849513b/large-file.json?d=${Date.now()}`;
        await new Promise((resolve, reject) =>
          GM_xmlhttpRequest({
            method: "GET",
            url,
            fetch,
            nocache: true,
            responseType: "json",
            onreadystatechange: function (response) {
              resultSet.add("onreadystatechange " + resPrint(response));
            },
            onprogress: function (response) {
              resultSet.add("onprogress " + resPrint(response));
              progressCount++;
            },
            onload: function (response) {
              resultSet.add("onload " + resPrint(response));
            },
            onloadend: function (response) {
              resultSet.add("onloadend " + resPrint(response));
              resolve();
            },
            onerror: () => reject(),
            ontimeout: () => reject(),
          })
        );
        const resultList = [...resultSet];
        if (!fetch) {
          expect(progressCount >= 2).toBe(true);
          expect(resultList).toEqual([
            "onreadystatechange 1.000;r=missing;t=missing;x=missing",
            "onreadystatechange 2.200;r=missing;t=missing;x=missing",
            "onreadystatechange 3.200;r=missing;t=missing;x=missing",
            "onprogress 3.200;r=missing;t=missing;x=missing",
            isFirefox ? "" : "onprogress 4.200;r=missing;t=missing;x=missing",
            "onreadystatechange 4.200;r=object;t=string;x=XMLDocument",
            "onload 4.200;r=object;t=string;x=XMLDocument",
            "onloadend 4.200;r=object;t=string;x=XMLDocument",
          ].filter(Boolean));
        } else {
          expect(progressCount >= 2).toBe(true);
          expect(resultList).toEqual([
            "onreadystatechange 2.200;r=missing;t=missing;x=missing",
            "onprogress 3.200;r=missing;t=missing;x=missing",
            "onreadystatechange 4.200;r=object;t=string;x=XMLDocument",
            "onload 4.200;r=object;t=string;x=XMLDocument",
            "onloadend 4.200;r=object;t=string;x=XMLDocument",
          ]);
        }
      },
    },
    {
      name: "response.getAllResponseHeaders() [without headers in request]",
      async run(fetch) {
        let resultHeaders = null;
        const getHeaders = (e) => {
          if (!e) return new Headers();
          var n = e.split("\r\n").map(function (t) {
            var e = t.split(":");
            return [e[0].trim(), e[1].trim()];
          });
          return new Headers(n);
        };
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dj=1&dt=t&dt=rm&q=%E3%81%8F%E3%82%8B%EF%BC%81%EF%BC%81%0A%E3%81%8F%E3%82%8B%E2%80%A6%0A%E3%81%8D%E3%81%9F%EF%BC%81%EF%BC%81%0Alets+go%0A%E3%81%8F%E3%82%8B%EF%BC%81%0Ayes%21`;
        await new Promise((resolve, reject) =>
          GM_xmlhttpRequest({
            method: "GET",
            url,
            responseType: "blob",
            headers: {},
            fetch,
            onload: function (response) {
              resultHeaders = getHeaders(response.responseHeaders);
            },
            onloadend: function (response) {
              resolve();
            },
            onerror: () => reject(),
            ontimeout: () => reject(),
          })
        );
        const headers = resultHeaders;
        expect(headers.get("content-type")).toBe("application/json; charset=utf-8");
        expect(headers.get("reporting-endpoints").replace(/context=[-+\w]+/, "context=eJzj4tD")).toBe('default="/_/TranslateApiHttp/web-reports?context=eJzj4tD"');
        expect(headers.get("cross-origin-opener-policy")).toBe("same-origin");
        expect(headers.get("content-encoding") !== "deflate").toBe(true);
      },
    },
    {
      name: "response.getAllResponseHeaders() [with headers in request]",
      async run(fetch) {
        let resultHeaders = null;
        const getHeaders = (e) => {
          if (!e) return new Headers();
          var n = e.split("\r\n").map(function (t) {
            var e = t.split(":");
            return [e[0].trim(), e[1].trim()];
          });
          return new Headers(n);
        };
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dj=1&dt=t&dt=rm&q=%E3%81%8F%E3%82%8B%EF%BC%81%EF%BC%81%0A%E3%81%8F%E3%82%8B%E2%80%A6%0A%E3%81%8D%E3%81%9F%EF%BC%81%EF%BC%81%0Alets+go%0A%E3%81%8F%E3%82%8B%EF%BC%81%0Ayes%21`;
        await new Promise((resolve, reject) =>
          GM_xmlhttpRequest({
            method: "GET",
            url,
            responseType: "blob",
            headers: {
              "Accept-Encoding": "deflate",
            },
            fetch,
            onload: function (response) {
              resultHeaders = getHeaders(response.responseHeaders);
            },
            onloadend: function (response) {
              resolve();
            },
            onerror: () => reject(),
            ontimeout: () => reject(),
          })
        );
        const headers = resultHeaders;
        expect(headers.get("content-type")).toBe("application/json; charset=utf-8");
        expect(headers.get("reporting-endpoints").replace(/context=[-+\w]+/, "context=eJzj4tD")).toBe('default="/_/TranslateApiHttp/web-reports?context=eJzj4tD"');
        expect(headers.get("cross-origin-opener-policy")).toBe("same-origin");
        expect(headers.get("content-encoding") === "deflate" || headers.get("content-encoding") === null).toBe(true);
      },
    },
    {
      name: "Response headers line endings",
      async run(fetch) {
        const url = `${HB}/get`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          fetch,
        });
        expect(res.status).toBe(200);
        expect(typeof res.responseHeaders).toBe("string");
        expect(res.responseHeaders.trim() === res.responseHeaders).toBe(true);
        // Each line should end with \r\n
        const lines = res.responseHeaders.split("\r\n");
        for (let i = 0; i < lines.length - 1; i++) {
          expect(lines[i].length > 0).toBeTruthy();
        }
        expect(objectProps(res)).toBe("ok");
      },
    },
  ];

  const tests = [
    ...basicTests,
    ...basicTests.map((item) => {
      return { ...item, useFetch: true };
    }),
  ];

  function getHeader(headersStr, key) {
    const lines = (headersStr || "").split(/\r?\n/);
    const line = lines.find((l) => l.toLowerCase().startsWith(key.toLowerCase() + ":"));
    return line ? line.split(":").slice(1).join(":").trim() : "";
  }
  function objectProps(o) {
    if (!o || typeof o !== "object") return "not an object";
    let z, oD, zD;
    try {
      z = Object.assign({}, o);
    } catch {
      return "Object.assign failed";
    }
    // accept null / "" / undefined for normal/failed/fetch_normal/fetch_failed XHR
    // non-empty text (still primitive) can be also accepted. (common in xhr error case)
    if (typeof (z.response ?? "") !== "string") return "non-primitive response value exposed";
    if (typeof (z.responseText ?? "") !== "string") return "non-primitive responseText value exposed";
    if (typeof (z.responseXML ?? "") !== "string") return "non-primitive responseXML value exposed";
    try {
      oD = JSON.stringify(o);
    } catch {
      return "JSON.stringify failed";
    }
    try {
      zD = JSON.stringify(z);
    } catch {
      return "JSON.stringify failed";
    }
    if (oD !== zD) return "Object Props Failed";
    return "ok";
  }

  // 138 个用例都会真的发请求，还会设置/删除 cookie，一轮要跑几十秒，
  // 所以不随页面加载自动开跑，由面板的运行按钮触发。
  describe("GM_xmlhttpRequest", { auto: false }, () => {
    for (const t of tests) {
      it(`${t.useFetch ? "[fetch]" : "[xhr]"} ${t.name}`, () => t.run(t.useFetch ? true : false));
    }
  });

  await run();
})();

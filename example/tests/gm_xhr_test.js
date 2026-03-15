// ==UserScript==
// @name         GM_xmlhttpRequest Exhaustive Test Harness v3
// @namespace    tm-gmxhr-test
// @version      1.2.3
// @description  Comprehensive in-page tests for GM_xmlhttpRequest: normal, abnormal, and edge cases with clear pass/fail output.
// @author       you
// @match        *://*/*?GM_XHR_TEST_SC
// @grant        GM_xmlhttpRequest
// @connect      httpbun.com
// @connect      nonexistent-domain-abcxyz.test
// @connect      raw.githubusercontent.com
// @connect      translate.googleapis.com
// @noframes
// ==/UserScript==

/*
  WHAT THIS DOES
  --------------
  - Builds an in-page test runner panel.
  - Runs a battery of tests probing GM_xmlhttpRequest options, callbacks, and edge/abnormal paths.
  - Uses httpbin.org endpoints for deterministic echo/response behavior.
  - Prints a summary and a detailed per-test log with assertions.

  NOTE: Endpoints now point to https://httpbun.com (a faster httpbin-like service).
        See https://httpbun.com for docs and exact paths. (Also supports /get, /post, /bytes/{n}, /delay/{s}, /status/{code}, /redirect-to, /headers, /any, etc.)
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
(function () {
  "use strict";
  if (!enableTool) return;

  // ---------- Small DOM helper ----------
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el[k] = v;
    });
    for (const c of children) el.append(c && c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

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

  // ---------- Test Panel ----------
  const panel = h(
    "div",
    {
      id: "gmxhr-test-panel",
      style: {
        position: "fixed",
        bottom: "12px",
        right: "12px",
        width: "460px",
        maxHeight: "70vh",
        overflow: "auto",
        zIndex: 2147483647,
        background: "#111",
        color: "#f5f5f5",
        font: "13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        borderRadius: "10px",
        boxShadow: "0 12px 30px rgba(0,0,0,.4)",
        border: "1px solid #333",
      },
    },
    h(
      "div",
      {
        style: {
          position: "sticky",
          top: 0,
          background: "#181818",
          padding: "10px 12px",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        },
      },
      h("div", { style: { fontWeight: "600" } }, "GM_xmlhttpRequest Test Harness", h("br"), `${GM.info?.version}`),
      h("div", { id: "counts", style: { marginLeft: "auto", opacity: 0.8 } }, "…"),
      h("button", { id: "start", style: btn() }, "Run"),
      h("button", { id: "clear", style: btn() }, "Clear")
    ),
    // Added: live status + pending queue (minimal UI)
    h(
      "div",
      { id: "status", style: { padding: "6px 12px", borderBottom: "1px solid #222", opacity: 0.9 } },
      "Status: idle"
    ),
    h(
      "details",
      { id: "queueWrap", open: false, style: { padding: "0 12px 6px", borderBottom: "1px solid #222" } },
      h("summary", {}, "Pending tests"),
      h(
        "div",
        {
          id: "queue",
          style: {
            fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
            whiteSpace: "pre-wrap",
            opacity: 0.8,
          },
        },
        "(none)"
      )
    ),
    h("div", { id: "log", style: { padding: "10px 12px" } })
  );
  document.documentElement.append(panel);

  function btn() {
    return {
      background: "#2a6df1",
      color: "white",
      border: "0",
      padding: "6px 10px",
      borderRadius: "6px",
      cursor: "pointer",
    };
  }

  const $log = panel.querySelector("#log");
  const $counts = panel.querySelector("#counts");
  const $status = panel.querySelector("#status");
  const $queue = panel.querySelector("#queue");
  panel.querySelector("#clear").addEventListener("click", () => {
    $log.textContent = "";
    setCounts(0, 0, 0);
    setStatus("idle");
    setQueue([]);
  });
  panel.querySelector("#start").addEventListener("click", runAll);

  function logLine(html, cls = "") {
    const line = h("div", { style: { padding: "6px 0", borderBottom: "1px dashed #2a2a2a" } });
    line.innerHTML = html;
    if (cls) line.className = cls;
    $log.prepend(line);
  }

  function setCounts(p, f, s) {
    $counts.textContent = `✅ ${p}  ❌ ${f}  ⏳ ${s}`;
  }
  function setStatus(text) {
    $status.textContent = `Status: ${text}`;
  }
  function setQueue(items) {
    $queue.textContent = items.length ? items.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(none)";
  }

  // ---------- Assertion & request helpers ----------
  const state = { pass: 0, fail: 0, skip: 0 };
  function pass(msg) {
    state.pass++;
    setCounts(state.pass, state.fail, state.skip);
    logLine(`✅ ${escapeHtml(msg)}`);
  }
  function fail(msg, extra) {
    state.fail++;
    setCounts(state.pass, state.fail, state.skip);
    logLine(
      `❌ ${escapeHtml(msg)}${extra ? `<pre style="white-space:pre-wrap;color:#bbb;margin:.5em 0 0">${escapeHtml(extra)}</pre>` : ""}`,
      "fail"
    );
  }
  function skip(msg) {
    state.skip++;
    setCounts(state.pass, state.fail, state.skip);
    logLine(`⏭️ ${escapeHtml(msg)}`, "skip");
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
    );
  }

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

  // Switched base host from httpbin to httpbun (faster).
  // See: https://httpbun.com (endpoints: /get, /post, /bytes/{n}, /delay/{s}, /status/{code}, /redirect-to, /headers, /any, etc.)
  const HB = "https://httpbun.com";

  // Helper: handle minor schema diffs between httpbin/httpbun for query echo
  function getQueryObj(body) {
    // httpbin uses "args", httpbun may use "query" (and still often provides "args" for compatibility).
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, decodedBase64, "responseText ok");
        assertEq(res.response, decodedBase64, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, decodedBase64, "responseText ok");
        assertEq(res.response, decodedBase64, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, decodedBase64, "responseText ok");
        assertEq(res.response, decodedBase64, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, decodedBase64, "responseText ok");
        assertEq(res.response, undefined, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, decodedBase64, "responseText ok");
        assertEq(res.response instanceof XMLDocument, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, undefined, "responseText ok");
        assertEq(res.response instanceof ReadableStream, true, "response ok");
        assertEq(res.responseXML, undefined, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, decodedBase64, "responseText ok");
        assertEq(res.response instanceof ArrayBuffer, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, decodedBase64, "responseText ok");
        assertEq(res.response instanceof Blob, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: "GET json [responseType: undefined]",
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          fetch,
        });
        assertEq(res.status, 200, "status 200");
        assertEq(`${res.responseText}`.includes('"code": 200'), true, "responseText ok");
        assertEq(`${res.response}`.includes('"code": 200'), true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: 'GET json [responseType: ""]',
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "",
          fetch,
        });
        assertEq(res.status, 200, "status 200");
        assertEq(`${res.responseText}`.includes('"code": 200'), true, "responseText ok");
        assertEq(`${res.response}`.includes('"code": 200'), true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: 'GET json [responseType: "text"]',
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "text",
          fetch,
        });
        assertEq(res.status, 200, "status 200");
        assertEq(`${res.responseText}`.includes('"code": 200'), true, "responseText ok");
        assertEq(`${res.response}`.includes('"code": 200'), true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: 'GET json [responseType: "json"]',
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "json",
          fetch,
        });
        assertEq(res.status, 200, "status 200");
        assertEq(`${res.responseText}`.includes('"code": 200'), true, "responseText ok");
        assertEq(typeof res.response === "object" && res.response?.code === 200, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: 'GET json [responseType: "document"]',
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "document",
          fetch,
        });
        assertEq(res.status, 200, "status 200");
        assertEq(`${res.responseText}`.includes('"code": 200'), true, "responseText ok");
        assertEq(res.response instanceof XMLDocument, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: 'GET json [responseType: "stream"]',
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "stream",
          fetch,
        });
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, undefined, "responseText ok");
        assertEq(res.response instanceof ReadableStream, true, "response ok");
        assertEq(res.responseXML, undefined, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: 'GET json [responseType: "arraybuffer"]',
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "arraybuffer",
          fetch,
        });
        assertEq(res.status, 200, "status 200");
        assertEq(`${res.responseText}`.includes('"code": 200'), true, "responseText ok");
        assertEq(res.response instanceof ArrayBuffer, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: 'GET json [responseType: "blob"]',
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "blob",
          fetch,
        });
        assertEq(res.status, 200, "status 200");
        assertEq(`${res.responseText}`.includes('"code": 200'), true, "responseText ok");
        assertEq(res.response instanceof Blob, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText?.length >= 8 && res.responseText?.length <= 32, true, "responseText ok");
        assertEq(res.response, res.responseText, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText?.length >= 8 && res.responseText?.length <= 32, true, "responseText ok");
        assertEq(res.response, res.responseText, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText?.length >= 8 && res.responseText?.length <= 32, true, "responseText ok");
        assertEq(res.response, res.responseText, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText?.length >= 8 && res.responseText?.length <= 32, true, "responseText ok");
        assertEq(res.response, undefined, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText?.length >= 8 && res.responseText?.length <= 32, true, "responseText ok");
        assertEq(res.response instanceof XMLDocument, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText, undefined, "responseText ok");
        assertEq(res.response instanceof ReadableStream, true, "response ok");
        assertEq(res.responseXML, undefined, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText?.length >= 8 && res.responseText?.length <= 32, true, "responseText ok");
        assertEq(res.response instanceof ArrayBuffer, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        assertEq(res.responseText?.length >= 8 && res.responseText?.length <= 32, true, "responseText ok");
        assertEq(res.response instanceof Blob, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status 200");
        const q = getQueryObj(body);
        assertEq(q.x, "1", "query args");
        const hdrs = body.headers || {};
        assertEq(hdrs["X-Custom"] || hdrs["x-custom"], "Hello", "custom header echo");
        assertEq(res.finalUrl, url, "finalUrl matches");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status after redirect is 200");
        assertEq(res.finalUrl, target, "finalUrl is redirected target");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200, "status after redirect is 200");
        assertEq(res.finalUrl, target, "finalUrl is redirected target");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
          assertEq(e?.kind, "error", "error ok");
          assertEq(e?.res?.status, 408, "statusCode ok");
          assertEq(!e?.res?.finalUrl, true, "!finalUrl ok");
          assertEq(e?.res?.responseHeaders, "", "responseHeaders ok");
          assertEq(objectProps(e?.res), "ok", "Object Props OK");
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
        assertEq(res?.status, 301, "status is 301");
        assertEq(res?.finalUrl, url, "finalUrl is original url");
        assertEq(typeof res?.responseHeaders === "string" && res?.responseHeaders !== "", true, "responseHeaders ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200);
        assertEq((body.form || {}).a, "1", "form a");
        assertEq((body.form || {}).b, "two", "form b");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200);
        assertDeepEq(body.json, payload, "JSON echo matches");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200);
        assert(body.data && body.data.length > 0, "server received some data");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200);
        assert(res.response instanceof ArrayBuffer, "arraybuffer present");
        assertEq(res.response.byteLength, size, "byte length matches");
        assert(progressCounter >= 1, "progressCounter >= 1");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: "responseType=blob",
      async run(fetch) {
        let progressCounter = 0;
        const size = 40; // MAX 90
        // httpbun doesn't have /image/png; use /bytes to ensure blob download
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/bytes/${size}`,
          responseType: "blob",
          onprogress() {
            progressCounter++;
          },
          fetch,
        });
        assertEq(res.status, 200);
        assert(res.response instanceof Blob, "blob present");
        const buf = await res.response.arrayBuffer();
        assertEq(buf.byteLength, size, "byte length matches");
        assert(progressCounter >= 1, "progressCounter >= 1");
        assertEq(objectProps(res), "ok", "Object Props OK");
        // Do not assert image MIME; httpbun returns octet-stream here.
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
        assertEq(res.status, 200);
        assert(res.response && typeof res.response === "object", "parsed JSON object");
        assert(res.response.origin, "has JSON fields");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200);
        assert(typeof res.responseText === "string" && res.responseText.length > 0, "responseText available");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
          assertEq(e.kind, "timeout", "timeout path taken");
        }
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
            url: `${HB}/drip?duration=2&delay=1&numbytes=1024`, // ~1KB
            responseType: "arraybuffer",
            onprogress: (ev) => {
              progressEvents++;
              if (ev.loaded != null) lastLoaded = ev.loaded;
              setStatus(`downloading: ${lastLoaded | 0} bytes…`);
              response = ev.response;
            },
            onload: (res) => resolve({ res, ms: performance.now() - start }),
            onerror: (res) => reject({ kind: "error", res }),
            ontimeout: (res) => reject({ kind: "timeout", res }),
            fetch,
          });
        });
        assertEq(res.status, 200);
        assert(progressEvents >= 4, "received at least 4 progress events");
        // `progress` is guaranteed to fire only in the Fetch API.
        assert(fetch ? lastLoaded > 0 : lastLoaded >= 0, "progress loaded captured");
        assert(!response, "no response");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
            url: `${HB}/drip?duration=2&delay=1&numbytes=1024`, // ~1KB
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
                    setStatus(`downloading: ${loaded | 0} bytes…`);
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
        assertEq(res.status, 200);
        assert(progressEvents >= 4, "received at least 4 progress events");
        // `progress` is guaranteed to fire only in the Fetch API.
        assert(fetch ? lastLoaded > 0 : lastLoaded >= 0, "progress loaded captured");
        assert(response instanceof ReadableStream && typeof response.getReader === "function", "response");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200);
        assert((res.responseText || "")?.length > 0, "body for HEAD");
        assert(typeof res.responseHeaders === "string", "response headers present");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200);
        assertEq(res.responseText || "", "", "no body for HEAD");
        assert(typeof res.responseHeaders === "string", "response headers present");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        // httpbun commonly returns 200 for OPTIONS
        assert(res.status === 200 || res.status === 204, "200/204 on OPTIONS");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 200);
        const body = JSON.parse(res.responseText);
        assertEq(body.method, "DELETE", "server saw DELETE");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: 'anonymous TEST - set cookie "abc"',
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/cookies/set/abc/123`,
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
        assertEq(res.status, 200);
        const body = JSON.parse(res.responseText);
        const cookieABC = body.cookies.abc;
        assertEq(cookieABC, "123", "cookie abc=123");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assert(!`${cookies}`.includes("abc=123"), "no Cookie header when anonymous");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assert(`${cookies}`.includes("abc=123"), "Cookie header");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: "anonymous TEST - delete cookies",
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/cookies/delete`,
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
          url: `${HB}/cookies/set/def/456`,
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
        assert(!cookies, "no Cookie header when anonymous");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: "anonymous TEST - delete cookies",
      async run(fetch) {
        // httpbin echoes Cookie header in headers
        const { res } = await gmRequest({
          method: "GET",
          url: `${HB}/cookies/delete`,
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
        assertEq(res.status, 200);
        const body = JSON.parse(res.responseText);
        assertEq(body.authenticated, true, "authenticated true");
        assertEq(body.user, "user", "user echoed");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        assertEq(res.status, 418, "418 I'm a teapot");
        assertEq(objectProps(res), "ok", "Object Props OK");
        // Still triggers onload, not onerror
      },
    },
    {
      name: "Invalid method -> expected server 405 or 200 echo",
      async run(fetch) {
        // httpbun accepts any method on /headers (per docs), so status may be 200
        const { res } = await gmRequest({
          method: "FOOBAR",
          url: `${HB}/headers`,
          fetch,
        });
        assert([200, 405].includes(res.status), "200 or 405 depending on server handling");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
          assertEq(e.kind, "error", "onerror path taken");
          assert(e.res, "e.res exists");
          assertEq(e.res.status, 0, "status 0");
          assertEq(e.res.statusText, "", 'statusText ""');
          assertEq(e.res.finalUrl, undefined, "finalUrl undefined");
          assertEq(e.res.readyState, 4, "readyState DONE");
          assertEq(!e.res.response, true, "!response ok");
          assertEq(e.res.responseText, "", 'responseText ""');
          assertEq(e.res.responseXML, undefined, "responseXML undefined");
          assertEq(typeof (e.res.error || undefined), "string", "error set");
          assertEq(
            `${e.res.error}`.includes(`Refused to connect to "https://example.org/": `),
            true,
            "Refused to connect to ..."
          );
          assertEq(objectProps(e.res), "ok", "Object Props OK");
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
          assertEq(e.kind, "error", "onerror path taken");
          assert(e.res, "e.res exists");
          assertEq(e.res.status, 0, "status 0");
          assertEq(e.res.statusText, "", 'statusText ""');
          assertEq(e.res.finalUrl, undefined, "finalUrl undefined");
          assertEq(e.res.readyState, 4, "readyState DONE");
          assertEq(!e.res.response, true, "!response ok");
          assertEq(e.res.responseText, "", 'responseText ""');
          assertEq(e.res.responseXML, undefined, "responseXML undefined");
          assertEq(typeof (e.res.error || undefined), "string", "error set");
          assertEq(
            `${e.res.error}`.includes(`Refused to connect to "http://domain-abcxyz.test/": `),
            true,
            "Refused to connect to ..."
          );
          assertEq(objectProps(e.res), "ok", "Object Props OK");
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
          assertEq(e.kind, "error", "onerror path taken");
          assert(e.res, "e.res exists");
          assertEq(!e.res.response, true, "!response ok");
          assertEq(e.res.responseXML, undefined, "responseXML undefined");
          assertEq(e.res.responseHeaders, "", 'responseHeaders ""');
          assertEq(e.res.readyState, 4, "readyState 4");
          assertEq(objectProps(e.res), "ok", "Object Props OK");
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
          assertEq(e.kind, "abort", "abort path taken");
        }
      },
    },
    {
      name: "Test bug #1078",
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "json",
          fetch,
          onprogress() {},
        });
        assertEq(res.status, 200, "status 200");
        assertEq(`${res.responseText}`.includes('"code": 200'), true, "responseText ok");
        assertEq(typeof res.response === "object" && res.response?.code === 200, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: "Test bug #1080",
      async run(fetch) {
        const readyStateList = [];
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          responseType: "json",
          fetch,
          onreadystatechange: (resp) => {
            readyStateList.push(resp.readyState);
          },
        });
        assertEq(res.status, 200, "status 200");
        assertEq(`${res.responseText}`.includes('"code": 200'), true, "responseText ok");
        assertEq(typeof res.response === "object" && res.response?.code === 200, true, "response ok");
        assertEq(res.responseXML instanceof XMLDocument, true, "responseXML ok");
        assertDeepEq(readyStateList, fetch ? [2, 4] : [1, 2, 3, 4], "status 200");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
          assertDeepEq(
            resultList,
            [
              "onreadystatechange 1.000;r=missing;t=missing;x=missing",
              "onreadystatechange 2.200;r=missing;t=missing;x=missing",
              "onreadystatechange 3.200;r=missing;t=missing;x=missing",
              "onreadystatechange 4.200;r=string;t=string;x=XMLDocument",
              "onload 4.200;r=string;t=string;x=XMLDocument",
              "onloadend 4.200;r=string;t=string;x=XMLDocument",
            ],
            "standard-type GMXhr OK"
          );
        } else {
          assertDeepEq(
            resultList,
            [
              "onreadystatechange 2.200;r=missing;t=missing;x=missing",
              "onreadystatechange 4.200;r=string;t=string;x=XMLDocument",
              "onload 4.200;r=string;t=string;x=XMLDocument",
              "onloadend 4.200;r=string;t=string;x=XMLDocument",
            ],
            "fetch-type GMXhr OK"
          );
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
          assertEq(progressCount >= 2, true, "progressCount ok");
          assertDeepEq(
            resultList,
            [
              "onreadystatechange 1.000;r=missing;t=missing;x=missing",
              "onreadystatechange 2.200;r=missing;t=missing;x=missing",
              "onreadystatechange 3.200;r=missing;t=missing;x=missing",
              "onprogress 3.200;r=missing;t=missing;x=missing",
              "onprogress 4.200;r=missing;t=missing;x=missing",
              "onreadystatechange 4.200;r=<undefined>;t=string;x=XMLDocument",
              "onload 4.200;r=<undefined>;t=string;x=XMLDocument",
              "onloadend 4.200;r=<undefined>;t=string;x=XMLDocument",
            ],
            "standard-type GMXhr OK"
          );
        } else {
          assertEq(progressCount >= 2, true, "progressCount ok");
          assertDeepEq(
            resultList,
            [
              "onreadystatechange 2.200;r=missing;t=missing;x=missing",
              "onprogress 3.200;r=missing;t=missing;x=missing",
              "onreadystatechange 4.200;r=<undefined>;t=string;x=XMLDocument",
              "onload 4.200;r=<undefined>;t=string;x=XMLDocument",
              "onloadend 4.200;r=<undefined>;t=string;x=XMLDocument",
            ],
            "fetch-type GMXhr OK"
          );
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
          assertEq(progressCount >= 2, true, "progressCount ok");
          assertDeepEq(
            resultList,
            [
              "onreadystatechange 1.000;r=missing;t=missing;x=missing",
              "onreadystatechange 2.200;r=missing;t=missing;x=missing",
              "onreadystatechange 3.200;r=missing;t=missing;x=missing",
              "onprogress 3.200;r=missing;t=missing;x=missing",
              "onprogress 4.200;r=missing;t=missing;x=missing",
              "onreadystatechange 4.200;r=object;t=string;x=XMLDocument",
              "onload 4.200;r=object;t=string;x=XMLDocument",
              "onloadend 4.200;r=object;t=string;x=XMLDocument",
            ],
            "standard-type GMXhr OK"
          );
        } else {
          assertEq(progressCount >= 2, true, "progressCount ok");
          assertDeepEq(
            resultList,
            [
              "onreadystatechange 2.200;r=missing;t=missing;x=missing",
              "onprogress 3.200;r=missing;t=missing;x=missing",
              "onreadystatechange 4.200;r=object;t=string;x=XMLDocument",
              "onload 4.200;r=object;t=string;x=XMLDocument",
              "onloadend 4.200;r=object;t=string;x=XMLDocument",
            ],
            "fetch-type GMXhr OK"
          );
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
        assertEq(headers.get("content-type"), "application/json; charset=utf-8", "content-type ok");
        assertEq(
          headers.get("reporting-endpoints").replace(/context=[-+\w]+/, "context=eJzj4tD"),
          'default="/_/TranslateApiHttp/web-reports?context=eJzj4tD"',
          "reporting-endpoints ok"
        );
        assertEq(headers.get("cross-origin-opener-policy"), "same-origin", "cross-origin-opener-policy ok");
        assertEq(headers.get("content-encoding") !== "deflate", true, "content-encoding ok");
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
        assertEq(headers.get("content-type"), "application/json; charset=utf-8", "content-type ok");
        assertEq(
          headers.get("reporting-endpoints").replace(/context=[-+\w]+/, "context=eJzj4tD"),
          'default="/_/TranslateApiHttp/web-reports?context=eJzj4tD"',
          "reporting-endpoints ok"
        );
        assertEq(headers.get("cross-origin-opener-policy"), "same-origin", "cross-origin-opener-policy ok");
        assertEq(
          headers.get("content-encoding") === "deflate" || headers.get("content-encoding") === null,
          true,
          "content-encoding ok"
        );
      },
    },
    {
      name: "Response headers line endings",
      async run(fetch) {
        const url = `${HB}/status/200`;
        const { res } = await gmRequest({
          method: "GET",
          url,
          fetch,
        });
        assertEq(res.status, 200, "status 200");
        assertEq(typeof res.responseHeaders, "string", "responseHeaders is string");
        assertEq(res.responseHeaders.trim() === res.responseHeaders, true, "no extra space");
        // Each line should end with \r\n
        const lines = res.responseHeaders.split("\r\n");
        for (let i = 0; i < lines.length - 1; i++) {
          assert(lines[i].length > 0, `header line ${i} present`);
        }
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
  ];

  const tests = [
    ...basicTests,
    ...basicTests.map((item) => {
      return { ...item, useFetch: true };
    }),
  ];

  // ---------- Assertion utils ----------
  function assert(condition, msg) {
    if (!condition) throw new Error(msg || "assertion failed");
  }
  function assertEq(a, b, msg) {
    if (a !== b) throw new Error(msg ? `${msg}: expected ${b}, got ${a}` : `expected ${b}, got ${a}`);
  }
  function assertDeepEq(a, b, msg) {
    const aj = JSON.stringify(a);
    const bj = JSON.stringify(b);
    if (aj !== bj) throw new Error(msg ? `${msg}: expected ${bj}, got ${aj}` : `deep equal failed`);
  }
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

  // ---------- Runner ----------
  async function runAll() {
    // reset counts
    state.pass = state.fail = state.skip = 0;
    setCounts(0, 0, 0);
    const names = tests.map((t) => t.name);
    setQueue(names.slice());
    logLine(`<b>Starting GM_xmlhttpRequest test suite</b> — ${new Date().toLocaleString()}`);

    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const title = `• ${t.name}`;
      const t0 = performance.now();
      setStatus(`running (${i + 1}/${tests.length}): ${t.name}`);
      try {
        logLine(`▶️ <b>${escapeHtml(t.name)}</b> (queued: ${tests.length - i - 1} remaining)`);
        await t.run(t.useFetch ? true : false);
        pass(`${title}  (${fmtMs(performance.now() - t0)})`);
      } catch (e) {
        const extra = e && e.stack ? e.stack : String(e);
        fail(`${title}  (${fmtMs(performance.now() - t0)})`, extra);
      } finally {
        // update pending list
        setQueue(names.slice(i + 1));
      }
    }

    setStatus("done");
    logLine(`<b>Done.</b> Summary — ✅ ${state.pass}  ❌ ${state.fail}  ⏳ ${state.skip}`);
  }

  function fmtMs(ms) {
    return ms < 1000 ? `${ms | 0}ms` : `${(ms / 1000).toFixed(2)}s`;
  }

  // Auto-run once after a short delay to let the page settle
  setTimeout(() => {
    // Only auto-run if not already run in this page session
    if (!window.__gmxhr_test_autorun__) {
      window.__gmxhr_test_autorun__ = true;
      runAll();
    }
  }, 600);
})();

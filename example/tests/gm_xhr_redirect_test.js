// ==UserScript==
// @name         xhr_redirect_test
// @namespace    tm-gmxhr-test
// @version      0.1.0
// @description  Comprehensive in-page tests for GM_xmlhttpRequest: normal, abnormal, and edge cases with clear pass/fail output.
// @author       you
// @match        *://*/*?GM_XHR_REDIRECT_TEST_SC
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @connect      httpbingo.org
// @noframes
// ==/UserScript==

const enableTool = true;
(async function () {
  "use strict";
  if (!enableTool) return;

  const { describe, it, expect, run } = SCTest.create({ name: "GM_xhr 重定向测试" });

  // ---------- Request helper ----------
  function gmRequest(details, { abortAfterMs } = {}) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const req = GM_xmlhttpRequest({
        ...details,
        onload:    res => resolve({ kind: "load",    res, ms: performance.now() - t0 }),
        onerror:   res => reject ({ kind: "error",   res, ms: performance.now() - t0 }),
        ontimeout: res => reject ({ kind: "timeout", res, ms: performance.now() - t0 }),
        onabort:   res => reject ({ kind: "abort",   res, ms: performance.now() - t0 }),
        onprogress: details.onprogress,
      });
      if (abortAfterMs != null) setTimeout(() => { try { req.abort(); } catch (_) {} }, abortAfterMs);
    });
  }

  const HB = "https://httpbingo.org";

  function objectProps(o) {
    if (!o || typeof o !== "object") return "not an object";
    let z, oD, zD;
    try { z = Object.assign({}, o); } catch { return "Object.assign failed"; }
    if (typeof (z.response    ?? "") !== "string") return "non-primitive response value exposed";
    if (typeof (z.responseText ?? "") !== "string") return "non-primitive responseText value exposed";
    if (typeof (z.responseXML  ?? "") !== "string") return "non-primitive responseXML value exposed";
    try { oD = JSON.stringify(o); } catch { return "JSON.stringify failed"; }
    try { zD = JSON.stringify(z); } catch { return "JSON.stringify failed"; }
    if (oD !== zD) return "Object Props Failed";
    return "ok";
  }

  // ---------- Tests ----------
  const basicTests = [
    {
      name: 'GET basic with search params 1',
      async run(fetch) {
        const { res } = await gmRequest({ method: "GET", url: `${HB}/get?testing=234&abc=567`, responseType: "json", fetch });
        expect(res.status).toBe(200);
        expect(res.response?.args?.testing?.[0]).toBe("234");
        expect(res.response?.args?.abc?.[0]).toBe("567");
        expect(res.response?.url).toBe(`${HB}/get?testing=234&abc=567`);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: 'GET basic with search params 2',
      async run(fetch) {
        const { res } = await gmRequest({ method: "GET", url: `${HB}/get?abc=567&testing=234`, responseType: "json", fetch });
        expect(res.status).toBe(200);
        expect(res.response?.args?.testing?.[0]).toBe("234");
        expect(res.response?.args?.abc?.[0]).toBe("567");
        expect(res.response?.url).toBe(`${HB}/get?abc=567&testing=234`);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [default]",
      async run(fetch) {
        const target = `${HB}/get?z=92`;
        const { res } = await gmRequest({ method: "GET", url: `${HB}/redirect-to?url=${encodeURIComponent(target)}`, fetch });
        expect(res.status).toBe(200);
        expect(res.finalUrl).toBe(target);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [follow]",
      async run(fetch) {
        const target = `${HB}/get?z=94`;
        const { res } = await gmRequest({ method: "GET", url: `${HB}/redirect-to?url=${encodeURIComponent(target)}`, redirect: "follow", fetch });
        expect(res.status).toBe(200);
        expect(res.finalUrl).toBe(target);
        expect(objectProps(res)).toBe("ok");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [error]",
      async run(fetch) {
        try {
          await Promise.race([
            gmRequest({ method: "GET", url: `${HB}/redirect-to?url=${encodeURIComponent(`${HB}/get?z=96`)}`, redirect: "error", fetch }),
            new Promise(resolve => setTimeout(resolve, 4000)),
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
        const url = `${HB}/redirect-to?url=${encodeURIComponent(`${HB}/get?z=98`)}`;
        const { res } = await Promise.race([
          gmRequest({ method: "GET", url, redirect: "manual", fetch }),
          new Promise(resolve => setTimeout(resolve, 4000)),
        ]);
        expect(res?.status).toBe(301);
        expect(res?.finalUrl).toBe(url);
        expect(typeof res?.responseHeaders).toBe("string");
        expect(objectProps(res)).toBe("ok");
      },
    },
  ];

  const tests = [
    ...basicTests,
    ...basicTests.map(t => ({ ...t, useFetch: true })),
  ];

  describe("GM_xmlhttpRequest 重定向", () => {
    for (const t of tests) {
      const label = `${t.useFetch ? "[fetch] " : "[xhr] "}${t.name}`;
      it(label, () => t.run(t.useFetch ? true : false));
    }
  });

  await run();
})();

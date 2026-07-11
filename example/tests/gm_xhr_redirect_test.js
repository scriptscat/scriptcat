// ==UserScript==
// @name         xhr_redirect_test
// @namespace    tm-gmxhr-test
// @version      0.1.0
// @description  Comprehensive in-page tests for GM_xmlhttpRequest: normal, abnormal, and edge cases with clear pass/fail output.
// @author       you
// @match        *://*/*?GM_XHR_REDIRECT_TEST_SC
// @grant        GM_xmlhttpRequest
// @connect      httpbun.com
// @noframes
// ==/UserScript==

const enableTool = true;
(function () {
  "use strict";
  if (!enableTool) return;

  // ---------- Panel ----------

  const panel = document.createElement("div");
  panel.id = "gmxhr-test-panel";
  panel.innerHTML = `
    <style>
      #gmxhr-test-panel {
        position:fixed; bottom:12px; right:12px; width:460px; max-height:70vh;
        overflow:auto; z-index:2147483647; background:#111; color:#f5f5f5;
        font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        border-radius:10px; box-shadow:0 12px 30px rgba(0,0,0,.4); border:1px solid #333;
      }
      #gmxhr-test-panel .hdr {
        position:sticky; top:0; background:#181818; padding:10px 12px;
        border-bottom:1px solid #333; display:flex; align-items:center; gap:8px;
      }
      #gmxhr-test-panel .hdr-info { flex:1 }
      #gmxhr-test-panel button {
        background:#2a6df1; color:#fff; border:0; padding:6px 10px;
        border-radius:6px; cursor:pointer;
      }
      #gmxhr-test-panel #status { padding:6px 12px; border-bottom:1px solid #222; opacity:.9 }
      #gmxhr-test-panel #log { padding:10px 12px }
      #gmxhr-test-panel #log > div { padding:6px 0; border-bottom:1px dashed #2a2a2a }
      #gmxhr-test-panel pre { white-space:pre-wrap; color:#bbb; margin:.5em 0 0 }
    </style>
    <div class="hdr">
      <div class="hdr-info">
        <div style="font-weight:500">GM_xmlhttpRequest Test Harness <span id="ver"></span></div>
        <div style="display:flex"><span id="handler"></span><span id="counts" style="margin-left:auto;opacity:.8">…</span></div>
      </div>
      <button id="start">Run</button>
      <button id="clear">Clear</button>
    </div>
    <div id="status">Status: idle</div>
    <div id="log"></div>
  `;
  document.documentElement.append(panel);

  panel.querySelector("#ver").textContent = GM.info?.script?.version ?? "";
  panel.querySelector("#handler").textContent = `${GM.info?.scriptHandler} ${GM.info?.version}`;

  const $log     = panel.querySelector("#log");
  const $counts  = panel.querySelector("#counts");
  const $status  = panel.querySelector("#status");

  panel.querySelector("#clear").addEventListener("click", () => {
    $log.textContent = "";
    setCounts(0, 0, 0);
    $status.textContent = "Status: idle";
  });
  panel.querySelector("#start").addEventListener("click", runAll);

  function logLine(html) {
    const el = document.createElement("div");
    el.innerHTML = html;
    $log.prepend(el);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[m]);
  }

  const state = { pass: 0, fail: 0, skip: 0 };
  function setCounts(p, f, s) { $counts.textContent = `✅ ${p}  ❌ ${f}  ⏳ ${s}`; }
  function pass(msg) { state.pass++; setCounts(state.pass, state.fail, state.skip); logLine(`✅ ${escapeHtml(msg)}`); }
  function fail(msg, extra) {
    state.fail++; setCounts(state.pass, state.fail, state.skip);
    logLine(`❌ ${escapeHtml(msg)}${extra ? `<pre>${escapeHtml(extra)}</pre>` : ""}`);
  }
  function skip(msg) { state.skip++; setCounts(state.pass, state.fail, state.skip); logLine(`⏭️ ${escapeHtml(msg)}`); }

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

  const HB = "https://httpbun.com";

  // ---------- Assertion utils ----------
  function assertEq(a, b, msg) {
    if (a !== b) throw new Error(msg ? `${msg}: expected ${b}, got ${a}` : `expected ${b}, got ${a}`);
  }

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
        assertEq(res.status, 200, "status 200");
        assertEq(res.response?.args?.testing, "234", "response ok");
        assertEq(res.response?.args?.abc, "567", "response ok");
        assertEq(res.response?.url, `${HB}/get?testing=234&abc=567`, "response ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: 'GET basic with search params 2',
      async run(fetch) {
        const { res } = await gmRequest({ method: "GET", url: `${HB}/get?abc=567&testing=234`, responseType: "json", fetch });
        assertEq(res.status, 200, "status 200");
        assertEq(res.response?.args?.testing, "234", "response ok");
        assertEq(res.response?.args?.abc, "567", "response ok");
        assertEq(res.response?.url, `${HB}/get?abc=567&testing=234`, "response ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [default]",
      async run(fetch) {
        const target = `${HB}/get?z=92`;
        const { res } = await gmRequest({ method: "GET", url: `${HB}/redirect-to?url=${encodeURIComponent(target)}`, fetch });
        assertEq(res.status, 200, "status after redirect is 200");
        assertEq(res.finalUrl, target, "finalUrl is redirected target");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [follow]",
      async run(fetch) {
        const target = `${HB}/get?z=94`;
        const { res } = await gmRequest({ method: "GET", url: `${HB}/redirect-to?url=${encodeURIComponent(target)}`, redirect: "follow", fetch });
        assertEq(res.status, 200, "status after redirect is 200");
        assertEq(res.finalUrl, target, "finalUrl is redirected target");
        assertEq(objectProps(res), "ok", "Object Props OK");
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
        const url = `${HB}/redirect-to?url=${encodeURIComponent(`${HB}/get?z=98`)}`;
        const { res } = await Promise.race([
          gmRequest({ method: "GET", url, redirect: "manual", fetch }),
          new Promise(resolve => setTimeout(resolve, 4000)),
        ]);
        assertEq(res?.status, 301, "status is 301");
        assertEq(res?.finalUrl, url, "finalUrl is original url");
        assertEq(typeof res?.responseHeaders === "string" && res?.responseHeaders !== "", true, "responseHeaders ok");
        assertEq(objectProps(res), "ok", "Object Props OK");
      },
    },
  ];

  const tests = [
    ...basicTests,
    ...basicTests.map(t => ({ ...t, useFetch: true })),
  ];

  // ---------- Runner ----------
  function fmtMs(ms) { return ms < 1000 ? `${ms | 0}ms` : `${(ms / 1000).toFixed(2)}s`; }

  async function runAll() {
    state.pass = state.fail = state.skip = 0;
    setCounts(0, 0, 0);
    logLine(`<b>Starting GM_xmlhttpRequest test suite</b> — ${new Date().toLocaleString()}`);

    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const tName = `${t.useFetch ? "[fetch]" : "[xhr]"} ${t.name}`;
      $status.textContent = `Status: running (${i + 1}/${tests.length}): ${tName}`;
      logLine(`▶️ <b>${escapeHtml(tName)}</b>`);
      const t0 = performance.now();
      try {
        await t.run(t.useFetch ? true : false);
        pass(`• ${tName}  (${fmtMs(performance.now() - t0)})`);
      } catch (e) {
        console.error(e);
        const stack = e?.stack ? e.stack.split("\n").slice(0, 4).join("\n") : null;
        fail(`• ${tName}  (${fmtMs(performance.now() - t0)})`, [e?.message, stack].filter(Boolean).join("\n"));
      }
    }

    $status.textContent = "Status: done";
    logLine(`<b>Done.</b> ✅ ${state.pass}  ❌ ${state.fail}  ⏳ ${state.skip}`);
  }

  setTimeout(() => {
    if (!window.__gmxhr_test_autorun__) {
      window.__gmxhr_test_autorun__ = true;
      runAll();
    }
  }, 600);
})();
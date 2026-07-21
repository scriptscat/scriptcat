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

(async ({ assert, pass, fail, skip, state, setCounts, logLine, fmtMs, $status, verSpan, handlerSpan, startBtn, clearBtn }) => {
  if (!enableTool) return;

  startBtn.addEventListener("click", runAll);
  clearBtn.addEventListener("click", () => {
    logLine.clear();
    setCounts(0, 0, 0);
    $status.textContent = "Status: idle";
  });

  verSpan.textContent = GM.info?.script?.version ?? "";
  handlerSpan.textContent = `${GM.info?.scriptHandler} ${GM.info?.version}`;

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
        assert(200, res.status, "status 200");
        assert("234", res.response?.args?.testing, "response ok");
        assert("567", res.response?.args?.abc, "response ok");
        assert(`${HB}/get?testing=234&abc=567`, res.response?.url, "response ok");
        assert("ok", objectProps(res), "Object Props OK");
      },
    },
    {
      name: 'GET basic with search params 2',
      async run(fetch) {
        const { res } = await gmRequest({ method: "GET", url: `${HB}/get?abc=567&testing=234`, responseType: "json", fetch });
        assert(200, res.status, "status 200");
        assert("234", res.response?.args?.testing, "response ok");
        assert("567", res.response?.args?.abc, "response ok");
        assert(`${HB}/get?abc=567&testing=234`, res.response?.url, "response ok");
        assert("ok", objectProps(res), "Object Props OK");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [default]",
      async run(fetch) {
        const target = `${HB}/get?z=92`;
        const { res } = await gmRequest({ method: "GET", url: `${HB}/redirect-to?url=${encodeURIComponent(target)}`, fetch });
        assert(200, res.status, "status after redirect is 200");
        assert(target, res.finalUrl, "finalUrl is redirected target");
        assert("ok", objectProps(res), "Object Props OK");
      },
    },
    {
      name: "Redirect handling (finalUrl changes) [follow]",
      async run(fetch) {
        const target = `${HB}/get?z=94`;
        const { res } = await gmRequest({ method: "GET", url: `${HB}/redirect-to?url=${encodeURIComponent(target)}`, redirect: "follow", fetch });
        assert(200, res.status, "status after redirect is 200");
        assert(target, res.finalUrl, "finalUrl is redirected target");
        assert("ok", objectProps(res), "Object Props OK");
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
          assert("error", e?.kind, "error ok");
          assert(408, e?.res?.status, "statusCode ok");
          assert(true, !e?.res?.finalUrl, "!finalUrl ok");
          assert("", e?.res?.responseHeaders, "responseHeaders ok");
          assert("ok", objectProps(e?.res), "Object Props OK");
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
        assert(301, res?.status, "status is 301");
        assert(url, res?.finalUrl, "finalUrl is original url");
        assert(true, typeof res?.responseHeaders === "string" && res?.responseHeaders !== "", "responseHeaders ok");
        assert("ok", objectProps(res), "Object Props OK");
      },
    },
  ];

  const tests = [
    ...basicTests,
    ...basicTests.map(t => ({ ...t, useFetch: true })),
  ];

  // ---------- Runner ----------
  async function runAll() {
    state.pass = state.fail = state.skip = 0;
    setCounts(0, 0, 0);
    logLine([{ text: "Starting GM_xmlhttpRequest test suite", bold: true }, { text: ` — ${new Date().toLocaleString()}` }]);

    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const tName = `${t.useFetch ? "[fetch]" : "[xhr]"} ${t.name}`;
      $status.textContent = `Status: running (${i + 1}/${tests.length}): ${tName}`;
      logLine([{ text: "▶️ " }, { text: tName, bold: true }]);
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
    logLine([{ text: "Done.", bold: true }, { text: ` ✅ ${state.pass}  ❌ ${state.fail}  ⏳ ${state.skip}` }]);
  }

  setTimeout(() => {
    if (!window.__gmxhr_test_autorun__) {
      window.__gmxhr_test_autorun__ = true;
      runAll();
    }
  }, 600);
})((() => {
  // ---------- Panel (DOM构建，避免innerHTML以兼容CSP) ----------
  const panel = document.createElement("div");
  panel.id = "gmxhr-test-panel";

  const style = document.createElement("style");
  style.textContent = `
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
  `;
  panel.appendChild(style);

  const hdr = document.createElement("div");
  hdr.className = "hdr";

  const hdrInfo = document.createElement("div");
  hdrInfo.className = "hdr-info";

  const titleDiv = document.createElement("div");
  titleDiv.style.fontWeight = "500";
  titleDiv.appendChild(document.createTextNode("GM_xmlhttpRequest Test Harness "));
  const verSpan = document.createElement("span");
  verSpan.id = "ver";
  titleDiv.appendChild(verSpan);
  hdrInfo.appendChild(titleDiv);

  const subRow = document.createElement("div");
  subRow.style.display = "flex";
  const handlerSpan = document.createElement("span");
  handlerSpan.id = "handler";
  const countsSpan = document.createElement("span");
  countsSpan.id = "counts";
  countsSpan.style.marginLeft = "auto";
  countsSpan.style.opacity = ".8";
  countsSpan.textContent = "…";
  subRow.appendChild(handlerSpan);
  subRow.appendChild(countsSpan);
  hdrInfo.appendChild(subRow);

  hdr.appendChild(hdrInfo);

  const startBtn = document.createElement("button");
  startBtn.id = "start";
  startBtn.textContent = "Run";
  const clearBtn = document.createElement("button");
  clearBtn.id = "clear";
  clearBtn.textContent = "Clear";
  hdr.appendChild(startBtn);
  hdr.appendChild(clearBtn);

  panel.appendChild(hdr);

  const $status = document.createElement("div");
  $status.id = "status";
  $status.textContent = "Status: idle";
  panel.appendChild($status);

  const $log = document.createElement("div");
  $log.id = "log";
  panel.appendChild($log);

  document.documentElement.append(panel);

  // assert(expected, actual, message) - 比较两个值是否相等
  function assert(expected, actual, message) {
    if (expected !== actual) {
      throw new Error(message ? `${message}: expected ${expected}, got ${actual}` : `expected ${expected}, got ${actual}`);
    }
  }

  const state = { pass: 0, fail: 0, skip: 0 };
  function setCounts(p, f, s) { countsSpan.textContent = `✅ ${p}  ❌ ${f}  ⏳ ${s}`; }

  // logLine(parts, extra) - parts 为字符串或 { text, bold } 片段数组；extra 为附加的 <pre> 文本
  function logLine(parts, extra) {
    const el = document.createElement("div");
    const segments = Array.isArray(parts) ? parts : [{ text: parts }];
    segments.forEach(seg => {
      if (seg.bold) {
        const b = document.createElement("b");
        b.textContent = seg.text;
        el.appendChild(b);
      } else {
        el.appendChild(document.createTextNode(seg.text));
      }
    });
    if (extra) {
      const pre = document.createElement("pre");
      pre.textContent = extra;
      el.appendChild(pre);
    }
    $log.prepend(el);
  }
  logLine.clear = () => { $log.textContent = ""; };

  function pass(msg) { state.pass++; setCounts(state.pass, state.fail, state.skip); logLine(`✅ ${msg}`); }
  function fail(msg, extra) { state.fail++; setCounts(state.pass, state.fail, state.skip); logLine(`❌ ${msg}`, extra); }
  function skip(msg) { state.skip++; setCounts(state.pass, state.fail, state.skip); logLine(`⏭️ ${msg}`); }

  function fmtMs(ms) { return ms < 1000 ? `${ms | 0}ms` : `${(ms / 1000).toFixed(2)}s`; }

  return { assert, pass, fail, skip, state, setCounts, logLine, fmtMs, $status, verSpan, handlerSpan, startBtn, clearBtn };
})());

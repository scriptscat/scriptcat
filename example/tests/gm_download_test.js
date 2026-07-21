// ==UserScript==
// @name         GM_download / GM.download Test Harness
// @namespace    tm-gmdl-test
// @version      0.2.0
// @description  Comprehensive in-page tests for GM_download / GM.download — covers downloadMode native/browser, url types (string / blob / Blob obj), callbacks, abort, conflictAction, and edge cases.
// @author       you
// @match        *://*/*?GM_DOWNLOAD_TEST_SC
// @grant        GM_download
// @grant        GM.download
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @connect      httpbun.com
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      ipv4.download.thinkbroadband.com
// @connect      nonexistent-domain-abcxyz.test
// @noframes
// ==/UserScript==

/*
  WHAT THIS DOES
  --------------
  - Drives a battery of tests covering options, callbacks, modes, url forms, and edge paths
    for GM_download / GM.download, reported through the shared example/tests/lib/sctest.js panel.
  - Every download actually writes a file to disk; all files go under a
    user-configurable sub-folder (edit the "prefix" field on the panel's
    "GM_download 自动套件" params row) so cleanup is one rm -rf away.

  WHAT IT COVERS
  --------------
  Auto (suite "GM_download 自动套件" — click its "运行" button in the panel):
    ✓ GM_download(url, name)   — string form
    ✓ GM_download({ ... })     — options-object form
    ✓ GM.download({ ... })     — promise form (resolve / reject)
    ✓ downloadMode "native"    — sc default: SW xhr fetch then chrome.downloads
    ✓ downloadMode "browser"   — chrome.downloads only, no xhr
    ✓ url types: http(s) string, blob: URL, data: URL, Blob object, File object
    ✓ conflictAction: uniquify / overwrite
    ✓ onprogress / onload / onerror / ontimeout
    ✓ abort() before connect, abort() during, abort() after onload
    ✓ headers (passed through to xhr in native mode)
    ✓ edge: bad url, empty url, 404, blocked host (@connect missing)

  Manual (suite "GM_download 手动用例" — its own "运行" button, deliberately excluded from the
  auto suite): each case prints instructions via console.log and shows a small floating verdict
  bar with Mark Pass / Mark Fail / Skip; auto-skips after a timeout so a forgotten test can't
  hang the suite.
    • saveAs: true — dialog appears, user saves
    • saveAs: true — user cancels → must NOT trigger onerror (the bug evaluated above)
    • native + handle.abort() while downloading → no onload, no onerror after abort
    • browser mode + cancel from chrome://downloads → must arrive as onload (save_cancelled),
      NOT onerror (this is the regression the download.ts fix guards against)
    • visual content check — open the file, confirm contents match

  Why two cancel tests, not one?
    In `downloadMode: "native"` the Service Worker fetches the whole file via xhr
    BEFORE chrome.downloads sees anything, so chrome://downloads never shows a
    real in-progress entry — you can't cancel it from there in time. So:
      - native mode  → test handle.abort() instead
      - browser mode → test the chrome://downloads Cancel button (real timing)

  HOW TO USE
  ----------
  1. Install in ScriptCat / Tampermonkey. Grant all listed permissions.
  2. Open any page whose URL matches *?GM_DOWNLOAD_TEST_SC
     (e.g. https://example.com/?GM_DOWNLOAD_TEST_SC)
  3. The sctest panel appears bottom-right. Click "运行 GM_download 自动套件" for the automated
     battery, or "运行 GM_download 手动用例" for the human-in-the-loop cases.
  4. Files land in your downloads folder under the prefix shown on the panel's params row —
     edit that field before clicking "运行" to change it.
*/

const enableTool = true;
(async function () {
  "use strict";
  if (!enableTool) return;

  const { describe, it, expect, run } = SCTest.create({ name: "GM_download 测试" });

  // ---------- Tiny DOM helper (only used for the manual-verdict bar below) ----------
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

  function btnStyle(bg) {
    return {
      background: bg || "#2a6df1",
      color: "white",
      border: "0",
      padding: "6px 10px",
      borderRadius: "6px",
      cursor: "pointer",
      font: "inherit",
    };
  }

  // ---------- Settings ----------
  // Prefix is the sub-folder under the user's Downloads dir, live-edited via the "GM_download
  // 自动套件" suite's params row (see describe() below) instead of the old GM_getValue/GM_setValue
  // persistence — the panel input already round-trips the value for the lifetime of the page.
  const autoParams = { prefix: "sc-test-" };
  function getPrefix() {
    let p = autoParams.prefix || "sc-test-";
    if (!p.endsWith("/")) p += "/";
    return p;
  }

  // Each test gets a unique tail so re-runs don't collide unless we explicitly
  // want them to (the conflictAction "overwrite" test reuses a fixed name).
  const RUN_TAG = Date.now().toString(36) + "-" + Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
  function nameFor(label, ext = "bin") {
    return getPrefix() + RUN_TAG + "-" + label.replace(/[^a-zA-Z0-9_-]+/g, "_") + "." + ext;
  }

  // ---------- A small dataset built once, reused everywhere ----------
  // 1x1 transparent PNG (67 bytes).
  const PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0xae, 0xb4, 0xfa, 0x77, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
  ]);
  const PNG_BLOB = new Blob([PNG_BYTES], { type: "image/png" });
  const TEXT_BLOB = new Blob(["hello from GM_download test harness"], { type: "text/plain" });
  // File extends Blob; useful to verify the URL-object branch handles File too.
  const TEXT_FILE = new File([TEXT_BLOB], "ignored-by-api.txt", { type: "text/plain" });

  // httpbun deterministic endpoint — returns N random bytes.
  const HB = "https://httpbun.com";

  function withTimeout(p, ms, label) {
    return new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error(`timed out after ${ms}ms: ${label || ""}`));
      }, ms);
      p.then((v) => { if (done) return; done = true; clearTimeout(t); resolve(v); },
             (e) => { if (done) return; done = true; clearTimeout(t); reject(e); });
    });
  }

  // ---------- Manual-verdict bar ----------
  // The manual tests can't be "asserted" purely from JS — the contract often is
  // "user sees a dialog, picks Cancel, the script doesn't crash". So we hand the
  // verdict back to the human via Pass/Fail/Skip buttons on this small floating bar,
  // kept separate from the sctest reporting panel: that panel only reports a case's
  // outcome once its fn() has returned, so it can't pause mid-case for a human decision,
  // and the abort-download test genuinely needs a live button while a download streams.
  // To avoid the runner hanging forever if the human disappears, every manual test runs
  // under a countdown that auto-skips when it hits zero.
  const verdictBar = h(
    "div",
    {
      id: "gmdl-verdict-bar",
      style: {
        position: "fixed", top: "12px", right: "12px",
        width: "360px", zIndex: 2147483647, display: "none",
        background: "#1a1408", color: "#f5f5f5",
        font: "13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        borderRadius: "10px", boxShadow: "0 12px 30px rgba(0,0,0,.4)",
        border: "1px solid #5b4a1a", padding: "10px 12px",
      },
    },
    h("div", { style: { fontWeight: "600", color: "#fbbf24" } }, "⏳ Awaiting your action"),
    h("div", { id: "verdictLabel", style: { fontSize: "12px", opacity: .85, margin: "4px 0 2px" } }, ""),
    h("div", { id: "verdictTimer", style: { fontSize: "12px", opacity: .85, fontFamily: "ui-monospace, monospace", marginBottom: "6px" } }, ""),
    h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
      h("button", { id: "verdictAction", style: { ...btnStyle("#0ea5e9"), display: "none" } }, ""),
      h("button", { id: "verdictPass", style: btnStyle("#16a34a") }, "✓ Mark Pass"),
      h("button", { id: "verdictFail", style: btnStyle("#dc2626") }, "✗ Mark Fail"),
      h("button", { id: "verdictSkip", style: btnStyle("#475569") }, "Skip")
    )
  );
  document.documentElement.appendChild(verdictBar);

  const $verdictLabel = verdictBar.querySelector("#verdictLabel");
  const $verdictTimer = verdictBar.querySelector("#verdictTimer");
  const $verdictPass = verdictBar.querySelector("#verdictPass");
  const $verdictFail = verdictBar.querySelector("#verdictFail");
  const $verdictSkip = verdictBar.querySelector("#verdictSkip");
  const $verdictAction = verdictBar.querySelector("#verdictAction");

  let _verdictResolve = null;
  let _verdictTimerId = null;
  let _verdictDeadline = 0;

  function showAwaiting(label, deadlineSecs) {
    $verdictLabel.textContent = label;
    verdictBar.style.display = "";
    _verdictDeadline = performance.now() + deadlineSecs * 1000;
    tickAwaitingTimer();
    if (_verdictTimerId) clearInterval(_verdictTimerId);
    _verdictTimerId = setInterval(tickAwaitingTimer, 250);
  }
  function tickAwaitingTimer() {
    const remaining = Math.max(0, Math.ceil((_verdictDeadline - performance.now()) / 1000));
    $verdictTimer.textContent = `auto-skip in ${remaining}s`;
    if (remaining === 0) {
      // Time's up — auto-skip so the runner doesn't hang.
      resolveVerdict({ verdict: "skip", reason: "timed out waiting for verdict" });
    }
  }
  function hideAwaiting() {
    verdictBar.style.display = "none";
    $verdictLabel.textContent = "";
    $verdictTimer.textContent = "";
    if (_verdictTimerId) { clearInterval(_verdictTimerId); _verdictTimerId = null; }
    // Tear down any registered action button so it doesn't leak into the next test.
    $verdictAction.style.display = "none";
    $verdictAction.textContent = "";
    $verdictAction.onclick = null;
  }
  function resolveVerdict(v) {
    if (!_verdictResolve) return;
    const r = _verdictResolve;
    _verdictResolve = null;
    hideAwaiting();
    r(v);
  }
  $verdictPass.addEventListener("click", () => resolveVerdict({ verdict: "pass" }));
  $verdictFail.addEventListener("click", () => {
    const reason = prompt("Why did this fail? (optional)", "") || "marked failed by user";
    resolveVerdict({ verdict: "fail", reason });
  });
  $verdictSkip.addEventListener("click", () => resolveVerdict({ verdict: "skip", reason: "skipped by user" }));

  /**
   * Wait for the human to give a verdict via the verdict bar.
   * @param {string} promptText  Plain-text instructions shown on the bar.
   * @param {number} [deadlineSecs=120]  Auto-skip after this many seconds of no input.
   * @returns {Promise<{verdict: "pass"|"fail"|"skip", reason?: string}>}
   */
  function awaitVerdict(promptText, deadlineSecs = 120) {
    return new Promise((resolve) => {
      _verdictResolve = resolve;
      showAwaiting(promptText, deadlineSecs);
    });
  }

  /**
   * Register an in-flight action button on the verdict bar.
   * Use to expose things like "🛑 Abort download" while we wait for a verdict.
   * The button auto-hides when the verdict resolves (or the next showAwaiting() is called).
   * @param {string} label  Button text.
   * @param {() => void} onClick  Click handler. Stays attached until the bar hides.
   */
  function showAwaitingAction(label, onClick) {
    $verdictAction.textContent = label;
    $verdictAction.style.display = "";
    $verdictAction.onclick = (ev) => {
      ev.preventDefault();
      try { onClick(); } catch (e) { console.error("awaiting action handler threw:", e); }
    };
  }

  // ---------- GM_download wrappers ----------

  /**
   * Call GM_download with the callback-based API and turn it into a promise.
   * Resolves on onload (or save_cancelled — TM's behavior), rejects on onerror/ontimeout.
   * Captures all progress events.
   *
   * Returns: { promise, handle, progress[] }
   *   - promise: { kind: "load"|"save_cancelled", data } / rejection
   *   - handle.abort(): abort the download
   *   - progress: array of onprogress callback args, in order received
   */
  function gmDownloadCb(details) {
    const progress = [];
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    let saveCancelled = false;
    const opts = {
      ...details,
      onprogress(p) {
        progress.push(p);
        try { details.onprogress && details.onprogress(p); } catch {}
      },
      onload(data) {
        try { details.onload && details.onload(data); } catch {}
        resolve({ kind: saveCancelled ? "save_cancelled" : "load", data });
      },
      onerror(err) {
        try { details.onerror && details.onerror(err); } catch {}
        reject({ kind: "error", err });
      },
      ontimeout(err) {
        try { details.ontimeout && details.ontimeout(err); } catch {}
        reject({ kind: "timeout", err });
      },
    };
    // GM_download returns { abort } in both TM and SC.
    const handle = GM_download(opts);
    return { promise, handle, progress, _markSaveCancelled() { saveCancelled = true; } };
  }

  /**
   * Call GM.download (promise form). Returns the Promise itself plus the abort handle.
   * Also collects onprogress events.
   */
  function gmDownloadPromise(details) {
    const progress = [];
    const opts = {
      ...details,
      onprogress(p) {
        progress.push(p);
        try { details.onprogress && details.onprogress(p); } catch {}
      },
    };
    const ret = GM.download(opts);
    return { promise: ret, abort: ret && ret.abort, progress };
  }

  // ---------- The auto/manual test data ----------
  // Each entry: { name, manual: boolean, run: async () => void }
  const tests = [];

  function autoTest(name, run) { tests.push({ name, manual: false, run }); }
  function manualTest(name, run) { tests.push({ name, manual: true, run }); }

  // 1) sanity: APIs exist
  autoTest("APIs exist (GM_download / GM.download)", async () => {
    expect(typeof GM_download).toBe("function");
    expect(typeof GM !== "undefined" && typeof GM.download === "function").toBeTruthy();
  });

  // 2) string-form: GM_download(url, name) — passes through to the options form
  autoTest("GM_download(url, name) — string form", async () => {
    const name = nameFor("string-form", "txt");
    const blobUrl = URL.createObjectURL(TEXT_BLOB);
    try {
      const result = await withTimeout(new Promise((resolve, reject) => {
        // String form has no callbacks, so we can only check that it does not throw
        // synchronously and returns an object with abort(). The actual download is
        // observed by the user.
        let h;
        try {
          h = GM_download(blobUrl, name);
        } catch (e) { return reject(e); }
        expect(h && typeof h.abort === "function").toBeTruthy();
        // Wait briefly to give the SW a chance to dispatch the download.
        setTimeout(() => resolve({ handle: h }), 800);
      }), 5000, "string-form");
      expect(!!result).toBeTruthy();
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  });

  // 3) options-form with onload
  autoTest("GM_download({...}) — options form, blob: URL", async () => {
    const name = nameFor("options-blob-url", "png");
    const blobUrl = URL.createObjectURL(PNG_BLOB);
    try {
      const { promise } = gmDownloadCb({
        url: blobUrl,
        name,
        conflictAction: "uniquify",
      });
      const r = await withTimeout(promise, 10000, "blob: URL download");
      expect(r.kind).toBe("load");
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  });

  // 4) Blob object as url — should be converted to data: URL or blob URL
  autoTest("GM_download with Blob object as url", async () => {
    const name = nameFor("blob-object", "png");
    const { promise } = gmDownloadCb({
      url: PNG_BLOB,
      name,
    });
    const r = await withTimeout(promise, 10000, "Blob object download");
    expect(r.kind).toBe("load");
  });

  // 5) File object as url — File extends Blob, should also work
  autoTest("GM_download with File object as url", async () => {
    const name = nameFor("file-object", "txt");
    const { promise } = gmDownloadCb({
      url: TEXT_FILE,
      name,
    });
    const r = await withTimeout(promise, 10000, "File object download");
    expect(r.kind).toBe("load");
  });

  // 6) data: URL
  autoTest("GM_download with data: URL", async () => {
    const name = nameFor("data-url", "txt");
    const dataUrl = "data:text/plain;charset=utf-8,hello%20from%20data%20url";
    const { promise } = gmDownloadCb({
      url: dataUrl,
      name,
    });
    const r = await withTimeout(promise, 10000, "data: URL download");
    expect(r.kind).toBe("load");
  });

  // 7) GM.download promise form
  autoTest("GM.download promise resolves on success", async () => {
    const name = nameFor("promise-form", "txt");
    const { promise } = gmDownloadPromise({
      url: URL.createObjectURL(TEXT_BLOB),
      name,
    });
    const r = await withTimeout(promise, 10000, "GM.download promise");
    expect(r && typeof r === "object").toBeTruthy();
  });

  // 8) native mode — uses SW fetch xhr, multiple onprogress events expected
  autoTest("downloadMode 'native' — xhr fetch, onprogress fires", async () => {
    const name = nameFor("mode-native", "bin");
    const t0 = performance.now();
    const r = await withTimeout(new Promise((resolve, reject) => {
      const h = GM_download({
        url: `${HB}/bytes/4096`,
        name,
        downloadMode: "native",
        onprogress(p) { /* captured in wrapper too, but native mode emits >=1 */ },
        onload: resolve,
        onerror: reject,
        ontimeout: reject,
      });
      // Don't keep the handle around — but ensure abort exists.
      if (!h || typeof h.abort !== "function") reject(new Error("handle.abort missing"));
    }), 20000, "native mode");
    expect(!!r).toBeTruthy();
    // Sanity bound: 4KB shouldn't take 20s on any sane net.
    expect(performance.now() - t0 < 20000).toBeTruthy();
  });

  // 9) browser mode — chrome.downloads only
  autoTest("downloadMode 'browser' — direct chrome.downloads", async () => {
    const name = nameFor("mode-browser", "bin");
    const r = await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: `${HB}/bytes/2048`,
        name,
        downloadMode: "browser",
        onload: resolve,
        onerror: reject,
        ontimeout: reject,
      });
    }), 20000, "browser mode");
    expect(!!r).toBeTruthy();
  });

  // 10) onprogress structure (native mode)
  autoTest("onprogress event shape (native mode)", async () => {
    const name = nameFor("progress-shape", "bin");
    const progresses = [];
    await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: `${HB}/bytes/1024`,
        name,
        downloadMode: "native",
        onprogress(p) { progresses.push(p); },
        onload: resolve,
        onerror: reject,
      });
    }), 20000, "progress shape");
    expect(progresses.length > 0).toBeTruthy();
    const last = progresses[progresses.length - 1];
    expect("loaded" in last).toBeTruthy();
    expect("total" in last).toBeTruthy();
    expect(last.mode === "native" || last.mode === "browser").toBeTruthy();
  });

  // 11) conflictAction "overwrite" — second download to the same name should replace
  autoTest("conflictAction 'overwrite' — second write replaces", async () => {
    // Note: we intentionally do NOT include RUN_TAG so the second run targets
    // the same path. uniquify would otherwise produce filename(1), filename(2)...
    const fixedName = getPrefix() + "overwrite-target.txt";
    const a = await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: URL.createObjectURL(new Blob(["v1"])),
        name: fixedName,
        conflictAction: "overwrite",
        onload: resolve,
        onerror: reject,
      });
    }), 10000, "overwrite #1");
    expect(!!a).toBeTruthy();
    const b = await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: URL.createObjectURL(new Blob(["v2"])),
        name: fixedName,
        conflictAction: "overwrite",
        onload: resolve,
        onerror: reject,
      });
    }), 10000, "overwrite #2");
    expect(!!b).toBeTruthy();
    // (visual check) fixedName should now contain "v2" — left for the human running the panel.
  });

  // 12) conflictAction "uniquify" — second download gets " (1)" suffix
  autoTest("conflictAction 'uniquify' — second write gets suffix", async () => {
    const fixedName = getPrefix() + "uniquify-target.txt";
    await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: URL.createObjectURL(new Blob(["v1"])),
        name: fixedName,
        conflictAction: "uniquify",
        onload: resolve,
        onerror: reject,
      });
    }), 10000, "uniquify #1");
    await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: URL.createObjectURL(new Blob(["v2"])),
        name: fixedName,
        conflictAction: "uniquify",
        onload: resolve,
        onerror: reject,
      });
    }), 10000, "uniquify #2");
    // (visual check) both fixedName and its " (1)" sibling should exist — no automatable assertion.
  });

  // 13) headers honored in native mode — httpbun /headers echoes request headers
  autoTest("headers passed to backend xhr (native mode)", async () => {
    // We can't easily inspect what hit the server because the response is
    // streamed to disk. So instead: ask /headers, which RESPONDS with the headers
    // we sent. Then read that file back via fetch from a blob-URL... no, files
    // on disk are not addressable. Cheap alternative: just verify the download
    // succeeded with custom headers attached and didn't error.
    const name = nameFor("headers-passthrough", "json");
    const r = await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: `${HB}/headers`,
        name,
        downloadMode: "native",
        headers: { "X-Custom-Probe": "scriptcat-gmdl-test" },
        onload: resolve,
        onerror: reject,
      });
    }), 20000, "headers passthrough");
    expect(!!r).toBeTruthy();
    // (visual check) open the file — X-Custom-Probe should be echoed in the body.
  });

  // 14) abort() immediately — should not produce a file
  autoTest("abort() immediately — no onload, no onerror reached", async () => {
    const name = nameFor("abort-immediate", "bin");
    let onloadCalled = false;
    const h = GM_download({
      url: `${HB}/bytes/65536`,
      name,
      downloadMode: "native",
      onload() { onloadCalled = true; },
    });
    h.abort();
    // Give the system 1.5s to (not) call any callbacks.
    await new Promise((r) => setTimeout(r, 1500));
    // Note: onerror may still fire in some impls after an immediate abort — we don't assert
    // on it either way. The important contract is: no successful onload.
    expect(onloadCalled).toBe(false);
  });

  // 15) abort() after onload — should be a no-op, no exceptions
  autoTest("abort() after onload — safe no-op", async () => {
    const name = nameFor("abort-after-load", "txt");
    let handle;
    await withTimeout(new Promise((resolve, reject) => {
      handle = GM_download({
        url: URL.createObjectURL(TEXT_BLOB),
        name,
        onload: resolve,
        onerror: reject,
      });
    }), 10000, "abort-after-load");
    try {
      handle.abort();
    } catch (e) {
      throw new Error("abort() after onload threw: " + e);
    }
  });

  // 16) blocked host: missing @connect — should hit onerror (native mode)
  autoTest("blocked host (missing @connect) — onerror", async () => {
    const name = nameFor("blocked-host", "bin");
    let onloadCalled = false;
    let errSeen = null;
    await new Promise((resolve) => {
      GM_download({
        url: "https://blocked-host-not-in-connect.example/",
        name,
        downloadMode: "native",
        onload() { onloadCalled = true; resolve(); },
        onerror(e) { errSeen = e || true; resolve(); },
      });
      // Safety timeout
      setTimeout(resolve, 8000);
    });
    expect(onloadCalled).toBe(false);
    expect(!!errSeen).toBeTruthy();
  });

  // 17) bad URL string — onerror or thrown
  autoTest("invalid URL — onerror (no crash)", async () => {
    const name = nameFor("bad-url", "bin");
    let onloadCalled = false, errSeen = null, threw = null;
    try {
      await new Promise((resolve) => {
        GM_download({
          url: "not-a-real-url://??",
          name,
          onload() { onloadCalled = true; resolve(); },
          onerror(e) { errSeen = e || true; resolve(); },
        });
        setTimeout(resolve, 4000);
      });
    } catch (e) { threw = e; }
    expect(onloadCalled).toBe(false);
    expect(errSeen != null || threw != null).toBeTruthy();
  });

  // 18) empty URL — new URL("", location.href) resolves to the current page per RFC 3986
  // (src/app/service/content/gm_api/gm_xhr.ts:230, shared by GM_download at :265), so an empty
  // url downloads the current document rather than erroring.
  autoTest("empty URL — resolves to the current page, succeeds (not an error)", async () => {
    const name = nameFor("empty-url", "bin");
    let onloadCalled = false, errSeen = null, threw = null;
    try {
      await new Promise((resolve, reject) => {
        GM_download({
          url: "",
          name,
          onload() { onloadCalled = true; resolve(); },
          onerror(e) { errSeen = e || true; reject(new Error(`unexpected onerror: ${JSON.stringify(e)}`)); },
        });
        setTimeout(() => reject(new Error("timed out waiting for onload")), 3000);
      });
    } catch (e) { threw = e; }
    expect(threw).toBe(null);
    expect(onloadCalled).toBe(true);
    expect(errSeen).toBe(null);
  });

  // 19) name with subdirectories — folder is created under Downloads/
  autoTest("name with subdirectories — nested folder created", async () => {
    const name = nameFor("nested/a/b/file", "txt");
    const r = await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: URL.createObjectURL(TEXT_BLOB),
        name,
        onload: resolve,
        onerror: reject,
      });
    }), 10000, "nested name");
    expect(!!r).toBeTruthy();
    // (visual check) name should exist with nested folders — no automatable assertion.
  });

  // 20) windows-illegal chars in name — should be sanitized (replaced with '-')
  autoTest("name with illegal characters — sanitized, no crash", async () => {
    // backend cleanFileName() replaces these. We don't know the exact
    // replacement but at least the download must succeed.
    const rawName = getPrefix() + RUN_TAG + "-illegal<>:\"|?*-chars.txt";
    const r = await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: URL.createObjectURL(TEXT_BLOB),
        name: rawName,
        onload: resolve,
        onerror: reject,
      });
    }), 10000, "illegal chars");
    expect(!!r).toBeTruthy();
  });

  // 21) GM.download rejection — invalid URL should reject the promise
  autoTest("GM.download promise rejects on invalid URL", async () => {
    let rejected = null, resolved = null;
    try {
      const p = GM.download({
        url: "https://blocked-host-not-in-connect-2.example/",
        name: nameFor("promise-reject", "bin"),
      });
      // Race with timeout
      await withTimeout(p.then(v => { resolved = v; }, e => { rejected = e; }), 8000, "promise-reject");
    } catch (e) {
      // withTimeout firing is acceptable too — counts as "did not resolve"
      rejected = e;
    }
    expect(resolved == null).toBeTruthy();
    expect(rejected != null).toBeTruthy();
  });

  // ---------- Manual tests (verdict-driven) ----------
  //
  // Each manual test:
  //   1. Logs a clear "what to do" and "what to expect" line to the console.
  //   2. Kicks off the download.
  //   3. Calls awaitVerdict(...) — the human reads the instructions, performs the action,
  //      then clicks Mark Pass / Mark Fail / Skip on the verdict bar.
  //   4. Records any callback events as they come in so the verdict isn't blind.
  //   5. Has an auto-skip timeout so a forgotten test can't wedge the runner.
  //
  // We avoid plain `new Promise()` here exactly because the previous version
  // could hang forever if neither onload nor onerror was called.

  manualTest("saveAs: true — save dialog appears and saves", async () => {
    const name = nameFor("manual-saveAs", "txt");
    console.log(`▶ Manual #1: ${name}`);
    console.log(`→ Expected: a Save As dialog appears. Pick a location and confirm.`);
    console.log(`→ After the file lands, click "Mark Pass". If no dialog shows, click "Mark Fail".`);
    const events = [];
    const blobUrl = URL.createObjectURL(TEXT_BLOB);
    GM_download({
      url: blobUrl,
      name,
      saveAs: true,
      onload: (d) => { events.push(["onload", d]); console.log(`→ event: onload ${JSON.stringify(d)}`); },
      onerror: (e) => { events.push(["onerror", e]); console.log(`→ event: onerror ${JSON.stringify(e)}`); },
      onprogress: (p) => events.push(["onprogress", p]),
    });
    const v = await awaitVerdict("Save the file when the dialog appears, then click Mark Pass.", 180);
    URL.revokeObjectURL(blobUrl);
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (events: ${events.map((e) => e[0]).join(", ") || "none"})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (events: ${events.map((e) => e[0]).join(", ") || "none"})`);
    // Pass — but if zero callbacks fired we want the human to see that too.
    if (events.length === 0) console.log(`note: no callbacks fired — Pass accepted but worth checking`);
  });

  manualTest("Cancel saveAs dialog — must NOT be onerror", async () => {
    const name = nameFor("manual-saveAs-cancel", "txt");
    console.log(`▶ Manual #2: ${name}`);
    console.log(`→ Expected: a Save As dialog appears. Click Cancel.`);
    console.log(`→ The contract: onload may fire (compat layer maps save_cancelled → onload), but onerror MUST NOT fire.`);
    let sawOnerror = false, sawOnload = false;
    const events = [];
    const blobUrl = URL.createObjectURL(TEXT_BLOB);
    GM_download({
      url: blobUrl,
      name,
      saveAs: true,
      onload: (d) => { sawOnload = true; events.push("onload"); console.log(`→ event: onload ${JSON.stringify(d)}`); },
      onerror: (e) => { sawOnerror = true; events.push("onerror"); console.log(`→ event: onerror ${JSON.stringify(e)}`); },
    });
    const v = await awaitVerdict(
      "When the Save As dialog appears, click Cancel. Watch the console: if you see 'onerror', click Mark Fail; otherwise Mark Pass.",
      180
    );
    URL.revokeObjectURL(blobUrl);
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (sawOnload=${sawOnload}, sawOnerror=${sawOnerror})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (sawOnload=${sawOnload}, sawOnerror=${sawOnerror})`);
    // Verdict was pass — sanity-check it against what we actually observed.
    if (sawOnerror) throw new Error("you marked Pass but onerror fired — that's the regression this test guards against");
    if (!sawOnload && !sawOnerror) console.log(`note: neither onload nor onerror fired — implementation may swallow the cancel silently`);
  });

  // Note on cancel testing:
  //   In `downloadMode: "native"` (the default), SC first fetches the file via
  //   the Service Worker, only handing it to chrome.downloads at the very end.
  //   That means chrome://downloads never shows a real in-progress entry — by
  //   the time it appears, the download is essentially done. You CANNOT cancel
  //   it from there in time. To test cancel-while-in-progress, we either:
  //     (a) use `downloadMode: "browser"` so chrome.downloads handles the network
  //         itself and chrome://downloads gets a real progress bar, or
  //     (b) call handle.abort() from the test (skips the human entirely on the
  //         "press Cancel in time" race).
  // We cover both.

  manualTest("Abort handle during native download — no onload, no onerror", async () => {
    const name = nameFor("manual-abort-native", "bin");
    // 100 MB over plain HTTP, with a cache-buster.
    const url = `http://ipv4.download.thinkbroadband.com/100MB.zip?t=${Date.now()}`;
    console.log(`▶ Manual #3a: ${name}`);
    console.log(`→ A 100 MB download (native mode) starts. Give it a second or two to get going`);
    console.log(`  (check chrome://downloads if you want to see live progress).`);
    console.log(`→ Click the "🛑 Abort download" button on the verdict bar. Then Mark Pass.`);
    console.log(`→ Contract: after abort(), no onload and no onerror should fire.`);
    let sawOnload = false, sawOnerror = false, lastProgress = null, abortCalledAt = 0;
    const handle = GM_download({
      url,
      name,
      downloadMode: "native",
      onprogress: (p) => { lastProgress = p; },
      onload: (d) => { sawOnload = true; console.log(`→ event: onload AFTER ABORT — regression: ${JSON.stringify(d)}`); },
      onerror: (e) => {
        // Some implementations DO surface onerror on abort. We log it but don't fail on that alone.
        sawOnerror = true;
        const sinceAbort = abortCalledAt ? `${(performance.now() - abortCalledAt) | 0}ms after abort()` : "BEFORE abort() — that's a different bug";
        console.log(`→ event: onerror (${sinceAbort}): ${JSON.stringify(e)}`);
      },
    });
    showAwaitingAction("🛑 Abort download", () => {
      if (abortCalledAt) { console.log("→ abort already requested"); return; }
      abortCalledAt = performance.now();
      console.log(`→ calling handle.abort()`);
      try { handle.abort(); } catch (e) { console.log(`abort threw: ${String(e)}`); }
    });
    const v = await awaitVerdict(
      "Wait a couple seconds, click 🛑 Abort download, then Mark Pass. (Mark Fail if onload fires after abort.)",
      300
    );
    const ctx = `aborted=${!!abortCalledAt}, sawOnload=${sawOnload}, sawOnerror=${sawOnerror}, lastProgress=${lastProgress ? `${lastProgress.loaded}/${lastProgress.total}` : "none"}`;
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (${ctx})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (${ctx})`);
    if (!abortCalledAt) console.log(`note: you marked Pass without clicking Abort — test was inconclusive`);
    // The strong invariant: no successful onload after the user asked for abort.
    if (sawOnload && abortCalledAt) throw new Error(`onload fired after abort — cancel was not honored (${ctx})`);
  });

  manualTest("Cancel via chrome://downloads (browser mode) — must arrive as onload (save_cancelled), NOT onerror", async () => {
    const name = nameFor("manual-cancel-inprogress-browser", "bin");
    // browser mode hands the HTTP fetch to chrome.downloads itself, so the
    // entry shows up in chrome://downloads with a real progress bar and a
    // working Cancel button. 100 MB on plain HTTP from thinkbroadband gives
    // a few seconds of real network time on most connections.
    const url = `http://ipv4.download.thinkbroadband.com/100MB.zip?t=${Date.now()}`;
    console.log(`▶ Manual #3b: ${name}`);
    console.log(`→ A 100 MB download (browser mode) starts — chrome://downloads will show it with a real progress bar.`);
    console.log(`→ Open chrome://downloads, find the entry, click Cancel.`);
    console.log(`→ Contract: SC treats user-cancel as save_cancelled and routes it to onload, NOT onerror.`);
    let sawOnload = false, sawOnerror = false, onloadData = null;
    GM_download({
      url,
      name,
      downloadMode: "browser",
      onload: (d) => { sawOnload = true; onloadData = d; console.log(`→ event: onload ${JSON.stringify(d)}`); },
      onerror: (e) => { sawOnerror = true; console.log(`→ event: onerror ${JSON.stringify(e)}`); },
    });
    const v = await awaitVerdict(
      "Cancel the download from chrome://downloads, then Mark Pass if you saw onload (and no onerror).",
      300
    );
    const ctx = `sawOnload=${sawOnload}, sawOnerror=${sawOnerror}, onloadData=${JSON.stringify(onloadData)}`;
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (${ctx})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (${ctx})`);
    // The exact regression this guards: onerror on user-cancel is the bug evaluated above.
    if (sawOnerror) throw new Error(`onerror fired on user-cancel — that's the save_cancelled regression (${ctx})`);
    if (!sawOnload) console.log(`note: neither onload nor onerror fired — did you actually cancel? Marking Pass anyway because user said so.`);
  });

  manualTest("Verify last download wrote a real file (visual check)", async () => {
    const name = nameFor("manual-visual-check", "txt");
    const content = `hello at ${new Date().toISOString()} - tag ${RUN_TAG}`;
    const blobUrl = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    console.log(`▶ Manual #4: a tiny file is being written.`);
    console.log(`→ Expected: open ${name} in your Downloads folder.`);
    console.log(`→ It must contain this exact text: ${content}`);
    let landed = false;
    GM_download({
      url: blobUrl,
      name,
      onload: () => { landed = true; console.log("→ event: onload — file should be on disk now."); },
      onerror: (e) => { console.log(`→ event: onerror ${JSON.stringify(e)}`); },
    });
    const v = await awaitVerdict(`Open ${name} and confirm the contents match.`, 240);
    URL.revokeObjectURL(blobUrl);
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (landed=${landed})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (landed=${landed})`);
    if (!landed) console.log(`note: marked Pass but onload didn't fire — file presence is the source of truth here`);
  });

  // ---------- Suites ----------
  // manual: true 用例原本被 runAuto()(旧版 :1083)用 tests.filter((t) => !t.manual) 排除在批量
  // 之外；迁移拆成两个 auto:false 的 suite，各自一个运行按钮，保持这个区分。
  describe("GM_download 自动套件", { auto: false, params: autoParams }, () => {
    for (const t of tests.filter((t) => !t.manual)) {
      it(t.name, () => t.run());
    }
  });

  describe("GM_download 手动用例", { auto: false }, () => {
    for (const t of tests.filter((t) => t.manual)) {
      it(t.name, () => t.run());
    }
  });

  await run();
})();

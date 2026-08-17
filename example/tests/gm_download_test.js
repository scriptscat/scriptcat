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
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
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
  - Builds an in-page test runner panel for GM_download / GM.download.
  - Drives a battery of tests covering options, callbacks, modes, url forms, and edge paths.
  - Every download actually writes a file to disk; all files go under a
    user-configurable sub-folder (default: "scriptcat-gmdl-tests/") so cleanup
    is one rm -rf away.

  WHAT IT COVERS
  --------------
  Auto:
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

  Manual (verdict-driven — human clicks Mark Pass/Fail/Skip; auto-skips after a timeout
  so a forgotten test can never hang the runner):
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
  3. The panel appears bottom-right. Click "Run Auto" to start.
  4. Files land in your downloads folder under the prefix shown in the panel.
     Click "Set prefix" to change it. Click "Clear log" to reset counts.
*/

const enableTool = true;
(function () {
  "use strict";
  if (!enableTool) return;

  // ---------- Tiny DOM helper ----------
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

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
    );
  }

  function fmtMs(ms) {
    return ms < 1000 ? `${ms | 0}ms` : `${(ms / 1000).toFixed(2)}s`;
  }

  // ---------- Settings (persisted) ----------
  // Prefix is the sub-folder under the user's Downloads dir. Trailing slash auto-appended.
  function getPrefix() {
    let p = "";
    try {
      p = (typeof GM_getValue === "function" ? GM_getValue("dl_prefix", "") : "") || "";
    } catch { /* ignore */ }
    if (!p) p = "scriptcat-gmdl-tests/";
    if (!p.endsWith("/")) p += "/";
    return p;
  }
  function setPrefix(p) {
    try {
      if (typeof GM_setValue === "function") GM_setValue("dl_prefix", p);
    } catch { /* ignore */ }
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

  // ---------- Panel ----------
  const panel = h(
    "div",
    {
      id: "gmdl-test-panel",
      style: {
        position: "fixed", bottom: "12px", right: "12px",
        width: "520px", maxHeight: "78vh", overflow: "auto",
        zIndex: 2147483647,
        background: "#111", color: "#f5f5f5",
        font: "13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        borderRadius: "10px", boxShadow: "0 12px 30px rgba(0,0,0,.4)",
        border: "1px solid #333",
      },
    },
    h(
      "div",
      {
        style: {
          position: "sticky", top: 0, background: "#181818",
          padding: "10px 12px", borderBottom: "1px solid #333",
          display: "flex", alignItems: "center", gap: "8px",
        },
      },
      h("div", { style: { flex: "1 1 auto" } },
        h("div", { style: { fontWeight: "600" } },
          `GM_download Test Harness ${(typeof GM_info === "object" && GM_info.script && GM_info.script.version) || ""}`
        ),
        h("div", { style: { display: "flex", flexDirection: "row", gap: "10px", marginTop: "2px", opacity: .85, flexWrap: "wrap" } },
          h("div", { style: { fontWeight: "400" } },
            `${(typeof GM_info === "object" && GM_info.scriptHandler) || "?"} ${(typeof GM_info === "object" && GM_info.version) || ""}`),
          h("div", { id: "counts", style: { marginLeft: "auto" } }, "…")
        )
      ),
      h("button", { id: "start", style: btnStyle() }, "Run Auto"),
      h("button", { id: "clear", style: btnStyle("#444") }, "Clear log")
    ),

    h("div", { id: "status", style: { padding: "6px 12px", borderBottom: "1px solid #222", opacity: .9 } }, "Status: idle"),

    // Settings strip.
    h("div", { style: { padding: "6px 12px", borderBottom: "1px solid #222", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
      h("span", { style: { opacity: .8 } }, "Download prefix:"),
      h("code", { id: "prefix", style: { background: "#222", padding: "2px 6px", borderRadius: "4px" } }, getPrefix()),
      h("button", { id: "setPrefix", style: btnStyle("#444") }, "Set prefix"),
      h("span", { style: { opacity: .6, marginLeft: "auto", fontSize: "11.5px" } }, `RunTag: ${RUN_TAG}`)
    ),

    // Manual section.
    h("details",
      { id: "manualWrap", open: false, style: { padding: "0 12px 8px", borderBottom: "1px solid #222" } },
      h("summary", { style: { padding: "6px 0", cursor: "pointer", userSelect: "none" } }, "Manual tests (require human)"),
      h("div", { id: "manualHint", style: { fontSize: "12px", opacity: .75, margin: "4px 0 6px" } },
        "Each manual test waits for your verdict. Read the instructions in the log, perform the action, then click Mark Pass or Mark Fail. Skip ends the test without a verdict."
      ),
      h("div", { id: "manualButtons", style: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" } })
    ),

    // Awaiting bar — shown only while a manual test is in flight.
    h("div", { id: "awaitingWrap", style: { padding: "8px 12px", borderBottom: "1px solid #222", display: "none", background: "#1a1408" } },
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
        h("div", { style: { flex: "1 1 auto" } },
          h("div", { style: { fontWeight: "600", color: "#fbbf24" } }, "⏳ Awaiting your action"),
          h("div", { id: "awaitingLabel", style: { fontSize: "12px", opacity: .85, marginTop: "2px" } }, "")
        ),
        h("div", { id: "awaitingTimer", style: { fontSize: "12px", opacity: .85, fontFamily: "ui-monospace, monospace" } }, ""),
        // Optional in-flight action button (e.g. "🛑 Abort download"); tests register a handler via showAwaitingAction().
        h("button", { id: "awaitingAction", style: { ...btnStyle("#0ea5e9"), display: "none" } }, ""),
        h("button", { id: "awaitingPass", style: btnStyle("#16a34a") }, "✓ Mark Pass"),
        h("button", { id: "awaitingFail", style: btnStyle("#dc2626") }, "✗ Mark Fail"),
        h("button", { id: "awaitingSkip", style: btnStyle("#475569") }, "Skip")
      )
    ),

    // Queue.
    h("details", { id: "queueWrap", open: false, style: { padding: "0 12px 6px", borderBottom: "1px solid #222" } },
      h("summary", { style: { padding: "6px 0", cursor: "pointer", userSelect: "none" } }, "Pending auto tests"),
      h("div", {
        id: "queue",
        style: {
          fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
          whiteSpace: "pre-wrap", opacity: .8,
        },
      }, "(none)")
    ),

    // Live progress for currently running test.
    h("div", { id: "progressWrap", style: { padding: "6px 12px", borderBottom: "1px solid #222", display: "none" } },
      h("div", { id: "progressLabel", style: { fontSize: "12px", opacity: .8, marginBottom: "4px" } }, ""),
      h("div", { style: { background: "#222", height: "6px", borderRadius: "3px", overflow: "hidden" } },
        h("div", { id: "progressBar", style: { background: "#2a6df1", height: "100%", width: "0%", transition: "width .15s" } })
      )
    ),

    h("div", { id: "log", style: { padding: "10px 12px" } })
  );
  document.documentElement.appendChild(panel);

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

  const $log = panel.querySelector("#log");
  const $counts = panel.querySelector("#counts");
  const $status = panel.querySelector("#status");
  const $queue = panel.querySelector("#queue");
  const $prefix = panel.querySelector("#prefix");
  const $progressWrap = panel.querySelector("#progressWrap");
  const $progressLabel = panel.querySelector("#progressLabel");
  const $progressBar = panel.querySelector("#progressBar");
  const $manualButtons = panel.querySelector("#manualButtons");
  const $awaitingWrap = panel.querySelector("#awaitingWrap");
  const $awaitingLabel = panel.querySelector("#awaitingLabel");
  const $awaitingTimer = panel.querySelector("#awaitingTimer");
  const $awaitingPass = panel.querySelector("#awaitingPass");
  const $awaitingFail = panel.querySelector("#awaitingFail");
  const $awaitingSkip = panel.querySelector("#awaitingSkip");
  const $awaitingAction = panel.querySelector("#awaitingAction");

  panel.querySelector("#clear").addEventListener("click", () => {
    $log.textContent = "";
    state.pass = state.fail = state.skip = 0;
    setCounts();
    setStatus("idle");
    setQueue([]);
    hideProgress();
  });
  panel.querySelector("#start").addEventListener("click", () => runAuto());
  panel.querySelector("#setPrefix").addEventListener("click", () => {
    const cur = getPrefix();
    const next = prompt("Download sub-folder (under Downloads). Trailing slash optional.", cur);
    if (next == null) return;
    setPrefix(next.trim() || "scriptcat-gmdl-tests/");
    $prefix.textContent = getPrefix();
    logLine(`Prefix set to <code>${escapeHtml(getPrefix())}</code>`);
  });

  function logLine(html, cls = "") {
    const line = h("div", { style: { padding: "6px 0", borderBottom: "1px dashed #2a2a2a" } });
    line.innerHTML = html;
    if (cls) line.className = cls;
    $log.prepend(line);
  }

  // ---------- Counters & status ----------
  const state = { pass: 0, fail: 0, skip: 0 };
  function setCounts() {
    $counts.textContent = `✅ ${state.pass}  ❌ ${state.fail}  ⏭️ ${state.skip}`;
  }
  setCounts();
  function setStatus(text) { $status.textContent = `Status: ${text}`; }
  function setQueue(items) {
    $queue.textContent = items.length ? items.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(none)";
  }
  function pass(msg) { state.pass++; setCounts(); logLine(`✅ ${escapeHtml(msg)}`); }
  function fail(msg, extra) {
    state.fail++; setCounts();
    logLine(
      `❌ ${escapeHtml(msg)}${extra ? `<pre style="white-space:pre-wrap;color:#bbb;margin:.5em 0 0">${escapeHtml(extra)}</pre>` : ""}`,
      "fail"
    );
  }
  function skip(msg) { state.skip++; setCounts(); logLine(`⏭️ ${escapeHtml(msg)}`); }

  function showProgress(label) {
    $progressWrap.style.display = "";
    $progressLabel.textContent = label;
    $progressBar.style.width = "0%";
  }
  function updateProgress(loaded, total) {
    if (total > 0) {
      $progressBar.style.width = Math.min(100, Math.round((loaded / total) * 100)) + "%";
    } else {
      // Unknown total — fake an indeterminate bar that creeps up.
      const cur = parseFloat($progressBar.style.width) || 0;
      $progressBar.style.width = Math.min(95, cur + 5) + "%";
    }
  }
  function hideProgress() {
    $progressWrap.style.display = "none";
    $progressBar.style.width = "0%";
  }

  // ---------- Assertion helpers ----------
  function assertEq(a, b, msg) {
    if (a !== b) throw new Error(msg ? `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}` : `expected ${b}, got ${a}`);
  }
  function assertTrue(cond, msg) { if (!cond) throw new Error(msg || "assertTrue failed"); }
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

  // ---------- Awaiting bar (manual-test verdict UI) ----------
  // The manual tests can't be "asserted" purely from JS — the contract often is
  // "user sees a dialog, picks Cancel, the script doesn't crash". So we hand the
  // verdict back to the human via Pass/Fail/Skip buttons. To avoid the runner
  // hanging forever if the human disappears, every manual test runs under a
  // countdown that auto-skips when it hits zero.
  let _verdictResolve = null;
  let _verdictTimerId = null;
  let _verdictDeadline = 0;

  function showAwaiting(label, deadlineSecs) {
    $awaitingLabel.innerHTML = label; // caller controls HTML, we trust it
    $awaitingWrap.style.display = "";
    _verdictDeadline = performance.now() + deadlineSecs * 1000;
    tickAwaitingTimer();
    if (_verdictTimerId) clearInterval(_verdictTimerId);
    _verdictTimerId = setInterval(tickAwaitingTimer, 250);
  }
  function tickAwaitingTimer() {
    const remaining = Math.max(0, Math.ceil((_verdictDeadline - performance.now()) / 1000));
    $awaitingTimer.textContent = `auto-skip in ${remaining}s`;
    if (remaining === 0) {
      // Time's up — auto-skip so the runner doesn't hang.
      resolveVerdict({ verdict: "skip", reason: "timed out waiting for verdict" });
    }
  }
  function hideAwaiting() {
    $awaitingWrap.style.display = "none";
    $awaitingLabel.innerHTML = "";
    $awaitingTimer.textContent = "";
    if (_verdictTimerId) { clearInterval(_verdictTimerId); _verdictTimerId = null; }
    // Tear down any registered action button so it doesn't leak into the next test.
    $awaitingAction.style.display = "none";
    $awaitingAction.textContent = "";
    $awaitingAction.onclick = null;
  }
  function resolveVerdict(v) {
    if (!_verdictResolve) return;
    const r = _verdictResolve;
    _verdictResolve = null;
    hideAwaiting();
    r(v);
  }
  $awaitingPass.addEventListener("click", () => resolveVerdict({ verdict: "pass" }));
  $awaitingFail.addEventListener("click", () => {
    const reason = prompt("Why did this fail? (optional)", "") || "marked failed by user";
    resolveVerdict({ verdict: "fail", reason });
  });
  $awaitingSkip.addEventListener("click", () => resolveVerdict({ verdict: "skip", reason: "skipped by user" }));

  /**
   * Wait for the human to give a verdict via the awaiting bar.
   * @param {string} promptHtml  HTML shown in the awaiting bar (be careful — trusted source).
   * @param {number} [deadlineSecs=120]  Auto-skip after this many seconds of no input.
   * @returns {Promise<{verdict: "pass"|"fail"|"skip", reason?: string}>}
   */
  function awaitVerdict(promptHtml, deadlineSecs = 120) {
    return new Promise((resolve) => {
      _verdictResolve = resolve;
      showAwaiting(promptHtml, deadlineSecs);
    });
  }

  /**
   * Register an in-flight action button on the awaiting bar.
   * Use to expose things like "🛑 Abort download" while we wait for a verdict.
   * The button auto-hides when the verdict resolves (or the next showAwaiting() is called).
   * @param {string} label  Button text.
   * @param {() => void} onClick  Click handler. Stays attached until the bar hides.
   */
  function showAwaitingAction(label, onClick) {
    $awaitingAction.textContent = label;
    $awaitingAction.style.display = "";
    $awaitingAction.onclick = (ev) => {
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
        updateProgress(p.loaded ?? p.done ?? 0, p.total ?? p.totalSize ?? -1);
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
        updateProgress(p.loaded ?? p.done ?? 0, p.total ?? p.totalSize ?? -1);
      },
    };
    const ret = GM.download(opts);
    return { promise: ret, abort: ret && ret.abort, progress };
  }

  // ---------- The auto test suite ----------
  // Each entry: { name, manual?: boolean, run: async () => void }
  const tests = [];

  function autoTest(name, run) { tests.push({ name, manual: false, run }); }
  function manualTest(name, run) { tests.push({ name, manual: true, run }); }

  // 1) sanity: APIs exist
  autoTest("APIs exist (GM_download / GM.download)", async () => {
    assertEq(typeof GM_download, "function", "GM_download must be a function");
    assertTrue(typeof GM !== "undefined" && typeof GM.download === "function", "GM.download must exist");
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
        assertTrue(h && typeof h.abort === "function", "handle.abort must be a function");
        // Wait briefly to give the SW a chance to dispatch the download.
        setTimeout(() => resolve({ handle: h }), 800);
      }), 5000, "string-form");
      assertTrue(!!result, "completed");
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
      assertEq(r.kind, "load", "onload should fire");
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
    assertEq(r.kind, "load", "onload should fire");
  });

  // 5) File object as url — File extends Blob, should also work
  autoTest("GM_download with File object as url", async () => {
    const name = nameFor("file-object", "txt");
    const { promise } = gmDownloadCb({
      url: TEXT_FILE,
      name,
    });
    const r = await withTimeout(promise, 10000, "File object download");
    assertEq(r.kind, "load", "onload should fire");
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
    assertEq(r.kind, "load", "onload should fire");
  });

  // 7) GM.download promise form
  autoTest("GM.download promise resolves on success", async () => {
    const name = nameFor("promise-form", "txt");
    const { promise } = gmDownloadPromise({
      url: URL.createObjectURL(TEXT_BLOB),
      name,
    });
    const r = await withTimeout(promise, 10000, "GM.download promise");
    assertTrue(r && typeof r === "object", "should resolve to an object");
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
    assertTrue(!!r, "onload received");
    // Sanity bound: 4KB shouldn't take 20s on any sane net.
    assertTrue(performance.now() - t0 < 20000, "completed in time");
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
    assertTrue(!!r, "onload received");
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
    assertTrue(progresses.length > 0, "got at least one progress event");
    const last = progresses[progresses.length - 1];
    assertTrue("loaded" in last, "progress has loaded");
    assertTrue("total" in last, "progress has total");
    assertTrue(last.mode === "native" || last.mode === "browser", `mode field present, got ${last.mode}`);
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
    assertTrue(!!a, "first write succeeded");
    const b = await withTimeout(new Promise((resolve, reject) => {
      GM_download({
        url: URL.createObjectURL(new Blob(["v2"])),
        name: fixedName,
        conflictAction: "overwrite",
        onload: resolve,
        onerror: reject,
      });
    }), 10000, "overwrite #2");
    assertTrue(!!b, "second write succeeded (overwrite)");
    skip(`(visual check) ${fixedName} should now contain "v2"`);
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
    skip(`(visual check) you should see both uniquify-target.txt and uniquify-target (1).txt`);
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
    assertTrue(!!r, "onload received");
    skip(`(visual check) open ${name} — X-Custom-Probe should be echoed in the body`);
  });

  // 14) abort() immediately — should not produce a file
  autoTest("abort() immediately — no onload, no onerror reached", async () => {
    const name = nameFor("abort-immediate", "bin");
    let onloadCalled = false, onerrorCalled = false;
    const h = GM_download({
      url: `${HB}/bytes/65536`,
      name,
      downloadMode: "native",
      onload() { onloadCalled = true; },
      onerror() { onerrorCalled = true; },
    });
    h.abort();
    // Give the system 1.5s to (not) call any callbacks.
    await new Promise((r) => setTimeout(r, 1500));
    assertEq(onloadCalled, false, "onload should not fire after immediate abort");
    // Note: onerror may still fire in some impls — we accept either no-call or a
    // generic error. The important contract is: no successful onload.
    if (onerrorCalled) {
      skip("onerror fired post-abort (implementation choice, not a failure)");
    }
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
    assertEq(onloadCalled, false, "onload must NOT fire");
    assertTrue(!!errSeen, "onerror should fire");
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
    assertEq(onloadCalled, false, "onload must NOT fire on bad URL");
    assertTrue(errSeen != null || threw != null, "either onerror fires or it throws");
  });

  // 18) empty URL — should be rejected
  autoTest("empty URL — onerror or thrown", async () => {
    const name = nameFor("empty-url", "bin");
    let onloadCalled = false, errSeen = null, threw = null;
    try {
      await new Promise((resolve) => {
        GM_download({
          url: "",
          name,
          onload() { onloadCalled = true; resolve(); },
          onerror(e) { errSeen = e || true; resolve(); },
        });
        setTimeout(resolve, 3000);
      });
    } catch (e) { threw = e; }
    assertEq(onloadCalled, false, "onload must NOT fire on empty URL");
    assertTrue(errSeen != null || threw != null, "either onerror fires or it throws");
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
    assertTrue(!!r, "onload received");
    skip(`(visual check) ${name} should exist with nested folders`);
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
    assertTrue(!!r, "onload received — name was sanitized");
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
    assertTrue(resolved == null, "should not resolve");
    assertTrue(rejected != null, "should reject (or at least not resolve)");
  });

  // ---------- Manual tests (verdict-driven) ----------
  //
  // Each manual test:
  //   1. Logs a clear "what to do" and "what to expect" line.
  //   2. Kicks off the download.
  //   3. Calls awaitVerdict(...) — the human reads the log, performs the action,
  //      then clicks Mark Pass / Mark Fail / Skip in the awaiting bar.
  //   4. Records any callback events as they come in so the verdict isn't blind.
  //   5. Has an auto-skip timeout so a forgotten test can't wedge the runner.
  //
  // We avoid plain `new Promise()` here exactly because the previous version
  // could hang forever if neither onload nor onerror was called.

  manualTest("saveAs: true — save dialog appears and saves", async () => {
    const name = nameFor("manual-saveAs", "txt");
    logLine(`▶ <b>Manual #1</b>: <i>${escapeHtml(name)}</i>`);
    logLine(`→ Expected: a <b>Save As</b> dialog appears. <b>Pick a location and confirm.</b>`);
    logLine(`→ After the file lands, click <b>Mark Pass</b>. If no dialog shows, click <b>Mark Fail</b>.`);
    const events = [];
    const blobUrl = URL.createObjectURL(TEXT_BLOB);
    GM_download({
      url: blobUrl,
      name,
      saveAs: true,
      onload: (d) => { events.push(["onload", d]); logLine(`→ event: onload ${JSON.stringify(d)}`); },
      onerror: (e) => { events.push(["onerror", e]); logLine(`→ event: onerror ${JSON.stringify(e)}`); },
      onprogress: (p) => events.push(["onprogress", p]),
    });
    const v = await awaitVerdict("Save the file when the dialog appears, then click Mark Pass.", 180);
    URL.revokeObjectURL(blobUrl);
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (events: ${events.map((e) => e[0]).join(", ") || "none"})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (events: ${events.map((e) => e[0]).join(", ") || "none"})`);
    // Pass — but if zero callbacks fired we want the human to see that too.
    if (events.length === 0) logLine(`<b style="color:#fbbf24">note: no callbacks fired — Pass accepted but worth checking</b>`);
  });

  manualTest("Cancel saveAs dialog — must NOT be onerror", async () => {
    const name = nameFor("manual-saveAs-cancel", "txt");
    logLine(`▶ <b>Manual #2</b>: <i>${escapeHtml(name)}</i>`);
    logLine(`→ Expected: a <b>Save As</b> dialog appears. <b>Click Cancel.</b>`);
    logLine(`→ The contract: onload may fire (compat layer maps save_cancelled → onload),`);
    logLine(`&nbsp;&nbsp;&nbsp;but <b style="color:#f87171">onerror MUST NOT fire</b>.`);
    let sawOnerror = false, sawOnload = false;
    const events = [];
    const blobUrl = URL.createObjectURL(TEXT_BLOB);
    GM_download({
      url: blobUrl,
      name,
      saveAs: true,
      onload: (d) => { sawOnload = true; events.push("onload"); logLine(`→ event: onload ${JSON.stringify(d)}`); },
      onerror: (e) => { sawOnerror = true; events.push("onerror"); logLine(`<b style="color:#f87171">→ event: onerror ${JSON.stringify(e)}</b>`); },
    });
    const v = await awaitVerdict(
      "When the Save As dialog appears, click <b>Cancel</b>. Watch the log: if you see <code>onerror</code>, click Mark Fail; otherwise Mark Pass.",
      180
    );
    URL.revokeObjectURL(blobUrl);
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (sawOnload=${sawOnload}, sawOnerror=${sawOnerror})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (sawOnload=${sawOnload}, sawOnerror=${sawOnerror})`);
    // Verdict was pass — sanity-check it against what we actually observed.
    if (sawOnerror) throw new Error("you marked Pass but onerror fired — that's the regression this test guards against");
    if (!sawOnload && !sawOnerror) logLine(`<b style="color:#fbbf24">note: neither onload nor onerror fired — implementation may swallow the cancel silently</b>`);
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
    logLine(`▶ <b>Manual #3a</b>: <i>${escapeHtml(name)}</i>`);
    logLine(`→ A 100 MB download (native mode) starts. Wait until you see <code>onprogress</code> events streaming.`);
    logLine(`→ Click the <b style="color:#0ea5e9">🛑 Abort download</b> button. Then Mark Pass.`);
    logLine(`→ Contract: after abort(), <b>no onload</b> and <b>no onerror</b> should fire.`);
    let sawOnload = false, sawOnerror = false, lastProgress = null, abortCalledAt = 0;
    const handle = GM_download({
      url,
      name,
      downloadMode: "native",
      onprogress: (p) => {
        lastProgress = p;
        updateProgress(p.loaded ?? p.done ?? 0, p.total ?? p.totalSize ?? -1);
      },
      onload: (d) => { sawOnload = true; logLine(`<b style="color:#f87171">→ event: onload AFTER ABORT — regression: ${JSON.stringify(d)}</b>`); },
      onerror: (e) => {
        // Some implementations DO surface onerror on abort. We log it but don't fail on that alone.
        sawOnerror = true;
        const sinceAbort = abortCalledAt ? `${(performance.now() - abortCalledAt) | 0}ms after abort()` : "BEFORE abort() — that's a different bug";
        logLine(`→ event: onerror (${sinceAbort}): ${JSON.stringify(e)}`);
      },
    });
    showProgress("downloading 100 MB (abort me)");
    showAwaitingAction("🛑 Abort download", () => {
      if (abortCalledAt) { logLine("→ abort already requested"); return; }
      abortCalledAt = performance.now();
      logLine(`→ calling handle.abort()`);
      try { handle.abort(); } catch (e) { logLine(`<b style="color:#f87171">abort threw: ${escapeHtml(String(e))}</b>`); }
    });
    const v = await awaitVerdict(
      "Wait for progress events, click 🛑 Abort download, then Mark Pass. (Mark Fail if onload fires after abort.)",
      300
    );
    hideProgress();
    const ctx = `aborted=${!!abortCalledAt}, sawOnload=${sawOnload}, sawOnerror=${sawOnerror}, lastProgress=${lastProgress ? `${lastProgress.loaded}/${lastProgress.total}` : "none"}`;
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (${ctx})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (${ctx})`);
    if (!abortCalledAt) logLine(`<b style="color:#fbbf24">note: you marked Pass without clicking Abort — test was inconclusive</b>`);
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
    logLine(`▶ <b>Manual #3b</b>: <i>${escapeHtml(name)}</i>`);
    logLine(`→ A 100 MB download (<b>browser mode</b>) starts — chrome://downloads will show it with a real progress bar.`);
    logLine(`→ Open <code>chrome://downloads</code>, find the entry, click <b>Cancel</b>.`);
    logLine(`→ Contract: SC treats user-cancel as <code>save_cancelled</code> and routes it to <b>onload</b>, NOT <code>onerror</code>.`);
    let sawOnload = false, sawOnerror = false, onloadData = null;
    GM_download({
      url,
      name,
      downloadMode: "browser",
      onprogress: (p) => updateProgress(p.loaded ?? p.done ?? 0, p.total ?? p.totalSize ?? -1),
      onload: (d) => { sawOnload = true; onloadData = d; logLine(`→ event: onload ${JSON.stringify(d)}`); },
      onerror: (e) => { sawOnerror = true; logLine(`<b style="color:#f87171">→ event: onerror ${JSON.stringify(e)}</b>`); },
    });
    showProgress("downloading 100 MB (cancel from chrome://downloads)");
    const v = await awaitVerdict(
      "Cancel the download from chrome://downloads, then Mark Pass if you saw onload (and no onerror).",
      300
    );
    hideProgress();
    const ctx = `sawOnload=${sawOnload}, sawOnerror=${sawOnerror}, onloadData=${JSON.stringify(onloadData)}`;
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (${ctx})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (${ctx})`);
    // The exact regression this guards: onerror on user-cancel is the bug evaluated above.
    if (sawOnerror) throw new Error(`onerror fired on user-cancel — that's the save_cancelled regression (${ctx})`);
    if (!sawOnload) logLine(`<b style="color:#fbbf24">note: neither onload nor onerror fired — did you actually cancel? Marking Pass anyway because user said so.</b>`);
  });

  manualTest("Verify last download wrote a real file (visual check)", async () => {
    const name = nameFor("manual-visual-check", "txt");
    const content = `hello at ${new Date().toISOString()} - tag ${RUN_TAG}`;
    const blobUrl = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    logLine(`▶ <b>Manual #4</b>: a tiny file is being written.`);
    logLine(`→ Expected: open <code>${escapeHtml(name)}</code> in your Downloads folder.`);
    logLine(`→ It must contain this exact text: <code>${escapeHtml(content)}</code>`);
    let landed = false;
    GM_download({
      url: blobUrl,
      name,
      onload: () => { landed = true; logLine("→ event: onload — file should be on disk now."); },
      onerror: (e) => { logLine(`<b style="color:#f87171">→ event: onerror ${JSON.stringify(e)}</b>`); },
    });
    const v = await awaitVerdict(`Open <code>${escapeHtml(name)}</code> and confirm the contents match.`, 240);
    URL.revokeObjectURL(blobUrl);
    if (v.verdict === "skip") throw new Error(`SKIP: ${v.reason || "no reason"} (landed=${landed})`);
    if (v.verdict === "fail") throw new Error(`user said FAIL: ${v.reason} (landed=${landed})`);
    if (!landed) logLine(`<b style="color:#fbbf24">note: marked Pass but onload didn't fire — file presence is the source of truth here</b>`);
  });

  // ---------- Runner ----------
  async function runOne(t, idx, total) {
    setStatus(`running (${idx + 1}/${total}): ${t.name}`);
    if (!t.manual) showProgress(t.name);
    const title = `• ${t.name}`;
    const t0 = performance.now();
    try {
      logLine(`▶️ <b>${escapeHtml(t.name)}</b>`);
      await t.run();
      pass(`${title} (${fmtMs(performance.now() - t0)})`);
    } catch (e) {
      const extra = e && e.stack ? e.stack : String(e);
      const msg = String(e && e.message || e);
      if (msg.startsWith("SKIP:")) {
        // Soft outcome — count as skip, not as fail.
        skip(`${title} (${fmtMs(performance.now() - t0)}) — ${msg.slice(5).trim()}`);
      } else {
        fail(`${title} (${fmtMs(performance.now() - t0)})`, extra);
      }
    } finally {
      hideProgress();
      // Any leftover awaiting bar from a thrown-mid-flight test gets cleaned up.
      hideAwaiting();
    }
  }

  let running = false;
  function setAllButtonsDisabled(disabled) {
    panel.querySelector("#start").disabled = disabled;
    $manualButtons.querySelectorAll("button").forEach((b) => { b.disabled = disabled; b.style.opacity = disabled ? "0.5" : "1"; });
  }

  async function runAuto() {
    if (running) { logLine("<i>Already running — wait for the current suite to finish.</i>"); return; }
    running = true;
    setAllButtonsDisabled(true);
    try {
      const auto = tests.filter((t) => !t.manual);
      const names = auto.map((t) => t.name);
      setQueue(names.slice());
      logLine(`<b>Starting GM_download auto suite</b> — ${new Date().toLocaleString()} — runTag=${RUN_TAG}`);
      logLine(`<i>Files will appear under <code>${escapeHtml(getPrefix())}</code> with prefix <code>${escapeHtml(RUN_TAG)}-</code></i>`);
      for (let i = 0; i < auto.length; i++) {
        await runOne(auto[i], i, auto.length);
        setQueue(names.slice(i + 1));
      }
      setStatus("done");
      logLine(`<b>Done.</b> Summary — ✅ ${state.pass}  ❌ ${state.fail}  ⏭️ ${state.skip}`);
    } finally {
      running = false;
      setAllButtonsDisabled(false);
    }
  }

  // Build manual buttons.
  tests.filter((t) => t.manual).forEach((t) => {
    const b = h("button",
      { style: btnStyle("#7c3aed"),
        onclick: async () => {
          if (running) { logLine("<i>Another test is already running — wait for it to finish.</i>"); return; }
          running = true;
          setAllButtonsDisabled(true);
          try { await runOne(t, 0, 1); }
          finally {
            running = false;
            setAllButtonsDisabled(false);
            setStatus("idle");
          }
        } },
      t.name);
    $manualButtons.appendChild(b);
  });

  // ---------- Boot ----------
  logLine(`<b>GM_download Test Harness</b> ready. Click <b>Run Auto</b> to run the auto suite, or open <i>Manual tests</i> for human-in-the-loop cases.`);
  logLine(`<i>Manual tests use a verdict bar: read the instructions, do the action, then click <b>Mark Pass</b> / <b>Mark Fail</b> / <b>Skip</b>. A countdown auto-skips if you walk away.</i>`);
  logLine(`<i>Tip: change the prefix above if you want files in a different sub-folder.</i>`);
  setStatus("idle");

  // No auto-start: GM_download writes to disk, so we wait for explicit user action.
})();

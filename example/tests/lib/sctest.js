/**
 * sctest — ScriptCat example/tests 共用测试框架
 * 零依赖、零构建,供用户脚本 @require 使用。
 */
(function (global) {
  "use strict";

  var STATUS = { PASS: "pass", FAIL: "fail", SKIP: "skip", MANUAL: "manual" };

  // GM_info.script 不含 background/crontab 字段(见 src/app/service/content/gm_api/gm_info.ts),
  // 只能从 metadata 原文判断运行上下文。
  function detectContext(metaStr) {
    var meta = metaStr || "";
    if (/^\/\/\s*@crontab\s+\S/m.test(meta)) return "crontab";
    if (/^\/\/\s*@background\s*$/m.test(meta)) return "background";
    if (typeof document === "undefined") return "background";
    return "page";
  }

  function currentMetaStr() {
    try {
      if (typeof GM_info !== "undefined" && GM_info) return GM_info.scriptMetaStr || "";
    } catch (e) {
      /* GM_info 未授权时忽略 */
    }
    return "";
  }

  function stringify(value) {
    if (typeof value === "function") return "[Function " + (value.name || "anonymous") + "]";
    try {
      var out = JSON.stringify(value);
      return out === undefined ? String(value) : out;
    } catch (e) {
      return String(value);
    }
  }

  function AssertionError(message, expected, actual) {
    var err = new Error(message);
    err.name = "AssertionError";
    err.expected = expected;
    err.actual = actual;
    return err;
  }

  // 结构化深比较。刻意不同于部分用户脚本里基于 JSON.stringify 的 assertDeepEq:
  // NaN 与自身相等、值为 undefined 的键与缺失的键不同、对象键顺序不影响比较结果。
  // 通过 seen 记录比较路径中的 (a,b) 组合来避免循环引用导致的栈溢出,
  // 但不做真正的循环感知等价判断——只是让循环结构比较能有限终止,而非精确语义。
  function deepEqual(a, b, seen) {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

    var aIsArray = Array.isArray(a);
    var bIsArray = Array.isArray(b);
    if (aIsArray !== bIsArray) return false;

    seen = seen || [];
    for (var s = 0; s < seen.length; s++) {
      if (seen[s][0] === a && seen[s][1] === b) return true;
    }
    seen.push([a, b]);

    if (aIsArray) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i], seen)) return false;
      }
      return true;
    }

    var aKeys = Object.keys(a);
    var bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (var k = 0; k < aKeys.length; k++) {
      var key = aKeys[k];
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key], seen)) return false;
    }
    return true;
  }

  function makeExpect() {
    return function expect(actual) {
      return {
        toBe: function (expected) {
          if (actual !== expected) {
            throw AssertionError(
              "期望 " + stringify(expected) + ",实际 " + stringify(actual),
              stringify(expected),
              stringify(actual)
            );
          }
        },
        toEqual: function (expected) {
          if (!deepEqual(actual, expected)) {
            var b = stringify(expected);
            var a = stringify(actual);
            throw AssertionError("期望 " + b + ",实际 " + a, b, a);
          }
        },
        toBeTruthy: function () {
          if (!actual) throw AssertionError("期望为真值,实际 " + stringify(actual), "truthy", stringify(actual));
        },
        toBeTypeOf: function (expected) {
          var t = typeof actual;
          if (t !== expected) throw AssertionError("期望类型 " + expected + ",实际 " + t, expected, t);
        },
        toMatch: function (pattern) {
          var text = String(actual);
          var ok = pattern instanceof RegExp ? pattern.test(text) : text.indexOf(String(pattern)) !== -1;
          if (!ok) {
            throw AssertionError("期望匹配 " + String(pattern) + ",实际 " + stringify(text), String(pattern), text);
          }
        },
        toThrow: function (pattern) {
          if (typeof actual !== "function") {
            throw AssertionError("toThrow 的被测目标必须是函数,实际 " + typeof actual, "function", typeof actual);
          }
          var thrown = null;
          try {
            actual();
          } catch (e) {
            thrown = e;
          }
          if (!thrown) throw AssertionError("期望抛出异常,实际未抛出", "throw", "no throw");
          if (pattern) {
            var msg = String((thrown && thrown.message) || thrown);
            var ok = pattern instanceof RegExp ? pattern.test(msg) : msg.indexOf(String(pattern)) !== -1;
            if (!ok) {
              throw AssertionError("期望异常匹配 " + String(pattern) + ",实际 " + msg, String(pattern), msg);
            }
          }
        },
      };
    };
  }

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function create(options) {
    var opts = options || {};
    var runName = opts.name || "未命名测试";
    var context = opts.context || detectContext(currentMetaStr());
    var suites = [];
    var currentSuite = null;

    function describe(name, optsOrFn, maybeFn) {
      var suiteOpts = typeof optsOrFn === "function" ? {} : optsOrFn || {};
      var fn = typeof optsOrFn === "function" ? optsOrFn : maybeFn;
      var suite = {
        name: name,
        auto: suiteOpts.auto !== false,
        params: suiteOpts.params || {},
        cases: [],
      };
      suites.push(suite);
      currentSuite = suite;
      try {
        fn();
      } finally {
        currentSuite = null;
      }
    }

    function pushCase(name, fn, kind, hint) {
      if (!currentSuite) throw new Error("it/itManual 必须写在 describe 内部:" + name);
      currentSuite.cases.push({
        name: name,
        suite: currentSuite.name,
        fn: fn,
        kind: kind,
        hint: hint || "",
        status: null,
        durationMs: 0,
        error: null,
        expected: null,
        actual: null,
      });
    }

    function it(name, fn) {
      pushCase(name, fn, "auto", "");
    }

    function itManual(name, manualOpts) {
      pushCase(name, null, "manual", (manualOpts || {}).hint);
    }

    function toResult(c) {
      return {
        name: c.name,
        suite: c.suite,
        status: c.status,
        durationMs: c.durationMs,
        error: c.error,
        expected: c.expected,
        actual: c.actual,
        hint: c.hint,
      };
    }

    async function runCase(c, reporters) {
      if (c.kind === "manual") {
        c.status = STATUS.MANUAL;
      } else {
        var started = now();
        try {
          await c.fn();
          c.status = STATUS.PASS;
        } catch (e) {
          c.status = STATUS.FAIL;
          c.error = String((e && e.message) || e);
          c.expected = (e && e.expected) || null;
          c.actual = (e && e.actual) || null;
        }
        c.durationMs = Math.round(now() - started);
      }
      var result = toResult(c);
      reporters.forEach(function (r) {
        if (r.onCase) r.onCase(result);
      });
      return result;
    }

    function buildSummary(startedAt) {
      var total = 0;
      var passed = 0;
      var failed = 0;
      var skipped = 0;
      var outSuites = suites.map(function (s) {
        return {
          name: s.name,
          auto: s.auto,
          params: s.params,
          cases: s.cases.map(function (c) {
            total++;
            if (c.status === STATUS.PASS) passed++;
            else if (c.status === STATUS.FAIL) failed++;
            else skipped++;
            return toResult(c);
          }),
        };
      });
      return {
        name: runName,
        context: context,
        total: total,
        passed: passed,
        failed: failed,
        skipped: skipped,
        durationMs: Math.round(now() - startedAt),
        suites: outSuites,
      };
    }

    async function run() {
      var reporters = global.SCTest.__buildReporters(opts, context, { suites: suites, name: runName });
      var startedAt = now();
      reporters.forEach(function (r) {
        if (r.onStart) r.onStart({ name: runName, context: context, suites: suites });
      });

      for (var i = 0; i < suites.length; i++) {
        var suite = suites[i];
        for (var j = 0; j < suite.cases.length; j++) {
          var c = suite.cases[j];
          if (!suite.auto && c.kind !== "manual") {
            c.status = STATUS.SKIP;
            var skippedResult = toResult(c);
            reporters.forEach(function (r) {
              if (r.onCase) r.onCase(skippedResult);
            });
            continue;
          }
          await runCase(c, reporters);
        }
      }

      var summary = buildSummary(startedAt);
      reporters.forEach(function (r) {
        if (r.onEnd) r.onEnd(summary);
      });
      return summary;
    }

    return { describe: describe, it: it, itManual: itManual, expect: makeExpect(), run: run };
  }

  // ---------- ConsoleReporter ----------
  function createConsoleReporter() {
    var lastSuite = null;
    return {
      onStart: function (info) {
        console.log("%c=== " + info.name + " 测试开始 (" + info.context + ") ===", "color: blue; font-weight: bold;");
      },
      onCase: function (c) {
        if (c.suite !== lastSuite) {
          lastSuite = c.suite;
          console.log("\n%c--- " + c.suite + " ---", "color: orange; font-weight: bold;");
        }
        if (c.status === STATUS.PASS) {
          console.log("%c✓ " + c.name + " (" + c.durationMs + "ms)", "color: green;");
        } else if (c.status === STATUS.FAIL) {
          console.error("%c✗ " + c.name, "color: red;", c.error);
        } else if (c.status === STATUS.MANUAL) {
          var hintSuffix = c.hint ? ":" + c.hint : "";
          console.log("%c○ " + c.name + " (待人工确认" + hintSuffix + ")", "color: #999;");
        } else {
          console.log("%c○ " + c.name + " (跳过)", "color: #999;");
        }
      },
      onEnd: function (summary) {
        console.log("\n%c=== 测试完成 ===", "color: blue; font-weight: bold;");
        console.log("总测试数: " + summary.total);
        console.log("%c通过: " + summary.passed, "color: green; font-weight: bold;");
        console.log("%c失败: " + summary.failed, "color: red; font-weight: bold;");
        console.log("跳过: " + summary.skipped + " (" + summary.durationMs + "ms)");
      },
    };
  }

  // ---------- PanelReporter ----------
  var PANEL_CSS = [
    ":host{all:initial}",
    ".sc-panel{position:fixed;right:16px;bottom:16px;width:440px;max-height:80vh;display:flex;",
    "flex-direction:column;overflow:hidden;border-radius:12px;border:1px solid var(--sc-border);",
    "background:var(--sc-card);color:var(--sc-fg);font-family:Inter,system-ui,sans-serif;font-size:12px;",
    "box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:2147483647}",
    ".sc-panel[data-min='1'] .sc-body,.sc-panel[data-min='1'] .sc-sum,",
    ".sc-panel[data-min='1'] .sc-bar,.sc-panel[data-min='1'] .sc-foot{display:none}",
    ".sc-head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--sc-border)}",
    ".sc-title{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".sc-meta{font-size:11px;color:var(--sc-muted);font-weight:400}",
    ".sc-btn{cursor:pointer;border:1px solid var(--sc-border);background:var(--sc-card);color:var(--sc-fg);",
    "border-radius:6px;padding:4px 9px;font-size:11px;font-family:inherit}",
    ".sc-btn-primary{background:var(--sc-primary);border-color:var(--sc-primary);color:#fff}",
    ".sc-sum{padding:12px 14px;border-bottom:1px solid var(--sc-border);background:var(--sc-bg);",
    "display:flex;flex-direction:column;gap:10px}",
    ".sc-chips{display:flex;gap:6px;align-items:center;flex-wrap:wrap}",
    ".sc-chip{border-radius:9999px;padding:3px 9px;font-size:11px;font-weight:500}",
    ".sc-chip-pass{background:var(--sc-success-bg);color:var(--sc-success-fg)}",
    ".sc-chip-fail{background:var(--sc-destructive-bg);color:var(--sc-destructive-fg)}",
    ".sc-chip-skip{background:var(--sc-muted-bg);color:var(--sc-muted)}",
    ".sc-progress{height:6px;border-radius:9999px;background:var(--sc-muted-bg);overflow:hidden;display:flex}",
    ".sc-progress i{display:block;height:6px}",
    ".sc-body{overflow:auto;flex:1}",
    ".sc-suite{display:flex;align-items:center;gap:7px;padding:7px 14px;background:var(--sc-bg);",
    "border-top:1px solid var(--sc-border);font-weight:600;cursor:pointer}",
    ".sc-suite span{flex:1}",
    ".sc-case{display:flex;align-items:center;gap:8px;padding:6px 14px 6px 34px}",
    ".sc-case span{flex:1}",
    ".sc-case-manual{background:var(--sc-warning-bg)}",
    ".sc-dur{font-size:11px;color:var(--sc-muted)}",
    ".sc-detail{margin:0 14px 8px 34px;padding:8px 10px;border-radius:6px;border-left:2px solid var(--sc-destructive);",
    "background:var(--sc-destructive-bg);color:var(--sc-destructive-fg);font-family:'JetBrains Mono',monospace;",
    "font-size:11px;white-space:pre-wrap}",
    ".sc-hint{margin:0 14px 8px 34px;padding:7px 10px;border-radius:6px;background:var(--sc-muted-bg);",
    "color:var(--sc-muted);font-size:11px}",
    ".sc-params{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--sc-border)}",
    ".sc-params input{flex:1;border:1px solid var(--sc-border);border-radius:6px;padding:3px 8px;",
    "background:var(--sc-card);color:var(--sc-fg);font-family:'JetBrains Mono',monospace;font-size:11px}",
    ".sc-foot{display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid var(--sc-border);",
    "background:var(--sc-bg)}",
    ".sc-foot .sc-sumline{flex:1;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--sc-muted)}",
    ":host{--sc-bg:#fafafa;--sc-card:#fff;--sc-fg:#1a1a1a;--sc-muted:#767676;--sc-muted-bg:#f0f0f0;",
    "--sc-border:#e5e5e5;--sc-primary:#1296db;--sc-success-fg:#0c8833;--sc-success-bg:#e8f9ec;",
    "--sc-destructive:#e7000b;--sc-destructive-fg:#c10007;--sc-destructive-bg:#fdecec;",
    "--sc-warning-bg:#fff4e6}",
    "@media (prefers-color-scheme: dark){:host{--sc-bg:#1e1e1e;--sc-card:#151515;--sc-fg:#e5e5e5;",
    "--sc-muted:#8a8a8a;--sc-muted-bg:#2a2a2a;--sc-border:#2a2a2a;--sc-primary:#3aacef;",
    "--sc-success-fg:#6fdd8a;--sc-success-bg:#1e3520;--sc-destructive:#ff6669;",
    "--sc-destructive-fg:#ff9a9a;--sc-destructive-bg:#3a1a1c;--sc-warning-bg:#352c1e}}",
  ].join("");

  var ICONS = { pass: "✓", fail: "✗", skip: "○", manual: "✋" };

  function createPanelReporter(runInfo) {
    if (typeof document === "undefined" || !document.documentElement) return null;

    var host = document.getElementById("sctest-panel-host");
    if (host) host.remove();
    host = document.createElement("div");
    host.id = "sctest-panel-host";
    document.documentElement.appendChild(host);

    var root = host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent = PANEL_CSS;
    root.appendChild(style);

    var panel = document.createElement("div");
    panel.className = "sc-panel";
    root.appendChild(panel);

    var state = { pass: 0, fail: 0, skip: 0, total: 0, manualOverrides: {} };
    var caseNodes = {};
    var suiteNodes = {};

    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }

    // 头部
    var head = el("div", "sc-head");
    var title = el("div", "sc-title", runInfo.name);
    var meta = el("div", "sc-meta", runInfo.context);
    title.appendChild(meta);
    head.appendChild(title);
    var minBtn = el("button", "sc-btn", "—");
    minBtn.addEventListener("click", function () {
      panel.dataset.min = panel.dataset.min === "1" ? "0" : "1";
    });
    head.appendChild(minBtn);
    var closeBtn = el("button", "sc-btn", "×");
    closeBtn.addEventListener("click", function () {
      host.remove();
    });
    head.appendChild(closeBtn);
    panel.appendChild(head);

    // 概览
    var sum = el("div", "sc-sum");
    var chips = el("div", "sc-chips");
    var chipPass = el("span", "sc-chip sc-chip-pass", "通过 0");
    var chipFail = el("span", "sc-chip sc-chip-fail", "失败 0");
    var chipSkip = el("span", "sc-chip sc-chip-skip", "跳过 0");
    chips.appendChild(chipPass);
    chips.appendChild(chipFail);
    chips.appendChild(chipSkip);
    var progress = el("div", "sc-progress");
    var barPass = el("i");
    barPass.style.background = "#34c759";
    var barFail = el("i");
    barFail.style.background = "#e7000b";
    progress.appendChild(barPass);
    progress.appendChild(barFail);
    sum.appendChild(chips);
    sum.appendChild(progress);
    panel.appendChild(sum);

    // 手动 suite 的运行控制与参数
    var manualSuites = (runInfo.suites || []).filter(function (s) {
      return !s.auto;
    });
    // 每个 auto:false 的 suite 各一个运行按钮 —— 见 gm_download_test.js:1083,
    // 手动用例必须能与自动批次分开触发。
    manualSuites.forEach(function (s) {
      var ctl = el("div", "sc-params");
      var runBtn = el("button", "sc-btn sc-btn-primary", "运行 " + s.name);
      runBtn.setAttribute("data-sctest", "run-all");
      runBtn.setAttribute("data-sctest-suite", s.name);
      ctl.appendChild(runBtn);
      Object.keys(s.params).forEach(function (key) {
        var input = document.createElement("input");
        input.value = s.params[key];
        input.setAttribute("data-sctest", "param-" + key);
        input.addEventListener("input", function () {
          s.params[key] = input.value;
        });
        ctl.appendChild(el("span", null, key));
        ctl.appendChild(input);
      });
      runBtn.addEventListener("click", function () {
        runBtn.disabled = true;
        if (typeof runInfo.onRunManual === "function") runInfo.onRunManual(s.name);
      });
      panel.appendChild(ctl);
    });

    var body = el("div", "sc-body");
    panel.appendChild(body);

    var foot = el("div", "sc-foot");
    var sumLine = el("div", "sc-sumline", "");
    sumLine.setAttribute("data-sctest", "summary-line");
    foot.appendChild(sumLine);
    var copyBtn = el("button", "sc-btn", "复制报告");
    copyBtn.addEventListener("click", function () {
      var text = sumLine.textContent + "\n" + JSON.stringify(state, null, 2);
      if (navigator.clipboard) navigator.clipboard.writeText(text);
    });
    foot.appendChild(copyBtn);
    panel.appendChild(foot);

    function recount() {
      chipPass.textContent = "通过 " + state.pass;
      chipFail.textContent = "失败 " + state.fail;
      chipSkip.textContent = "跳过 " + state.skip;
      var total = state.total || 1;
      barPass.style.width = (state.pass / total) * 100 + "%";
      barFail.style.width = (state.fail / total) * 100 + "%";
      sumLine.textContent =
        "总测试数: " + state.total + "  通过: " + state.pass + "  失败: " + state.fail + "  跳过: " + state.skip;
    }

    function ensureSuite(name) {
      if (suiteNodes[name]) return suiteNodes[name];
      var row = el("div", "sc-suite");
      row.setAttribute("data-sctest", "suite-row");
      var label = el("span", null, name);
      var stat = el("span", "sc-dur", "");
      row.appendChild(label);
      row.appendChild(stat);
      body.appendChild(row);
      var group = el("div");
      body.appendChild(group);
      row.addEventListener("click", function () {
        group.style.display = group.style.display === "none" ? "" : "none";
      });
      suiteNodes[name] = { group: group, stat: stat, pass: 0, total: 0 };
      return suiteNodes[name];
    }

    function applyStatus(c, node) {
      node.icon.textContent = ICONS[c.status] || "○";
      node.dur.textContent = c.status === "manual" ? "人工" : c.durationMs + "ms";
    }

    return {
      panelRoot: root,
      onStart: function () {
        state.total = (runInfo.suites || []).reduce(function (n, s) {
          return n + s.cases.length;
        }, 0);
        recount();
      },
      onCase: function (c) {
        var suite = ensureSuite(c.suite);
        var row = el("div", "sc-case" + (c.status === "manual" ? " sc-case-manual" : ""));
        row.setAttribute("data-sctest", "case-row");
        var icon = el("b", null, ICONS[c.status] || "○");
        var label = el("span", null, c.name);
        var dur = el("i", "sc-dur", c.status === "manual" ? "人工" : c.durationMs + "ms");
        row.appendChild(icon);
        row.appendChild(label);
        row.appendChild(dur);
        suite.group.appendChild(row);
        caseNodes[c.suite + "//" + c.name] = { row: row, icon: icon, dur: dur };

        if (c.status === "fail") {
          state.fail++;
          var detail = el(
            "div",
            "sc-detail",
            "期望  " + (c.expected == null ? "-" : c.expected) + "\n实际  " + (c.actual == null ? "-" : c.actual) + "\n" + c.error
          );
          detail.setAttribute("data-sctest", "failure-detail");
          suite.group.appendChild(detail);
        } else if (c.status === "pass") {
          state.pass++;
        } else {
          state.skip++;
        }

        if (c.status === "manual") {
          var pass = el("button", "sc-btn", "✓");
          pass.setAttribute("data-sctest", "manual-pass");
          var fail = el("button", "sc-btn", "✗");
          fail.setAttribute("data-sctest", "manual-fail");
          function settle(ok) {
            state.skip--;
            if (ok) state.pass++;
            else state.fail++;
            state.manualOverrides[c.suite + "//" + c.name] = ok ? "pass" : "fail";
            icon.textContent = ok ? ICONS.pass : ICONS.fail;
            pass.remove();
            fail.remove();
            recount();
          }
          pass.addEventListener("click", function () {
            settle(true);
          });
          fail.addEventListener("click", function () {
            settle(false);
          });
          row.appendChild(pass);
          row.appendChild(fail);
          if (c.hint) suite.group.appendChild(el("div", "sc-hint", c.hint));
        }

        applyStatus(c, caseNodes[c.suite + "//" + c.name]);
        recount();
      },
      onEnd: function (summary) {
        state.total = summary.total;
        recount();
      },
    };
  }

  function buildReporters(opts, context, runInfo) {
    var mode = opts.reporter || "auto";
    var reporters = [createConsoleReporter()];
    if (mode === "console") return reporters;

    var wantPanel = mode === "panel" || (mode === "auto" && context === "page");
    var wantLog = mode === "log" || (mode === "auto" && context !== "page");

    if (wantPanel) {
      var panel = createPanelReporter(runInfo);
      if (panel) reporters.push(panel);
      else wantLog = true;
    }
    if (wantLog) reporters.push(createLogReporter());
    return reporters;
  }

  function createLogReporter() {
    return { onStart: function () {}, onCase: function () {}, onEnd: function () {} };
  }

  var api = {
    create: create,
    __detectContext: detectContext,
    __buildReporters: buildReporters,
    __createConsoleReporter: createConsoleReporter,
    __createPanelReporter: createPanelReporter,
    STATUS: STATUS,
  };

  global.SCTest = api;
})(typeof window !== "undefined" ? window : globalThis);

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

  // 用例体内主动跳过的信号。用独立类型而不是约定 message 前缀,是因为前缀嗅探会把
  // 消息碰巧同名的真实错误一并吞成跳过。
  function SkipSignal(reason) {
    this.reason = reason || "";
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
  // 已知限制: Date/RegExp/Map/Set 按普通对象比较(自有可枚举键为空), 因此两个不同的 Date
  // 会被判为相等。当前所有迁移用例的 toEqual 只比较纯对象/数组/基元, 未触及这些类型。
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
          if (e instanceof SkipSignal) {
            c.status = STATUS.SKIP;
            c.error = e.reason;
          } else {
            c.status = STATUS.FAIL;
            c.error = String((e && e.message) || e);
            c.expected = (e && e.expected) || null;
            c.actual = (e && e.actual) || null;
          }
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

    async function rerunSuites(reporters, onlySuiteName, includeAutoSuites) {
      var startedAt = now();
      for (var i = 0; i < suites.length; i++) {
        var suite = suites[i];
        if (!includeAutoSuites && suite.auto) continue;
        if (onlySuiteName && suite.name !== onlySuiteName) continue;
        for (var j = 0; j < suite.cases.length; j++) {
          var c = suite.cases[j];
          if (c.kind === "manual") continue;
          c.status = null;
          c.error = null;
          await runCase(c, reporters);
        }
      }
      // 手动 suite 的用例在 run() 主流程里只被标记为 skip，真实结果只在这里产生，
      // 所以必须重新发一次 onEnd —— 否则 ConsoleReporter 的三行汇总（e2e 的解析契约）
      // 和 LogReporter 的汇总日志对全部 auto:false 的文件永远不会出现。
      var summary = buildSummary(startedAt);
      reporters.forEach(function (r) {
        if (r.onEnd) r.onEnd(summary);
      });
      return summary;
    }

    async function run() {
      var runInfo = { name: runName, context: context, suites: suites, onRunManual: null };
      var reporters = global.SCTest.__buildReporters(opts, context, runInfo);
      runInfo.onRunManual = function (suiteName) {
        return rerunSuites(reporters, suiteName, false);
      };
      runInfo.onRerun = function () {
        return rerunSuites(reporters, null, true);
      };
      var startedAt = now();
      reporters.forEach(function (r) {
        if (r.onStart) r.onStart(runInfo);
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
          console.log("%c○ " + c.name + " (跳过" + (c.error ? ": " + c.error : "") + ")", "color: #999;");
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
    "[hidden]{display:none!important}",
    ".sc-panel[data-min='1'] .sc-body,.sc-panel[data-min='1'] .sc-sum,",
    ".sc-panel[data-min='1'] .sc-bar,.sc-panel[data-min='1'] .sc-foot{display:none}",
    ".sc-head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--sc-border)}",
    ".sc-grip{color:var(--sc-muted);font-size:14px;cursor:move;user-select:none}",
    ".sc-title-wrap{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}",
    ".sc-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".sc-meta{font-size:11px;color:var(--sc-muted);font-weight:400}",
    ".sc-btn{display:inline-flex;cursor:pointer;align-items:center;justify-content:center;gap:5px;border:1px solid var(--sc-border);background:var(--sc-card);color:var(--sc-fg);",
    "border-radius:6px;padding:4px 9px;font-size:11px;font-family:inherit}",
    ".sc-icon-btn{display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;border:0;padding:0}",
    ".sc-btn:disabled{cursor:wait;opacity:.55}",
    ".sc-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;line-height:0}",
    ".sc-btn-primary{background:var(--sc-primary);border-color:var(--sc-primary);color:#fff}",
    ".sc-sum{padding:12px 14px;border-bottom:1px solid var(--sc-border);background:var(--sc-bg);",
    "display:flex;flex-direction:column;gap:10px}",
    ".sc-chips{display:flex;gap:6px;align-items:center;flex-wrap:wrap}",
    ".sc-status-row,.sc-run-row,.sc-toolbar{display:flex;align-items:center;gap:8px}",
    ".sc-spacer{flex:1}",
    ".sc-status{display:inline-flex;align-items:center;gap:5px;border-radius:9999px;padding:3px 10px;font-weight:600}",
    ".sc-status-pass{background:var(--sc-success-bg);color:var(--sc-success-fg)}",
    ".sc-status-fail{background:var(--sc-destructive-bg);color:var(--sc-destructive-fg)}",
    ".sc-chip{display:inline-flex;align-items:center;gap:4px;border-radius:9999px;padding:3px 9px;font-size:11px;font-weight:500}",
    ".sc-chip-pass{background:var(--sc-success-bg);color:var(--sc-success-fg)}",
    ".sc-chip-fail{background:var(--sc-destructive-bg);color:var(--sc-destructive-fg)}",
    ".sc-chip-skip{background:var(--sc-muted-bg);color:var(--sc-muted)}",
    ".sc-progress{height:6px;border-radius:9999px;background:var(--sc-muted-bg);overflow:hidden;display:flex}",
    ".sc-progress i{display:block;height:6px}",
    ".sc-toolbar{padding:8px 14px;border-bottom:1px solid var(--sc-border)}",
    ".sc-segments{display:flex;gap:2px;padding:2px;border-radius:6px;background:var(--sc-muted-bg)}",
    ".sc-segment{cursor:pointer;border:0;border-radius:4px;padding:3px 10px;background:transparent;color:var(--sc-muted);font:inherit;font-size:11px}",
    ".sc-segment[data-active='1']{background:var(--sc-card);color:var(--sc-fg);font-weight:600}",
    ".sc-search{display:flex;min-width:0;flex:1;align-items:center;gap:6px;border:1px solid var(--sc-border);border-radius:6px;padding:4px 8px;background:var(--sc-card);color:var(--sc-muted)}",
    ".sc-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--sc-fg);font:inherit;font-size:11px}",
    ".sc-body{overflow:auto;flex:1}",
    ".sc-suite{display:flex;align-items:center;gap:7px;padding:7px 14px;background:var(--sc-bg);",
    "border-top:1px solid var(--sc-border);font-weight:600;cursor:pointer}",
    ".sc-suite .sc-suite-name{flex:1}",
    ".sc-suite-stat{border-radius:9999px;padding:2px 8px;background:var(--sc-success-bg);color:var(--sc-success-fg);font-size:11px;font-weight:500}",
    ".sc-suite-stat[data-failed='1']{background:var(--sc-destructive-bg);color:var(--sc-destructive-fg)}",
    ".sc-suite-stat[data-manual='1']{display:inline-flex;align-items:center;gap:4px;background:var(--sc-warning-bg);color:var(--sc-warning-fg)}",
    ".sc-case{display:flex;align-items:center;gap:8px;padding:6px 14px 6px 34px}",
    ".sc-case span{flex:1}",
    ".sc-case-manual{background:var(--sc-warning-bg)}",
    ".sc-manual-pass{width:22px;height:22px;padding:0;border-color:var(--sc-success-fg);background:var(--sc-success-bg);color:var(--sc-success-fg)}",
    ".sc-manual-fail{width:22px;height:22px;padding:0;border-color:var(--sc-destructive-fg);background:var(--sc-destructive-bg);color:var(--sc-destructive-fg)}",
    ".sc-dur{font-size:11px;color:var(--sc-muted)}",
    ".sc-detail{margin:0 14px 8px 34px;padding:8px 10px;border-radius:6px;border-left:2px solid var(--sc-destructive);",
    "background:var(--sc-destructive-bg);color:var(--sc-destructive-fg);font-family:'JetBrains Mono',monospace;",
    "font-size:11px;white-space:pre-wrap}",
    ".sc-hint{display:flex;gap:6px;margin:0 14px 8px 34px;padding:7px 10px;border-radius:6px;background:var(--sc-muted-bg);",
    "color:var(--sc-muted);font-size:11px}",
    ".sc-params{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--sc-border)}",
    ".sc-params-label{font-weight:600}",
    ".sc-field{display:flex;min-width:0;flex:1;align-items:center;gap:6px;color:var(--sc-muted);white-space:nowrap}",
    ".sc-field-compact{flex:0 0 108px}",
    ".sc-params input{min-width:0;flex:1;border:1px solid var(--sc-border);border-radius:6px;padding:3px 8px;",
    "background:var(--sc-card);color:var(--sc-fg);font-family:'JetBrains Mono',monospace;font-size:11px}",
    ".sc-foot{display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid var(--sc-border);",
    "background:var(--sc-bg)}",
    ".sc-foot .sc-sumline{flex:1;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--sc-muted)}",
    "@media (max-width:520px){.sc-panel{right:8px;bottom:8px;width:calc(100vw - 16px);max-height:calc(100vh - 16px)}.sc-toolbar{flex-wrap:wrap}.sc-search{flex-basis:100%}}",
    ":host{--sc-bg:#fafafa;--sc-card:#fff;--sc-fg:#1a1a1a;--sc-muted:#767676;--sc-muted-bg:#f0f0f0;",
    "--sc-border:#e5e5e5;--sc-primary:#1296db;--sc-success:#34c759;--sc-success-fg:#0c8833;--sc-success-bg:#e8f9ec;",
    "--sc-destructive:#e7000b;--sc-destructive-fg:#c10007;--sc-destructive-bg:#fdecec;",
    "--sc-warning-bg:#fff4e6;--sc-warning-fg:#c46c00}",
    "@media (prefers-color-scheme: dark){:host{--sc-bg:#1e1e1e;--sc-card:#151515;--sc-fg:#e5e5e5;",
    "--sc-muted:#8a8a8a;--sc-muted-bg:#2a2a2a;--sc-border:#2a2a2a;--sc-primary:#3aacef;",
    "--sc-success-fg:#6fdd8a;--sc-success-bg:#1e3520;--sc-destructive:#ff6669;",
    "--sc-destructive-fg:#ff9a9a;--sc-destructive-bg:#3a1a1c;--sc-warning-bg:#352c1e;--sc-warning-fg:#ffb84d}}",
  ].join("");

  // Constructable stylesheet 通过 CSSOM 安装到 Shadow Root，不属于页面的 inline <style>，
  // 因而不会被宿主页的 style-src 拒绝。旧浏览器才回退到普通 style 元素。
  function installPanelStyles(root, css) {
    if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in root) {
      var sheet = new CSSStyleSheet();
      if (typeof sheet.replaceSync === "function") {
        sheet.replaceSync(css);
        root.adoptedStyleSheets = root.adoptedStyleSheets.concat(sheet);
        return;
      }
    }
    var style = document.createElement("style");
    style.textContent = css;
    root.appendChild(style);
  }

  var ICONS = { pass: "✓", fail: "✗", skip: "○", manual: "✋" };

  function createPanelReporter(runInfo) {
    if (typeof document === "undefined" || !document.documentElement) return null;

    var host = document.getElementById("sctest-panel-host");
    if (host) host.remove();
    host = document.createElement("div");
    host.id = "sctest-panel-host";
    document.documentElement.appendChild(host);

    var root = host.attachShadow({ mode: "open" });
    installPanelStyles(root, PANEL_CSS);

    var panel = document.createElement("div");
    panel.className = "sc-panel";
    root.appendChild(panel);

    var state = { pass: 0, fail: 0, skip: 0, total: 0, durationMs: 0, manualOverrides: {} };
    var caseNodes = {};
    var suiteNodes = {};
    var activeFilter = "all";

    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }

    var ICON_PATHS = {
      "grip-vertical": "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
      "rotate-cw": "M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5",
      minus: "M5 12h14",
      x: "M18 6 6 18M6 6l12 12",
      "circle-x": "M15 9l-6 6M9 9l6 6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
      timer: "M10 2h4M12 14v-4M4 13a8 8 0 1 0 8-8 8.7 8.7 0 0 0-3 .6L7 3",
      check: "m20 6-11 11-5-5",
      hash: "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
      play: "m6 3 14 9-14 9Z",
      "rotate-ccw": "M3 12a9 9 0 1 0 2.64-6.36L3 8M3 3v5h5",
      "list-todo": "M3 5h.01M8 5h13M3 12h.01M8 12h13M3 19h.01M8 19h13",
      search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
      copy: "M8 8h11v11H8zM5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1",
      "chevrons-down-up": "m7 20 5-5 5 5M7 4l5 5 5-5",
      "sliders-horizontal": "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4",
      "chevron-down": "m6 9 6 6 6-6",
      "chevron-right": "m9 18 6-6-6-6",
      hand: "M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v7M10 10V5a2 2 0 0 0-4 0v9l-2-2a2 2 0 0 0-3 3l5 5a5 5 0 0 0 4 2h3a7 7 0 0 0 7-7v-3a2 2 0 0 0-4 0v-1",
      info: "M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
      "clipboard-copy": "M9 5h6M9 3h6v4H9zM15 11h5v5M20 11l-7 7M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2M16 3h2a2 2 0 0 1 2 2v3",
      braces: "M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1",
    };

    var ICON_NODES = {
      "grip-vertical": [
        ["circle", { cx: 9, cy: 12, r: 1 }],
        ["circle", { cx: 9, cy: 5, r: 1 }],
        ["circle", { cx: 9, cy: 19, r: 1 }],
        ["circle", { cx: 15, cy: 12, r: 1 }],
        ["circle", { cx: 15, cy: 5, r: 1 }],
        ["circle", { cx: 15, cy: 19, r: 1 }],
      ],
      play: [["path", { d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" }]],
      "rotate-ccw": [
        ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
        ["path", { d: "M3 3v5h5" }],
      ],
      timer: [
        ["line", { x1: 10, x2: 14, y1: 2, y2: 2 }],
        ["line", { x1: 12, x2: 15, y1: 14, y2: 11 }],
        ["circle", { cx: 12, cy: 14, r: 8 }],
      ],
      copy: [
        ["rect", { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }],
        ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }],
      ],
      "clipboard-copy": [
        ["rect", { width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 }],
        ["path", { d: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" }],
        ["path", { d: "M16 4h2a2 2 0 0 1 2 2v4" }],
        ["path", { d: "M21 14H11" }],
        ["path", { d: "m15 10-4 4 4 4" }],
      ],
      braces: [
        ["path", { d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" }],
        ["path", { d: "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" }],
      ],
      "circle-x": [
        ["circle", { cx: 12, cy: 12, r: 10 }],
        ["path", { d: "m15 9-6 6" }],
        ["path", { d: "m9 9 6 6" }],
      ],
    };

    function icon(name, size) {
      var wrap = el("span", "sc-icon");
      wrap.setAttribute("data-icon", name);
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", size || 13);
      svg.setAttribute("height", size || 13);
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      var nodes = ICON_NODES[name] || [["path", { d: ICON_PATHS[name] }]];
      nodes.forEach(function (definition) {
        var node = document.createElementNS("http://www.w3.org/2000/svg", definition[0]);
        Object.keys(definition[1]).forEach(function (attribute) {
          node.setAttribute(attribute, definition[1][attribute]);
        });
        svg.appendChild(node);
      });
      wrap.appendChild(svg);
      return wrap;
    }

    function setIconLabel(node, iconName, text, size) {
      node.textContent = "";
      node.appendChild(icon(iconName, size));
      node.appendChild(document.createTextNode(text));
    }

    // 头部
    var head = el("div", "sc-head");
    var grip = icon("grip-vertical", 14);
    grip.classList.add("sc-grip");
    grip.setAttribute("data-sctest", "drag-handle");
    head.appendChild(grip);
    var titleWrap = el("div", "sc-title-wrap");
    var title = el("div", "sc-title", runInfo.name);
    var meta = el("div", "sc-meta", runInfo.context);
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    head.appendChild(titleWrap);
    var rerunBtn = el("button", "sc-btn sc-icon-btn");
    rerunBtn.appendChild(icon("rotate-cw", 14));
    rerunBtn.title = "重新运行";
    rerunBtn.setAttribute("aria-label", "重新运行");
    rerunBtn.addEventListener("click", function () {
      if (typeof runInfo.onRerun === "function") runInfo.onRerun();
    });
    head.appendChild(rerunBtn);
    var minBtn = el("button", "sc-btn sc-icon-btn");
    minBtn.appendChild(icon("minus", 14));
    minBtn.title = "最小化";
    minBtn.setAttribute("aria-label", "最小化");
    minBtn.addEventListener("click", function () {
      panel.dataset.min = panel.dataset.min === "1" ? "0" : "1";
    });
    head.appendChild(minBtn);
    var closeBtn = el("button", "sc-btn sc-icon-btn");
    closeBtn.appendChild(icon("x", 14));
    closeBtn.title = "关闭";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.addEventListener("click", function () {
      host.remove();
    });
    head.appendChild(closeBtn);
    panel.appendChild(head);

    // 概览
    var sum = el("div", "sc-sum");
    var statusRow = el("div", "sc-status-row");
    var statusPill = el("span", "sc-status sc-status-pass", "等待运行");
    statusPill.setAttribute("data-sctest", "status-pill");
    var duration = el("span", "sc-dur", "0ms");
    duration.setAttribute("data-sctest", "duration");
    statusRow.appendChild(statusPill);
    statusRow.appendChild(el("span", "sc-spacer"));
    statusRow.appendChild(icon("timer", 13));
    statusRow.appendChild(duration);
    sum.appendChild(statusRow);
    var chips = el("div", "sc-chips");
    var chipPass = el("span", "sc-chip sc-chip-pass", "通过 0");
    var chipFail = el("span", "sc-chip sc-chip-fail", "失败 0");
    var chipSkip = el("span", "sc-chip sc-chip-skip", "跳过 0");
    var chipTotal = el("span", "sc-chip sc-chip-skip", "共 0");
    chipTotal.setAttribute("data-sctest", "total-chip");
    [
      [chipPass, "check"],
      [chipFail, "x"],
      [chipSkip, "minus"],
      [chipTotal, "hash"],
    ].forEach(function (entry) {
      entry[0].insertBefore(icon(entry[1], 11), entry[0].firstChild);
    });
    chips.setAttribute("data-sctest", "counters");
    chips.appendChild(chipPass);
    chips.appendChild(chipFail);
    chips.appendChild(chipSkip);
    chips.appendChild(chipTotal);
    var progress = el("div", "sc-progress");
    progress.setAttribute("data-sctest", "progress");
    var barPass = el("i");
    barPass.style.background = "var(--sc-success)";
    barPass.setAttribute("data-sctest", "progress-pass");
    var barFail = el("i");
    barFail.style.background = "var(--sc-destructive)";
    barFail.setAttribute("data-sctest", "progress-fail");
    var barSkip = el("i");
    barSkip.style.background = "var(--sc-muted)";
    barSkip.setAttribute("data-sctest", "progress-skip");
    progress.appendChild(barPass);
    progress.appendChild(barFail);
    progress.appendChild(barSkip);
    sum.appendChild(progress);
    sum.appendChild(chips);
    panel.appendChild(sum);

    // 手动 suite 的运行控制与参数
    var manualSuites = (runInfo.suites || []).filter(function (s) {
      return !s.auto;
    });
    var runRow = el("div", "sc-run-row");
    var runAllBtn = el("button", "sc-btn sc-btn-primary", "运行全部");
    runAllBtn.insertBefore(icon("play", 12), runAllBtn.firstChild);
    // 既有 e2e 通过 run-all 选择器触发 auto:false suite；统一入口后继续保留该稳定契约。
    runAllBtn.setAttribute("data-sctest", "run-all");
    if (manualSuites.length === 1) runAllBtn.setAttribute("data-sctest-suite", manualSuites[0].name);
    var resetBtn = el("button", "sc-btn", "清空");
    resetBtn.insertBefore(icon("rotate-ccw", 12), resetBtn.firstChild);
    resetBtn.setAttribute("data-sctest", "reset");
    var queueChip = el("span", "sc-chip sc-chip-skip", "待跑 " + manualSuites.length);
    queueChip.insertBefore(icon("list-todo", 11), queueChip.firstChild);
    queueChip.setAttribute("data-sctest", "queue-chip");
    runRow.appendChild(runAllBtn);
    runRow.appendChild(resetBtn);
    runRow.appendChild(el("span", "sc-spacer"));
    runRow.appendChild(queueChip);
    sum.appendChild(runRow);
    runAllBtn.addEventListener("click", function () {
      runAllBtn.disabled = true;
      Promise.resolve(typeof runInfo.onRerun === "function" ? runInfo.onRerun() : null).finally(function () {
        runAllBtn.disabled = false;
      });
    });
    // auto:false suite 的参数仍直接绑定到原对象，点击统一的“运行全部”时使用最新值。
    manualSuites.forEach(function (s) {
      var ctl = el("div", "sc-params");
      ctl.setAttribute("data-sctest", "params");
      ctl.appendChild(icon("sliders-horizontal", 12));
      ctl.appendChild(el("span", "sc-params-label", "参数"));
      var paramKeys = Object.keys(s.params);
      paramKeys.forEach(function (key, index) {
        var field = el("label", "sc-field" + (index === paramKeys.length - 1 && paramKeys.length > 1 ? " sc-field-compact" : ""));
        var input = document.createElement("input");
        input.value = s.params[key];
        input.setAttribute("data-sctest", "param-" + key);
        input.addEventListener("input", function () {
          s.params[key] = input.value;
        });
        field.appendChild(el("span", null, key));
        field.appendChild(input);
        ctl.appendChild(field);
      });
      panel.appendChild(ctl);
    });

    var toolbar = el("div", "sc-toolbar");
    var segments = el("div", "sc-segments");
    var filterAll = el("button", "sc-segment", "全部");
    var filterFail = el("button", "sc-segment", "失败");
    var filterSkip = el("button", "sc-segment", "跳过");
    filterAll.dataset.active = "1";
    filterAll.setAttribute("data-sctest", "filter-all");
    filterFail.setAttribute("data-sctest", "filter-fail");
    filterSkip.setAttribute("data-sctest", "filter-skip");
    segments.appendChild(filterAll);
    segments.appendChild(filterFail);
    segments.appendChild(filterSkip);
    var searchWrap = el("label", "sc-search");
    searchWrap.setAttribute("data-sctest", "search");
    searchWrap.appendChild(icon("search", 12));
    var search = document.createElement("input");
    search.placeholder = "筛选用例…";
    searchWrap.appendChild(search);
    var toolbarCopy = el("button", "sc-btn sc-icon-btn");
    toolbarCopy.appendChild(icon("copy", 13));
    toolbarCopy.title = "复制报告";
    toolbarCopy.setAttribute("data-sctest", "copy-report");
    var collapseAll = el("button", "sc-btn sc-icon-btn");
    collapseAll.appendChild(icon("chevrons-down-up", 13));
    collapseAll.title = "全部折叠";
    collapseAll.setAttribute("data-sctest", "collapse-all");
    toolbar.appendChild(segments);
    toolbar.appendChild(searchWrap);
    toolbar.appendChild(toolbarCopy);
    toolbar.appendChild(collapseAll);
    panel.appendChild(toolbar);

    var body = el("div", "sc-body");
    panel.appendChild(body);

    var foot = el("div", "sc-foot");
    foot.setAttribute("data-sctest", "footer");
    var sumLine = el("div", "sc-sumline", "");
    sumLine.setAttribute("data-sctest", "summary-line");
    foot.appendChild(sumLine);
    var copyBtn = el("button", "sc-btn", "复制报告");
    copyBtn.insertBefore(icon("clipboard-copy", 12), copyBtn.firstChild);
    copyBtn.setAttribute("data-sctest", "footer-copy-report");
    foot.appendChild(copyBtn);
    var jsonBtn = el("button", "sc-btn", "JSON");
    jsonBtn.insertBefore(icon("braces", 12), jsonBtn.firstChild);
    jsonBtn.setAttribute("data-sctest", "export-json");
    foot.appendChild(jsonBtn);
    panel.appendChild(foot);

    function reportText() {
      var lines = [sumLine.textContent];
      Object.keys(caseNodes).forEach(function (key) {
        var node = caseNodes[key];
        lines.push((ICONS[node.status] || "○") + " " + key.replace("//", " › "));
      });
      return lines.join("\n");
    }

    function reportJson() {
      var cases = Object.keys(caseNodes).map(function (key) {
        var node = caseNodes[key];
        return { suite: node.suite, name: key.slice(key.indexOf("//") + 2), status: node.status };
      });
      return { name: runInfo.name, context: runInfo.context, summary: state, cases: cases };
    }

    function copyReport() {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(reportText());
      return Promise.resolve();
    }

    copyBtn.addEventListener("click", copyReport);
    toolbarCopy.addEventListener("click", copyReport);
    jsonBtn.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(JSON.stringify(reportJson(), null, 2));
      }
    });

    grip.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      var rect = panel.getBoundingClientRect();
      var startX = event.clientX;
      var startY = event.clientY;
      function move(moveEvent) {
        var left = Math.max(0, Math.min(window.innerWidth - rect.width, rect.left + moveEvent.clientX - startX));
        var top = Math.max(0, Math.min(window.innerHeight - rect.height, rect.top + moveEvent.clientY - startY));
        panel.style.left = left + "px";
        panel.style.top = top + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      }
      function stop() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", stop);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);
    });

    function applyFilters() {
      var query = search.value.trim().toLowerCase();
      Object.keys(caseNodes).forEach(function (key) {
        var node = caseNodes[key];
        var statusOk = activeFilter === "all" || node.status === activeFilter;
        var textOk = !query || key.toLowerCase().indexOf(query) !== -1;
        node.row.hidden = !(statusOk && textOk);
        if (node.detail) node.detail.hidden = node.row.hidden;
        if (node.hint) node.hint.hidden = node.row.hidden;
      });
      Object.keys(suiteNodes).forEach(function (name) {
        var suiteNode = suiteNodes[name];
        var hasVisibleCase = Object.keys(caseNodes).some(function (key) {
          return caseNodes[key].suite === name && !caseNodes[key].row.hidden;
        });
        suiteNode.row.hidden = !hasVisibleCase;
        suiteNode.group.hidden = suiteNode.collapsed || !hasVisibleCase;
      });
    }

    [[filterAll, "all"], [filterFail, "fail"], [filterSkip, "skip"]].forEach(function (entry) {
      entry[0].addEventListener("click", function () {
        activeFilter = entry[1];
        [filterAll, filterFail, filterSkip].forEach(function (button) {
          button.dataset.active = button === entry[0] ? "1" : "0";
        });
        Object.keys(suiteNodes).forEach(function (name) {
          suiteNodes[name].collapsed = false;
        });
        applyFilters();
      });
    });
    search.addEventListener("input", function () {
      Object.keys(suiteNodes).forEach(function (name) {
        suiteNodes[name].collapsed = false;
      });
      applyFilters();
    });
    collapseAll.addEventListener("click", function () {
      var shouldCollapse = Object.keys(suiteNodes).some(function (name) {
        return !suiteNodes[name].collapsed;
      });
      Object.keys(suiteNodes).forEach(function (name) {
        suiteNodes[name].collapsed = shouldCollapse;
        suiteNodes[name].group.hidden = shouldCollapse;
        suiteNodes[name].chevron.textContent = "";
        suiteNodes[name].chevron.appendChild(icon(shouldCollapse ? "chevron-right" : "chevron-down", 13));
      });
      collapseAll.title = shouldCollapse ? "全部展开" : "全部折叠";
      applyFilters();
    });
    resetBtn.addEventListener("click", function () {
      search.value = "";
      filterAll.click();
      Object.keys(suiteNodes).forEach(function (name) {
        suiteNodes[name].collapsed = false;
        suiteNodes[name].chevron.textContent = "";
        suiteNodes[name].chevron.appendChild(icon("chevron-down", 13));
      });
      applyFilters();
    });

    function recount() {
      setIconLabel(chipPass, "check", "通过 " + state.pass, 11);
      setIconLabel(chipFail, "x", "失败 " + state.fail, 11);
      setIconLabel(chipSkip, "minus", "跳过 " + state.skip, 11);
      setIconLabel(chipTotal, "hash", "共 " + state.total, 11);
      var total = state.total || 1;
      barPass.style.width = (state.pass / total) * 100 + "%";
      barFail.style.width = (state.fail / total) * 100 + "%";
      barSkip.style.width = (state.skip / total) * 100 + "%";
      statusPill.className = "sc-status " + (state.fail ? "sc-status-fail" : "sc-status-pass");
      setIconLabel(
        statusPill,
        state.fail ? "circle-x" : "check",
        state.fail ? state.fail + " 项失败" : state.total && !state.skip ? "全部通过" : "运行中",
        13
      );
      duration.textContent = state.durationMs + "ms";
      setIconLabel(queueChip, "list-todo", "待跑 " + state.skip, 11);
      sumLine.textContent =
        "总测试数: " + state.total + "  通过: " + state.pass + "  失败: " + state.fail + "  跳过: " + state.skip;
      Object.keys(suiteNodes).forEach(function (name) {
        var suiteNode = suiteNodes[name];
        var passed = 0;
        var failed = 0;
        var suiteTotal = 0;
        Object.keys(caseNodes).forEach(function (key) {
          var node = caseNodes[key];
          if (node.suite !== name) return;
          suiteTotal++;
          if (node.status === "pass") passed++;
          if (node.status === "fail") failed++;
        });
        if (suiteNode.manualTotal) {
          var manualDone = Object.keys(state.manualOverrides).filter(function (key) {
            return key.indexOf(name + "//") === 0;
          }).length;
          setIconLabel(suiteNode.stat, "hand", "人工 " + manualDone + " / " + suiteNode.manualTotal, 10);
        } else {
          suiteNode.stat.textContent = passed + " / " + suiteTotal;
          suiteNode.stat.dataset.failed = failed ? "1" : "0";
        }
      });
      applyFilters();
    }

    function ensureSuite(name) {
      if (suiteNodes[name]) return suiteNodes[name];
      var suiteDefinition = (runInfo.suites || []).filter(function (suite) {
        return suite.name === name;
      })[0];
      var manualTotal = suiteDefinition
        ? suiteDefinition.cases.filter(function (testCase) {
            return testCase.kind === "manual";
          }).length
        : 0;
      var row = el("div", "sc-suite");
      row.setAttribute("data-sctest", "suite-row");
      var chevron = el("span", "sc-icon");
      chevron.appendChild(icon("chevron-down", 13));
      var label = el("span", "sc-suite-name", name);
      var stat = el("span", "sc-suite-stat", "0 / 0");
      if (manualTotal) {
        stat.dataset.manual = "1";
        setIconLabel(stat, "hand", "人工 0 / " + manualTotal, 10);
      }
      stat.setAttribute("data-sctest", "suite-stat");
      row.appendChild(chevron);
      row.appendChild(label);
      row.appendChild(stat);
      body.appendChild(row);
      var group = el("div");
      body.appendChild(group);
      row.addEventListener("click", function () {
        suiteNodes[name].collapsed = !suiteNodes[name].collapsed;
        group.hidden = suiteNodes[name].collapsed;
        chevron.textContent = "";
        chevron.appendChild(icon(group.hidden ? "chevron-right" : "chevron-down", 13));
      });
      suiteNodes[name] = { row: row, group: group, stat: stat, chevron: chevron, manualTotal: manualTotal, collapsed: false };
      return suiteNodes[name];
    }

    function applyStatus(c, node) {
      var statusIcon = c.status === "pass" ? "check" : c.status === "fail" ? "x" : c.status === "manual" ? "hand" : "minus";
      node.icon.textContent = "";
      node.icon.appendChild(icon(statusIcon, 13));
      node.dur.textContent = c.status === "manual" ? "人工" : c.durationMs + "ms";
    }

    // 渲染/清理失败详情框。挂在 node.detail 上以便重跑时能先移除旧的一份,
    // 而不是无限追加——manual suite 的用例首次总是先以 SKIP 预渲染,
    // 真正执行时都会走 onCase 的"更新"分支,所以两个分支都要能产生/替换详情框。
    function renderDetail(node, c) {
      if (node.detail) {
        node.detail.remove();
        node.detail = null;
      }
      if (c.status === "fail") {
        var detail = el(
          "div",
          "sc-detail",
          "期望  " + (c.expected == null ? "-" : c.expected) + "\n实际  " + (c.actual == null ? "-" : c.actual) + "\n" + c.error
        );
        detail.setAttribute("data-sctest", "failure-detail");
        node.row.parentNode.insertBefore(detail, node.row.nextSibling);
        node.detail = detail;
      } else if (c.status === "skip" && c.error) {
        var reason = el("div", "sc-detail", c.error);
        reason.setAttribute("data-sctest", "skip-reason");
        node.row.parentNode.insertBefore(reason, node.row.nextSibling);
        node.detail = reason;
      }
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
        var key = c.suite + "//" + c.name;
        var existing = caseNodes[key];
        if (existing) {
          if (existing.status === "skip") state.skip--;
          else if (existing.status === "pass") state.pass--;
          else if (existing.status === "fail") state.fail--;
          existing.status = c.status;
          applyStatus(c, existing);
          renderDetail(existing, c);
          if (c.status === "pass") state.pass++;
          else if (c.status === "fail") state.fail++;
          else state.skip++;
          recount();
          return;
        }
        var suite = ensureSuite(c.suite);
        var row = el("div", "sc-case" + (c.status === "manual" ? " sc-case-manual" : ""));
        row.setAttribute("data-sctest", "case-row");
        var caseIcon = el("b", null, ICONS[c.status] || "○");
        var label = el("span", null, c.name);
        var dur = el("i", "sc-dur", c.status === "manual" ? "人工" : c.durationMs + "ms");
        row.appendChild(caseIcon);
        row.appendChild(label);
        row.appendChild(dur);
        suite.group.appendChild(row);
        var node = { row: row, icon: caseIcon, dur: dur, status: c.status, suite: c.suite, detail: null, hint: null };
        caseNodes[key] = node;

        if (c.status === "fail") {
          state.fail++;
        } else if (c.status === "pass") {
          state.pass++;
        } else {
          state.skip++;
        }
        renderDetail(node, c);

        if (c.status === "manual") {
          var pass = el("button", "sc-btn sc-icon-btn sc-manual-pass");
          pass.appendChild(icon("check", 12));
          pass.setAttribute("data-sctest", "manual-pass");
          var fail = el("button", "sc-btn sc-icon-btn sc-manual-fail");
          fail.appendChild(icon("x", 12));
          fail.setAttribute("data-sctest", "manual-fail");
          function settle(ok) {
            state.skip--;
            if (ok) state.pass++;
            else state.fail++;
            state.manualOverrides[c.suite + "//" + c.name] = ok ? "pass" : "fail";
            node.status = ok ? "pass" : "fail";
            row.classList.remove("sc-case-manual");
            caseIcon.textContent = "";
            caseIcon.appendChild(icon(ok ? "check" : "x", 13));
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
          if (c.hint) {
            var hint = el("div", "sc-hint");
            hint.appendChild(icon("info", 12));
            hint.appendChild(el("span", null, c.hint));
            suite.group.appendChild(hint);
            node.hint = hint;
          }
        }

        applyStatus(c, node);
        recount();
      },
      onEnd: function (summary) {
        state.total = summary.total;
        state.durationMs = summary.durationMs;
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

  function emitLog(message, level, labels) {
    if (typeof GM_log === "function") {
      GM_log(message, level, labels);
    }
  }

  function createLogReporter() {
    return {
      onStart: function (info) {
        var cases = (info.suites || []).reduce(function (n, s) {
          return n + s.cases.length;
        }, 0);
        emitLog("▶ " + info.name, "info", { sctest: "run", context: info.context, cases: cases });
      },
      onCase: function (c) {
        if (c.status === STATUS.PASS) {
          emitLog("✓ " + c.suite + " › " + c.name, "info", {
            sctest: "case",
            status: "pass",
            ms: c.durationMs,
          });
        } else if (c.status === STATUS.FAIL) {
          emitLog("✗ " + c.suite + " › " + c.name + " — " + c.error, "error", {
            sctest: "case",
            status: "fail",
            suite: c.suite,
          });
        } else {
          emitLog("○ " + c.suite + " › " + c.name + (c.error ? " — " + c.error : ""), "warn", {
            sctest: "case",
            status: "skip",
          });
        }
      },
      onEnd: function (summary) {
        emitLog(
          "■ 总测试数: " +
            summary.total +
            "  通过: " +
            summary.passed +
            "  失败: " +
            summary.failed +
            "  跳过: " +
            summary.skipped +
            "  (" +
            summary.durationMs +
            "ms)",
          "info",
          { sctest: "summary", passed: summary.passed, failed: summary.failed }
        );
      },
    };
  }

  var api = {
    create: create,
    skip: function (reason) {
      throw new SkipSignal(reason);
    },
    __detectContext: detectContext,
    __buildReporters: buildReporters,
    __createConsoleReporter: createConsoleReporter,
    __createPanelReporter: createPanelReporter,
    __createLogReporter: createLogReporter,
    __installPanelStyles: installPanelStyles,
    STATUS: STATUS,
  };

  global.SCTest = api;
})(typeof window !== "undefined" ? window : globalThis);

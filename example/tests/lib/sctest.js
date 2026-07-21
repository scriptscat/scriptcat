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

  var api = {
    create: create,
    __detectContext: detectContext,
    __buildReporters: function () {
      return [createConsoleReporter()];
    },
    __createConsoleReporter: createConsoleReporter,
    STATUS: STATUS,
  };

  global.SCTest = api;
})(typeof window !== "undefined" ? window : globalThis);

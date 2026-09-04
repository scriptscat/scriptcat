/**
 * sctest — ScriptCat example/tests 共用测试框架
 * 零依赖、零构建,供用户脚本 @require 使用。
 */
(function (global) {
  "use strict";

  var STATUS = {
    PASS: "PASS",
    FAIL: "FAIL",
    WARN: "WARN",
    INFO: "INFO",
    SKIP: "SKIP",
    MANUAL: "MANUAL",
  };
  var SCTEST_MARKER = "[SCTEST_RESULT]";
  var UNAVAILABLE = Object.create(null);

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

  function safe(fn) {
    try {
      return { ok: true, value: fn() };
    } catch (error) {
      return { ok: false, error: error };
    }
  }

  function read(fn) {
    var result = safe(fn);
    return result.ok ? result.value : UNAVAILABLE;
  }

  function formatError(error) {
    if (error === UNAVAILABLE) return "不可用";
    try {
      if (error && error.name && error.message) return error.name + ": " + error.message;
      return String(error);
    } catch (e) {
      return "未知异常";
    }
  }

  function realmLabel(value) {
    var currentWindow = read(function () {
      return typeof window === "undefined" ? UNAVAILABLE : window;
    });
    if (currentWindow !== UNAVAILABLE && value === currentWindow) return "sandbox window";
    var currentGlobal = read(function () {
      return typeof globalThis === "undefined" ? UNAVAILABLE : globalThis;
    });
    if (currentGlobal !== UNAVAILABLE && value === currentGlobal) return "sandbox globalThis";
    var currentSelf = read(function () {
      return typeof self === "undefined" ? UNAVAILABLE : self;
    });
    if (currentSelf !== UNAVAILABLE && value === currentSelf) return "sandbox self";
    var pageWindow = read(function () {
      return typeof unsafeWindow === "undefined" ? UNAVAILABLE : unsafeWindow;
    });
    if (pageWindow !== UNAVAILABLE && value === pageWindow) return "page unsafeWindow";
    return "";
  }

  function stringify(value) {
    if (value === UNAVAILABLE) return "<不可用>";
    var realm = realmLabel(value);
    if (realm) return realm;
    if (typeof value === "function") return "[Function " + (value.name || "anonymous") + "]";
    try {
      var seen = [];
      var out = JSON.stringify(value, function (key, current) {
        if (current && typeof current === "object") {
          if (seen.indexOf(current) !== -1) return "[Circular]";
          seen.push(current);
        }
        return current;
      });
      return out === undefined ? String(value) : out;
    } catch (e) {
      try {
        return String(value);
      } catch (stringError) {
        return "<无法显示的值>";
      }
    }
  }

  function formatValue(value) {
    if (value === UNAVAILABLE) return "<不可用>";
    var realm = realmLabel(value);
    if (realm) return realm;
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "function") return "function " + (value.name || "(anonymous)");
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
    if (typeof value === "symbol") return String(value);
    return stringify(value);
  }

  function stringifyReport(value, space) {
    var ancestors = [];
    try {
      return JSON.stringify(
        value,
        function (key, current) {
          while (ancestors.length && ancestors[ancestors.length - 1] !== this) ancestors.pop();
          if (current === UNAVAILABLE) return "<不可用>";
          var realm = realmLabel(current);
          if (realm) return realm;
          if (typeof current === "bigint") return String(current);
          if (typeof current === "function") return formatValue(current);
          if (typeof current === "symbol") return String(current);
          if (current && typeof current === "object") {
            if (ancestors.indexOf(current) !== -1) return "[Circular]";
            ancestors.push(current);
          }
          return current;
        },
        space
      );
    } catch (error) {
      return JSON.stringify({ protocol: "sctest/v1", error: "报告序列化失败: " + formatError(error) }, null, space);
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

  function makeExpect(onObserve) {
    function observe(matcher, expected, actual) {
      if (onObserve) {
        onObserve({
          matcher: matcher,
          expected: stringify(expected),
          actual: stringify(actual),
        });
      }
    }

    return function expect(actual) {
      return {
        toBe: function (expected) {
          observe("toBe", expected, actual);
          if (actual !== expected) {
            throw AssertionError(
              "期望 " + stringify(expected) + ",实际 " + stringify(actual),
              stringify(expected),
              stringify(actual)
            );
          }
        },
        toEqual: function (expected) {
          observe("toEqual", expected, actual);
          if (!deepEqual(actual, expected)) {
            var b = stringify(expected);
            var a = stringify(actual);
            throw AssertionError("期望 " + b + ",实际 " + a, b, a);
          }
        },
        toBeTruthy: function () {
          observe("toBeTruthy", "truthy", actual);
          if (!actual) throw AssertionError("期望为真值,实际 " + stringify(actual), "truthy", stringify(actual));
        },
        toBeTypeOf: function (expected) {
          var t = typeof actual;
          observe("toBeTypeOf", expected, t);
          if (t !== expected) throw AssertionError("期望类型 " + expected + ",实际 " + t, expected, t);
        },
        toMatch: function (pattern) {
          var text = String(actual);
          observe("toMatch", String(pattern), text);
          var ok = pattern instanceof RegExp ? pattern.test(text) : text.indexOf(String(pattern)) !== -1;
          if (!ok) {
            throw AssertionError("期望匹配 " + String(pattern) + ",实际 " + stringify(text), String(pattern), text);
          }
        },
        toThrow: function (pattern) {
          if (typeof actual !== "function") {
            throw AssertionError("toThrow 的被测目标必须是函数,实际 " + typeof actual, "function", typeof actual);
          }
          var didThrow = false;
          var thrown;
          try {
            actual();
          } catch (e) {
            didThrow = true;
            thrown = e;
          }
          observe("toThrow", pattern ? "throw " + String(pattern) : "throw", didThrow ? "throw" : "no throw");
          if (!didThrow) throw AssertionError("期望抛出异常,实际未抛出", "throw", "no throw");
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

  function normalizeStatus(status) {
    var normalized = String(status || "").toUpperCase();
    return STATUS[normalized] || STATUS.FAIL;
  }

  function resolveValue(value) {
    return typeof value === "function" ? value() : value;
  }

  async function resolveValueAsync(value) {
    return await resolveValue(value);
  }

  function overallStatus(counts) {
    return counts.FAIL ? STATUS.FAIL : counts.MANUAL ? STATUS.MANUAL : counts.WARN ? STATUS.WARN : STATUS.PASS;
  }

  function createEnvironment(context) {
    var environment = {
      tool: "sctest",
      version: "1",
      time: new Date().toISOString(),
      context: context,
    };
    var url = read(function () {
      return typeof location === "undefined" ? UNAVAILABLE : location.href;
    });
    if (url !== UNAVAILABLE) environment.url = String(url);
    var info = read(function () {
      if (typeof GM !== "undefined" && GM && GM.info) return GM.info;
      return typeof GM_info === "undefined" ? UNAVAILABLE : GM_info;
    });
    if (info !== UNAVAILABLE && info) {
      var manager = read(function () {
        return info.scriptHandler ? info.scriptHandler + (info.version ? " " + info.version : "") : UNAVAILABLE;
      });
      if (manager !== UNAVAILABLE) environment.manager = String(manager);
    }
    return environment;
  }

  function isTopLevelFrame() {
    if (typeof window === "undefined") return true;
    var currentWindow = read(function () {
      return window;
    });
    var topWindow = read(function () {
      return window.top;
    });
    return currentWindow !== UNAVAILABLE && topWindow !== UNAVAILABLE && currentWindow === topWindow;
  }

  function createSummary(name, context, suites, startedAt, environment) {
    var counts = { PASS: 0, FAIL: 0, WARN: 0, INFO: 0, SKIP: 0, MANUAL: 0 };
    var total = 0;
    var outSuites = suites.map(function (s) {
      return {
        name: s.name,
        auto: s.auto,
        params: s.params,
        cases: s.cases.map(function (c) {
          total++;
          counts[c.status] = (counts[c.status] || 0) + 1;
          return {
            name: c.name,
            suite: c.suite,
            category: c.category,
            status: c.status,
            durationMs: c.durationMs,
            error: c.error,
            expected: c.expected,
            actual: c.actual,
            detail: c.detail,
            hint: c.hint,
            required: c.required,
            manualVerdict: c.manualVerdict || null,
          };
        }),
      };
    });
    return {
      protocol: "sctest/v1",
      name: name,
      context: context,
      total: total,
      passed: counts.PASS,
      failed: counts.FAIL,
      warned: counts.WARN,
      info: counts.INFO,
      skipped: counts.SKIP,
      manual: counts.MANUAL,
      counts: counts,
      overall: overallStatus(counts),
      durationMs: Math.round(now() - startedAt),
      suites: outSuites,
      environment: environment || createEnvironment(context),
    };
  }

  function create(options) {
    var opts = options || {};
    var runName = opts.name || "未命名测试";
    var context = opts.context || detectContext(currentMetaStr());
    var suites = [];
    var currentSuite = null;
    var lastStartedAt = 0;
    var runInfo = null;
    var activeCase = null;
    var environment = createEnvironment(context);

    function describe(name, optsOrFn, maybeFn) {
      var suiteOpts = typeof optsOrFn === "function" ? {} : optsOrFn || {};
      var fn = typeof optsOrFn === "function" ? optsOrFn : maybeFn;
      var suite = { name: name, auto: suiteOpts.auto !== false, params: suiteOpts.params || {}, cases: [] };
      suites.push(suite);
      currentSuite = suite;
      try {
        fn();
      } finally {
        currentSuite = null;
      }
    }

    function pushCase(category, name, fn, kind, fields) {
      if (!currentSuite) throw new Error("check/it/itManual 必须写在 describe 内部:" + name);
      var data = fields || {};
      currentSuite.cases.push({
        name: name,
        suite: currentSuite.name,
        category: category || currentSuite.name,
        fn: fn,
        kind: kind,
        hint: data.hint || "",
        status: null,
        durationMs: 0,
        error: null,
        expected: data.expected == null ? null : data.expected,
        actual: data.actual == null ? null : data.actual,
        detail: data.detail || "",
        expectedSource: data.expected == null ? null : data.expected,
        actualSource: data.actual == null ? null : data.actual,
        detailSource: data.detail || "",
        required: data.required !== false,
        requiredSource: data.required !== false,
        onFail: data.onFail,
        onError: data.onError,
        failDetailSource: data.failDetail == null ? null : data.failDetail,
        errorDetailSource: data.errorDetail == null ? null : data.errorDetail,
        manualVerdict: null,
        observations: [],
      });
    }

    function check(category, name, predicate, expected, actual, detail, options) {
      if (typeof name === "function") {
        options = {};
        detail = null;
        actual = null;
        expected = null;
        predicate = name;
        name = category;
        category = currentSuite ? currentSuite.name : "自动断言";
      }
      var resolvedCategory = category === "自动断言" && currentSuite ? currentSuite.name : category;
      pushCase(resolvedCategory, name, predicate, "check", {
        expected: expected,
        actual: actual,
        detail: detail,
        required: !options || options.required !== false,
        onFail: options && options.onFail,
        onError: options && options.onError,
        failDetail: options && options.failDetail,
        errorDetail: options && options.errorDetail,
      });
    }

    function note(category, name, expected, actual, detail) {
      pushCase(category, name, null, "note", {
        expected: expected,
        actual: actual,
        detail: detail,
        required: false,
      });
    }

    function it(name, fn) {
      check(name, fn);
    }

    function itManual(name, manualOpts) {
      pushCase(currentSuite ? currentSuite.name : "人工验证", name, null, "manual", {
        hint: (manualOpts || {}).hint,
        required: false,
      });
    }

    function toResult(c) {
      return {
        name: c.name,
        suite: c.suite,
        category: c.category,
        status: c.status,
        durationMs: c.durationMs,
        error: c.error,
        expected: c.expected,
        actual: c.actual,
        detail: c.detail,
        hint: c.hint,
        required: c.required,
        manualVerdict: c.manualVerdict || null,
      };
    }

    function emitCase(reporters, result) {
      reporters.forEach(function (r) {
        if (r.onCase) r.onCase(result);
      });
    }

    function inferAssertionFields(c) {
      if (!c.observations.length) return null;
      return {
        expected: c.observations
          .map(function (observation) {
            return observation.matcher + ": " + observation.expected;
          })
          .join("\n"),
        actual: c.observations
          .map(function (observation) {
            return observation.matcher + ": " + observation.actual;
          })
          .join("\n"),
      };
    }

    function fallbackFields(c, passed, error) {
      var inferred = inferAssertionFields(c);
      if (inferred) return inferred;
      if (error) return { expected: "不抛出异常", actual: "抛出 " + error };
      return passed === false
        ? { expected: "true", actual: "false" }
        : { expected: "执行不抛出异常", actual: "未抛出异常" };
    }

    async function resolveDetail(c, status, isError) {
      var specificDetail = await resolveValueAsync(isError ? c.errorDetailSource : c.failDetailSource);
      if (specificDetail) return specificDetail;
      var detail = await resolveValueAsync(c.detailSource);
      if (detail && detail !== "保留原有断言体") return detail;
      if (status === STATUS.FAIL) return "检查「" + c.name + "」失败；请对照错误、期望值和实际值定位原因。";
      if (status === STATUS.WARN) return "检查「" + c.name + "」未满足，但按可选诊断记录为警告。";
      if (status === STATUS.SKIP) return "检查「" + c.name + "」未执行：当前环境不提供所需条件。";
      if (status === STATUS.MANUAL) return "检查「" + c.name + "」需要人工操作后裁决。";
      if (status === STATUS.INFO) return "记录「" + c.name + "」的环境观察，不产生自动断言。";
      return "检查「" + c.name + "」的内部断言；所有断言均满足。";
    }

    async function runCase(c, reporters) {
      c.error = null;
      if (c.kind === "check") {
        c.required = c.requiredSource;
        c.expected = null;
        c.actual = null;
        c.detail = "";
        c.observations = [];
      }
      if (c.kind === "manual") {
        c.status = STATUS.MANUAL;
        c.detail = await resolveDetail(c, c.status, false);
      } else if (c.kind === "note") {
        c.status = STATUS.INFO;
      } else {
        var started = now();
        try {
          activeCase = c;
          var passed = await c.fn();
          c.expected = await resolveValueAsync(c.expectedSource);
          c.actual = await resolveValueAsync(c.actualSource);
          var passFields = fallbackFields(c, passed, null);
          if (c.expected == null) c.expected = passFields.expected;
          if (c.actual == null) c.actual = passFields.actual;
          // Existing assertion bodies return undefined after their expect() calls. Treat only
          // an explicit false as a predicate failure so those bodies can migrate one-for-one.
          var matched = passed !== false;
          c.status = matched ? STATUS.PASS : normalizeStatus(c.onFail || STATUS.FAIL);
          c.detail = await resolveDetail(c, c.status, false);
        } catch (e) {
          if (e instanceof SkipSignal) {
            c.status = STATUS.SKIP;
            c.error = e.reason;
            c.required = false;
            var skipFields = fallbackFields(c, null, null);
            c.expected = (await resolveValueAsync(c.expectedSource)) || skipFields.expected;
            c.actual = (await resolveValueAsync(c.actualSource)) || "当前环境未提供";
            c.detail = await resolveDetail(c, c.status, false);
          } else {
            c.status = normalizeStatus(c.onError || c.onFail || STATUS.FAIL);
            c.error = String((e && e.message) || e);
            var errorFields = fallbackFields(c, null, c.error);
            if (c.expected == null)
              c.expected = (await resolveValueAsync(c.expectedSource)) || (e && e.expected) || errorFields.expected;
            if (c.actual == null)
              c.actual = (await resolveValueAsync(c.actualSource)) || (e && e.actual) || errorFields.actual;
            c.detail = await resolveDetail(c, c.status, true);
          }
        }
        activeCase = null;
        c.durationMs = Math.round(now() - started);
      }
      var result = toResult(c);
      emitCase(reporters, result);
      return result;
    }

    function buildSummary(startedAt) {
      return createSummary(runName, context, suites, startedAt, environment);
    }

    function emitEnd(reporters, summary) {
      reporters.forEach(function (r) {
        if (r.onEnd) r.onEnd(summary);
      });
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
      var summary = buildSummary(startedAt);
      emitEnd(reporters, summary);
      return summary;
    }

    async function run() {
      runInfo = {
        name: runName,
        context: context,
        suites: suites,
        environment: environment,
        runnable: true,
        onRunManual: null,
        onManualVerdict: null,
      };
      var reporters = global.SCTest.__buildReporters(opts, context, runInfo);
      runInfo.onRunManual = function (suiteName) {
        return rerunSuites(reporters, suiteName, false);
      };
      runInfo.onRerun = function () {
        return rerunSuites(reporters, null, true);
      };
      runInfo.onManualVerdict = function (suiteName, caseName, status, detail) {
        var target = null;
        suites.forEach(function (suite) {
          suite.cases.forEach(function (c) {
            if (c.suite === suiteName && c.name === caseName) target = c;
          });
        });
        if (!target || target.kind !== "manual") return buildSummary(lastStartedAt || now());
        target.status = normalizeStatus(status);
        target.manualVerdict = target.status;
        target.error = target.status === STATUS.FAIL ? detail || "人工确认失败" : null;
        target.detail = detail || target.detail || "人工确认完成";
        emitCase(reporters, toResult(target));
        var summary = buildSummary(lastStartedAt || now());
        emitEnd(reporters, summary);
        return summary;
      };
      lastStartedAt = now();
      reporters.forEach(function (r) {
        if (r.onStart) r.onStart(runInfo);
      });

      for (var i = 0; i < suites.length; i++) {
        var suite = suites[i];
        for (var j = 0; j < suite.cases.length; j++) {
          var c = suite.cases[j];
          if (!suite.auto && c.kind !== "manual") {
            c.status = STATUS.SKIP;
            c.required = false;
            c.expected = (await resolveValueAsync(c.expectedSource)) || "点击运行后执行此检查";
            c.actual = (await resolveValueAsync(c.actualSource)) || "尚未运行";
            c.detail = await resolveDetail(c, c.status, false);
            emitCase(reporters, toResult(c));
            continue;
          }
          await runCase(c, reporters);
        }
      }

      var summary = buildSummary(lastStartedAt);
      emitEnd(reporters, summary);
      return summary;
    }

    return {
      describe: describe,
      check: check,
      note: note,
      it: it,
      itManual: itManual,
      expect: makeExpect(function (observation) {
        if (activeCase) activeCase.observations.push(observation);
      }),
      run: run,
    };
  }

  function createReportSession(options) {
    var opts = options || {};
    var name = opts.name || "未命名报告";
    var context = opts.context || detectContext(currentMetaStr());
    var environment = createEnvironment(context);
    var reporters = global.SCTest.__buildReporters(
      { reporter: opts.reporter || "console", framePolicy: opts.framePolicy || "top" },
      context,
      {
        name: name,
        context: context,
        suites: [],
        environment: environment,
        runnable: false,
      }
    );
    var cases = [];
    var startedAt = now();
    var started = false;
    var finished = false;

    function emitSummary() {
      var summary = createSummary(
        name,
        context,
        [{ name: "报告", auto: true, params: {}, cases: cases }],
        startedAt,
        environment
      );
      reporters.forEach(function (r) {
        if (r.onEnd) r.onEnd(summary);
      });
    }

    function start() {
      if (started) return;
      started = true;
      reporters.forEach(function (r) {
        if (r.onStart) r.onStart({ name: name, context: context, suites: [], environment: environment });
      });
    }

    function record(input) {
      start();
      var result = {
        category: input.category || "运行观察",
        name: input.name || "未命名结果",
        suite: input.suite || input.category || "运行观察",
        status: normalizeStatus(input.status),
        durationMs: input.durationMs || 0,
        error: input.error || null,
        expected: input.expected == null ? null : input.expected,
        actual: input.actual == null ? null : input.actual,
        detail: input.detail || "",
        hint: input.hint || "",
        required: input.required !== false,
        manualVerdict: input.manualVerdict || null,
      };
      cases.push(result);
      reporters.forEach(function (r) {
        if (r.onCase) r.onCase(result);
      });
      if (finished) emitSummary();
      return result;
    }

    function update(result, status, fields) {
      var index = cases.indexOf(result);
      if (index < 0) throw new Error("报告结果不属于当前 session");
      var next = fields || {};
      result.status = normalizeStatus(status);
      Object.keys(next).forEach(function (key) {
        result[key] = next[key];
      });
      reporters.forEach(function (r) {
        if (r.onCase) r.onCase(result);
      });
      if (finished) emitSummary();
      return result;
    }

    async function checkSession(category, caseName, predicate, expected, actual, detail, options) {
      var startedAtForCase = now();
      var checkOptions = options || {};
      try {
        var passed = await predicate();
        var resolvedExpected = await resolveValueAsync(expected);
        var resolvedActual = await resolveValueAsync(actual);
        return record({
          category: category,
          name: caseName,
          status: passed !== false ? STATUS.PASS : normalizeStatus(checkOptions.onFail || STATUS.FAIL),
          expected: resolvedExpected,
          actual: resolvedActual,
          detail:
            (await resolveValueAsync(passed ? detail : checkOptions.failDetail)) ||
            (await resolveValueAsync(detail)) ||
            (passed ? "符合预期" : "不符合预期"),
          required: checkOptions.required !== false,
          durationMs: Math.round(now() - startedAtForCase),
        });
      } catch (e) {
        if (e instanceof SkipSignal) {
          return record({
            category: category,
            name: caseName,
            status: STATUS.SKIP,
            actual: "当前环境未提供",
            detail: e.reason,
            required: false,
            durationMs: Math.round(now() - startedAtForCase),
          });
        }
        var resolvedExpectedOnError = await resolveValueAsync(expected);
        var resolvedActualOnError = await resolveValueAsync(actual);
        return record({
          category: category,
          name: caseName,
          status: normalizeStatus(checkOptions.onError || checkOptions.onFail || STATUS.FAIL),
          error: String((e && e.message) || e),
          expected: resolvedExpectedOnError,
          actual: resolvedActualOnError == null ? "抛出 " + formatError(e) : resolvedActualOnError,
          detail:
            (await resolveValueAsync(checkOptions.errorDetail)) ||
            (await resolveValueAsync(detail)) ||
            "检测过程抛出异常",
          required: checkOptions.required !== false,
          durationMs: Math.round(now() - startedAtForCase),
        });
      }
    }

    function finish() {
      start();
      var suite = { name: "报告", auto: true, params: {}, cases: cases };
      var summary = createSummary(name, context, [suite], startedAt, environment);
      finished = true;
      reporters.forEach(function (r) {
        if (r.onEnd) r.onEnd(summary);
      });
      return summary;
    }

    return {
      start: start,
      record: record,
      update: update,
      check: checkSession,
      note: function (category, caseName, expected, actual, detail) {
        return record({
          category: category,
          name: caseName,
          status: STATUS.INFO,
          expected: expected,
          actual: actual,
          detail: detail,
          required: false,
        });
      },
      skip: function (category, caseName, expected, actual, detail) {
        return record({
          category: category,
          name: caseName,
          status: STATUS.SKIP,
          expected: expected,
          actual: actual,
          detail: detail,
          required: false,
        });
      },
      manual: function (category, caseName, expected, actual, detail) {
        return record({
          category: category,
          name: caseName,
          status: STATUS.MANUAL,
          expected: expected,
          actual: actual,
          detail: detail,
          required: false,
        });
      },
      finish: finish,
      summary: finish,
    };
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
        var icon = ICONS[c.status] || "○";
        var fields = { expected: c.expected, actual: c.actual, detail: c.detail, required: c.required };
        var line = icon + " [" + c.status + "] " + c.name + " (" + c.durationMs + "ms)" + formatDetails(c);
        if (c.status === STATUS.FAIL) console.error("%c" + line, "color: red;", fields);
        else if (c.status === STATUS.WARN) console.warn("%c" + line, "color: #c46c00;", fields);
        else if (c.status === STATUS.INFO) console.info("%c" + line, "color: #477;", fields);
        else if (c.status === STATUS.MANUAL) console.log("%c" + line, "color: #8a6d1d;", fields);
        else console.log("%c" + line, c.status === STATUS.PASS ? "color: green;" : "color: #777;", fields);
      },
      onEnd: function (summary) {
        console.log("\n%c=== 测试完成 ===", "color: blue; font-weight: bold;");
        console.log("总测试数: " + summary.total);
        console.log("%c通过: " + summary.passed, "color: green; font-weight: bold;");
        console.log("%c失败: " + summary.failed, "color: red; font-weight: bold;");
        console.log("%c警告: " + summary.warned, "color: #c46c00; font-weight: bold;");
        console.log("信息: " + summary.info);
        console.log("跳过: " + summary.skipped);
        console.log("人工: " + summary.manual + " (" + summary.durationMs + "ms)");
        if (typeof console.table === "function") {
          var rows = [];
          summary.suites.forEach(function (suite) {
            suite.cases.forEach(function (c) {
              rows.push({
                category: c.category,
                name: c.name,
                status: c.status,
                expected: c.expected,
                actual: c.actual,
                detail: c.detail,
              });
            });
          });
          try {
            console.table(rows);
          } catch (e) {
            /* 某些宿主 console.table 只接受原生数组 */
          }
        }
        console.log(SCTEST_MARKER + " " + stringifyReport(summary));
      },
    };
  }

  // ---------- PanelReporter ----------
  var PANEL_CSS = [
    ":host{all:initial;--sc-bg:#0b1821;--sc-card:#102632;--sc-fg:#eaf3f8;--sc-muted:#8ea9b8;",
    "--sc-muted-bg:#0e202b;--sc-border:#315264;--sc-primary:#72daf9;--sc-success:#65e6ad;",
    "--sc-success-fg:#071c12;--sc-success-bg:#65e6ad;--sc-destructive:#ff7888;",
    "--sc-destructive-fg:#2a060b;--sc-destructive-bg:#ff7888;--sc-warning-bg:#ffc766;--sc-warning-fg:#291700;",
    "--sc-manual-bg:#6b4b1f;--sc-manual-fg:#ffe0a0;--sc-control:#142f3e;--sc-control-hover:#1d4558;",
    "--sc-control-border:#426579;--sc-divider:#203d4c;--sc-detail-bg:#0e202b;--sc-detail-fg:#c3d6df}",
    ".sc-panel{position:fixed;top:12px;right:12px;bottom:auto;width:min(920px,calc(100vw - 24px));",
    "max-height:calc(100dvh - 24px);display:flex;flex-direction:column;overflow:hidden;",
    "border:1px solid var(--sc-border);border-radius:12px;background:var(--sc-bg);color:var(--sc-fg);",
    'box-shadow:0 18px 60px rgba(0,0,0,.42);font:13px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;z-index:2147483647}',
    "[hidden]{display:none!important}",
    ".sc-panel[data-min='1'] .sc-body,.sc-panel[data-min='1'] .sc-sum,",
    ".sc-panel[data-min='1'] .sc-bar,.sc-panel[data-min='1'] .sc-foot{display:none}",
    ".sc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--sc-border);background:var(--sc-card)}",
    ".sc-grip{color:var(--sc-muted);font-size:14px;cursor:move;user-select:none}",
    ".sc-title-wrap{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}",
    ".sc-title{font-weight:750;letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".sc-meta{font-size:11px;color:var(--sc-muted);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".sc-btn{display:inline-flex;min-height:30px;cursor:pointer;align-items:center;justify-content:center;gap:5px;border:1px solid var(--sc-control-border);background:var(--sc-control);color:var(--sc-fg);",
    "border-radius:7px;padding:5px 9px;font-size:11px;font-family:inherit;transition:background .15s,border-color .15s,transform .15s}",
    ".sc-btn:hover{background:var(--sc-control-hover);border-color:var(--sc-primary)}.sc-btn:active{transform:translateY(1px)}",
    ".sc-btn:focus-visible,.sc-segment:focus-visible,.sc-search input:focus-visible{outline:2px solid var(--sc-primary);outline-offset:2px}",
    ".sc-icon-btn{display:inline-flex;width:30px;height:30px;min-height:30px;align-items:center;justify-content:center;border:0;padding:0}",
    ".sc-btn:disabled{cursor:wait;opacity:.55}",
    ".sc-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;line-height:0}",
    ".sc-btn-primary{background:#1d637d;border-color:var(--sc-primary);color:#eaf3f8}.sc-btn-primary:hover{background:#287b99}",
    ".sc-sum{padding:11px 14px;border-bottom:1px solid var(--sc-divider);background:var(--sc-bg);",
    "display:flex;flex-direction:column;gap:10px}",
    ".sc-chips{display:flex;gap:6px;align-items:center;flex-wrap:wrap}",
    ".sc-status-row,.sc-run-row,.sc-toolbar{display:flex;align-items:center;gap:8px}.sc-status-header{flex:none}",
    ".sc-spacer{flex:1}",
    ".sc-status{display:inline-flex;align-items:center;gap:5px;border-radius:9999px;padding:3px 10px;font-weight:600}",
    ".sc-status-pass{background:var(--sc-success-bg);color:var(--sc-success-fg)}",
    ".sc-status-fail{background:var(--sc-destructive-bg);color:var(--sc-destructive-fg)}",
    ".sc-status-warn{background:var(--sc-warning-bg);color:var(--sc-warning-fg)}",
    ".sc-status-info,.sc-status-skip{background:#315264;color:#d9e6ec}",
    ".sc-status-manual{background:var(--sc-manual-bg);color:var(--sc-manual-fg)}",
    ".sc-chip{display:inline-flex;align-items:center;gap:4px;border-radius:9999px;padding:3px 9px;font-size:11px;font-weight:500}",
    ".sc-chip-pass{background:var(--sc-success-bg);color:var(--sc-success-fg)}",
    ".sc-chip-fail{background:var(--sc-destructive-bg);color:var(--sc-destructive-fg)}",
    ".sc-chip-warn{background:var(--sc-warning-bg);color:var(--sc-warning-fg)}",
    ".sc-chip-info,.sc-chip-skip{background:#315264;color:#d9e6ec}",
    ".sc-chip-manual{background:var(--sc-manual-bg);color:var(--sc-manual-fg)}",
    ".sc-progress{height:6px;border-radius:9999px;background:#315264;overflow:hidden;display:flex;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}",
    ".sc-progress i{display:block;height:6px}",
    ".sc-diagnostic-hint{padding:9px 14px;color:#a9c0cc;background:var(--sc-detail-bg);border-bottom:1px solid var(--sc-divider);font-size:11px}",
    ".sc-toolbar{padding:8px 14px;border-bottom:1px solid var(--sc-divider);background:var(--sc-bg);flex-wrap:wrap}",
    ".sc-segments{display:flex;min-width:0;gap:2px;padding:2px;border-radius:6px;background:var(--sc-detail-bg);overflow:auto}",
    ".sc-segment{cursor:pointer;border:0;border-radius:4px;padding:3px 10px;background:transparent;color:var(--sc-muted);font:inherit;font-size:11px;white-space:nowrap}",
    ".sc-segment[data-active='1']{background:var(--sc-control);color:var(--sc-fg);font-weight:600}",
    ".sc-search{display:flex;min-width:160px;flex:1;align-items:center;gap:6px;border:1px solid var(--sc-control-border);border-radius:7px;padding:4px 8px;background:var(--sc-control);color:var(--sc-muted)}",
    ".sc-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--sc-fg);font:inherit;font-size:11px}",
    ".sc-body{max-height:calc(100dvh - 265px);overflow:auto;flex:1;background:var(--sc-bg)}",
    ".sc-table-head{display:grid;grid-template-columns:58px minmax(0,23%) minmax(0,17%) minmax(0,17%) minmax(0,1fr);",
    "position:sticky;top:0;z-index:2;padding:8px 9px;color:var(--sc-primary);background:var(--sc-card);border-bottom:1px solid var(--sc-divider);font-size:11px;font-weight:700}",
    ".sc-table-head span{min-width:0;overflow-wrap:anywhere}",
    ".sc-suite{display:flex;align-items:center;gap:7px;padding:9px 14px;background:var(--sc-muted-bg);",
    "border-top:1px solid var(--sc-divider);color:var(--sc-primary);font-weight:750;cursor:pointer;transition:background .15s}",
    ".sc-suite:hover{background:#122d3a}.sc-suite:focus-visible{outline:2px solid var(--sc-primary);outline-offset:-2px}",
    ".sc-suite .sc-suite-name{flex:1}",
    ".sc-suite-stat{border-radius:9999px;padding:2px 8px;background:var(--sc-success-bg);color:var(--sc-success-fg);font-size:11px;font-weight:500}",
    ".sc-suite-stat[data-failed='1']{background:var(--sc-destructive-bg);color:var(--sc-destructive-fg)}",
    ".sc-suite-stat[data-manual='1']{display:inline-flex;align-items:center;gap:4px;background:var(--sc-warning-bg);color:var(--sc-warning-fg)}",
    ".sc-case{display:flex;align-items:center;gap:8px;padding:8px 14px 6px 34px;background:var(--sc-bg);border-left:2px solid transparent;transition:background .15s}",
    ".sc-case:hover{background:#0e202b}.sc-case>b{color:var(--sc-primary);font-size:13px;font-weight:700}.sc-case-toggle{flex:none;width:22px;height:22px;min-height:22px;border:0;border-radius:5px;padding:0;background:transparent;color:var(--sc-muted);cursor:pointer}.sc-case-toggle:hover{background:var(--sc-control);color:var(--sc-fg)}.sc-case-toggle:focus-visible{outline:2px solid var(--sc-primary);outline-offset:1px}",
    ".sc-case span{flex:1}",
    ".sc-case-label{min-width:0;display:flex;flex-direction:column;gap:2px}",
    ".sc-case-category{color:var(--sc-muted);font-size:10px;font-weight:400}",
    ".sc-case-status{font-size:10px;font-style:normal;font-weight:700}",
    ".sc-case-manual{background:#352c1e;border-left-color:var(--sc-warning-bg)}",
    ".sc-manual-pass{width:30px;height:30px;min-height:30px;padding:0;border-color:var(--sc-success);background:#1d4938;color:var(--sc-success)}",
    ".sc-manual-fail{width:30px;height:30px;min-height:30px;padding:0;border-color:var(--sc-destructive);background:#54252c;color:var(--sc-destructive)}",
    ".sc-dur{font-size:11px;color:var(--sc-muted)}",
    ".sc-detail{display:grid;grid-template-columns:max-content minmax(0,1fr) max-content minmax(0,1fr);gap:5px 10px;margin:0 14px 8px 34px;padding:8px 10px;border-radius:6px;border-left:2px solid var(--sc-border);",
    "background:var(--sc-detail-bg);color:var(--sc-detail-fg);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;overflow-wrap:anywhere}",
    ".sc-detail-field{display:contents}.sc-detail-key{color:var(--sc-primary);font-family:system-ui,sans-serif;font-weight:700}.sc-detail-value{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}",
    ".sc-detail-wide{grid-column:1/-1}.sc-hint{display:flex;gap:6px;margin:0 14px 8px 34px;padding:7px 10px;border-radius:6px;background:var(--sc-muted-bg);",
    "color:var(--sc-muted);font-size:11px}",
    ".sc-params{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--sc-divider)}",
    ".sc-params-label{font-weight:600}",
    ".sc-field{display:flex;min-width:0;flex:1;align-items:center;gap:6px;color:var(--sc-muted);white-space:nowrap}",
    ".sc-field-compact{flex:0 0 108px}",
    ".sc-params input{min-width:0;flex:1;border:1px solid var(--sc-border);border-radius:6px;padding:3px 8px;",
    "background:var(--sc-control);color:var(--sc-fg);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}",
    ".sc-empty{display:flex;min-height:120px;align-items:center;justify-content:center;flex-direction:column;gap:9px;padding:24px;color:var(--sc-muted);text-align:center}.sc-empty .sc-btn{font-size:11px}",
    ".sc-foot{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid var(--sc-divider);background:var(--sc-muted-bg)}",
    ".sc-foot .sc-sumline{min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;color:var(--sc-muted);overflow-wrap:anywhere}",
    ".sc-foot-note{grid-column:1/-1;color:var(--sc-muted);font-size:10px;overflow-wrap:anywhere}.sc-foot-actions{display:flex;gap:6px;align-items:center}",
    "@media (max-width:720px){.sc-panel{top:8px;right:8px;width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}.sc-head{display:grid;grid-template-columns:24px minmax(0,1fr) 66px 66px 30px;align-items:center;gap:8px}.sc-grip{grid-column:1;grid-row:1}.sc-title-wrap{grid-column:2/6;grid-row:1;order:initial;flex-basis:auto}.sc-status-header{grid-column:1/3;grid-row:2;order:initial}.sc-head .sc-btn{grid-row:2;order:initial}.sc-head .sc-btn:not(.sc-icon-btn):not(.sc-min-btn){grid-column:3}.sc-head .sc-btn.sc-min-btn{grid-column:4}.sc-head .sc-btn.sc-close-btn{grid-column:5}.sc-toolbar{align-items:stretch}.sc-segments{max-width:100%;flex-basis:100%}.sc-search{flex-basis:100%;min-height:30px}.sc-table-head{grid-template-columns:48px minmax(0,1fr)}.sc-table-head span:nth-child(n+3){display:none}.sc-detail{grid-template-columns:max-content minmax(0,1fr)}.sc-detail-wide{grid-column:1/-1}.sc-foot{grid-template-columns:1fr}.sc-foot-actions{grid-column:1/-1}.sc-foot-actions .sc-btn{flex:1}.sc-foot-note{grid-column:1/-1}}",
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

  var ICONS = { PASS: "✓", FAIL: "✗", WARN: "△", INFO: "ⓘ", SKIP: "○", MANUAL: "✋" };

  function createPanelReporter(runInfo) {
    if (typeof document === "undefined" || !document.documentElement) return null;

    var host = document.getElementById("sctest-panel-host");
    if (host) host.remove();
    host = document.createElement("div");
    host.id = "sctest-panel-host";
    host.style.all = "unset";
    document.documentElement.appendChild(host);

    var root = host.attachShadow({ mode: "open" });
    installPanelStyles(root, PANEL_CSS);

    var panel = document.createElement("div");
    panel.className = "sc-panel";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "SCTest 诊断报告");
    root.appendChild(panel);

    var state = { pass: 0, fail: 0, warn: 0, info: 0, skip: 0, manual: 0, total: 0, durationMs: 0, complete: false };
    var caseNodes = {};
    var suiteNodes = {};
    var activeFilter = "all";
    var latestSummary = null;

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
      "clipboard-copy":
        "M9 5h6M9 3h6v4H9zM15 11h5v5M20 11l-7 7M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2M16 3h2a2 2 0 0 1 2 2v3",
      braces:
        "M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1",
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
    grip.title = "拖动面板";
    grip.setAttribute("aria-label", "拖动面板");
    head.appendChild(grip);
    var titleWrap = el("div", "sc-title-wrap");
    var title = el("div", "sc-title", runInfo.name);
    var environment = runInfo.environment || {};
    var metaParts = [runInfo.context];
    if (environment.manager) metaParts.push(environment.manager);
    if (environment.url) metaParts.push(environment.url);
    var meta = el("div", "sc-meta", metaParts.join(" · "));
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    head.appendChild(titleWrap);
    var statusPill = el("span", "sc-status sc-status-pass sc-status-header", "等待运行");
    statusPill.setAttribute("data-sctest", "status-pill");
    statusPill.setAttribute("role", "status");
    statusPill.setAttribute("aria-live", "polite");
    head.appendChild(statusPill);
    var rerunBtn = el("button", "sc-btn");
    setIconLabel(rerunBtn, "rotate-cw", "重跑", 13);
    rerunBtn.title = "重新运行";
    rerunBtn.setAttribute("aria-label", "重新运行");
    rerunBtn.addEventListener("click", function () {
      if (typeof runInfo.onRerun === "function") runInfo.onRerun();
    });
    head.appendChild(rerunBtn);
    var minBtn = el("button", "sc-btn sc-min-btn");
    setIconLabel(minBtn, "minus", "收起", 13);
    minBtn.title = "最小化";
    minBtn.setAttribute("aria-label", "最小化");
    minBtn.addEventListener("click", function () {
      panel.dataset.min = panel.dataset.min === "1" ? "0" : "1";
      setIconLabel(minBtn, "minus", panel.dataset.min === "1" ? "展开" : "收起", 13);
    });
    head.appendChild(minBtn);
    var closeBtn = el("button", "sc-btn sc-icon-btn sc-close-btn");
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
    var duration = el("span", "sc-dur", "0ms");
    duration.setAttribute("data-sctest", "duration");
    statusRow.appendChild(el("span", "sc-spacer"));
    statusRow.appendChild(icon("timer", 13));
    statusRow.appendChild(duration);
    sum.appendChild(statusRow);
    var chips = el("div", "sc-chips");
    var chipPass = el("span", "sc-chip sc-chip-pass", "PASS 0");
    var chipFail = el("span", "sc-chip sc-chip-fail", "FAIL 0");
    var chipWarn = el("span", "sc-chip sc-chip-warn", "WARN 0");
    var chipInfo = el("span", "sc-chip sc-chip-info", "INFO 0");
    var chipSkip = el("span", "sc-chip sc-chip-skip", "SKIP 0");
    var chipManual = el("span", "sc-chip sc-chip-manual", "MANUAL 0");
    var chipTotal = el("span", "sc-chip sc-chip-skip", "共 0");
    chipTotal.setAttribute("data-sctest", "total-chip");
    [
      [chipPass, "check"],
      [chipFail, "x"],
      [chipWarn, "info"],
      [chipInfo, "info"],
      [chipSkip, "minus"],
      [chipManual, "hand"],
      [chipTotal, "hash"],
    ].forEach(function (entry) {
      entry[0].insertBefore(icon(entry[1], 11), entry[0].firstChild);
    });
    chips.setAttribute("data-sctest", "counters");
    chips.appendChild(chipPass);
    chips.appendChild(chipFail);
    chips.appendChild(chipWarn);
    chips.appendChild(chipInfo);
    chips.appendChild(chipSkip);
    chips.appendChild(chipManual);
    chips.appendChild(chipTotal);
    var progress = el("div", "sc-progress");
    progress.setAttribute("data-sctest", "progress");
    var barPass = el("i");
    barPass.style.background = "var(--sc-success)";
    barPass.setAttribute("data-sctest", "progress-pass");
    var barFail = el("i");
    barFail.style.background = "var(--sc-destructive)";
    barFail.setAttribute("data-sctest", "progress-fail");
    var barWarn = el("i");
    barWarn.style.background = "var(--sc-warning-fg)";
    barWarn.setAttribute("data-sctest", "progress-warn");
    var barInfo = el("i");
    barInfo.style.background = "var(--sc-primary)";
    barInfo.setAttribute("data-sctest", "progress-info");
    var barSkip = el("i");
    barSkip.style.background = "var(--sc-muted)";
    barSkip.setAttribute("data-sctest", "progress-skip");
    var barManual = el("i");
    barManual.style.background = "var(--sc-warning-bg)";
    barManual.setAttribute("data-sctest", "progress-manual");
    progress.appendChild(barPass);
    progress.appendChild(barFail);
    progress.appendChild(barWarn);
    progress.appendChild(barInfo);
    progress.appendChild(barSkip);
    progress.appendChild(barManual);
    sum.appendChild(progress);
    sum.appendChild(chips);
    panel.appendChild(sum);
    var diagnosticHint = el(
      "div",
      "sc-diagnostic-hint",
      "先看 FAIL：表示断言未满足；再看 WARN：表示可选能力或环境差异；INFO 是环境观察；SKIP 表示当前环境不提供；MANUAL 必须由人类操作后裁决。"
    );
    diagnosticHint.setAttribute("data-sctest", "diagnostic-hint");
    panel.appendChild(diagnosticHint);

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
    var resetBtn = el("button", "sc-btn", "重置视图");
    resetBtn.insertBefore(icon("rotate-ccw", 12), resetBtn.firstChild);
    resetBtn.setAttribute("data-sctest", "reset");
    resetBtn.title = "重置筛选和折叠状态";
    resetBtn.setAttribute("aria-label", "重置筛选和折叠状态");
    var queueChip = el("span", "sc-chip sc-chip-skip", "待跑 " + manualSuites.length);
    queueChip.insertBefore(icon("list-todo", 11), queueChip.firstChild);
    queueChip.setAttribute("data-sctest", "queue-chip");
    if (runInfo.runnable === false) {
      runAllBtn.hidden = true;
      queueChip.hidden = true;
    }
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
        var field = el(
          "label",
          "sc-field" + (index === paramKeys.length - 1 && paramKeys.length > 1 ? " sc-field-compact" : "")
        );
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
    var filterWarn = el("button", "sc-segment", "警告");
    var filterInfo = el("button", "sc-segment", "信息");
    var filterSkip = el("button", "sc-segment", "跳过");
    var filterManual = el("button", "sc-segment", "人工");
    filterAll.dataset.active = "1";
    [
      [filterAll, "显示全部结果"],
      [filterFail, "只显示失败结果"],
      [filterWarn, "只显示警告结果"],
      [filterInfo, "只显示信息结果"],
      [filterSkip, "只显示跳过结果"],
      [filterManual, "只显示待人工结果"],
    ].forEach(function (entry) {
      entry[0].setAttribute("aria-label", entry[1]);
      entry[0].setAttribute("aria-pressed", entry[0] === filterAll ? "true" : "false");
    });
    filterAll.setAttribute("data-sctest", "filter-all");
    filterFail.setAttribute("data-sctest", "filter-fail");
    filterWarn.setAttribute("data-sctest", "filter-warn");
    filterInfo.setAttribute("data-sctest", "filter-info");
    filterSkip.setAttribute("data-sctest", "filter-skip");
    filterManual.setAttribute("data-sctest", "filter-manual");
    segments.appendChild(filterAll);
    segments.appendChild(filterFail);
    segments.appendChild(filterWarn);
    segments.appendChild(filterInfo);
    segments.appendChild(filterSkip);
    segments.appendChild(filterManual);
    var searchWrap = el("label", "sc-search");
    searchWrap.setAttribute("data-sctest", "search");
    searchWrap.appendChild(icon("search", 12));
    var search = document.createElement("input");
    search.placeholder = "筛选用例…";
    search.setAttribute("aria-label", "筛选用例");
    searchWrap.appendChild(search);
    var toolbarCopy = el("button", "sc-btn");
    setIconLabel(toolbarCopy, "copy", "复制 JSON", 13);
    toolbarCopy.title = "复制报告";
    toolbarCopy.setAttribute("data-sctest", "copy-report");
    var collapseAll = el("button", "sc-btn sc-icon-btn");
    collapseAll.appendChild(icon("chevrons-down-up", 13));
    collapseAll.title = "全部折叠";
    collapseAll.setAttribute("aria-label", "全部折叠");
    collapseAll.setAttribute("data-sctest", "collapse-all");
    toolbar.appendChild(segments);
    toolbar.appendChild(searchWrap);
    toolbar.appendChild(toolbarCopy);
    toolbar.appendChild(collapseAll);
    panel.appendChild(toolbar);

    var body = el("div", "sc-body");
    var diagnosticTable = el("div", "sc-table-head");
    diagnosticTable.setAttribute("data-sctest", "diagnostic-table");
    diagnosticTable.setAttribute("role", "row");
    ["状态", "检查", "实际", "预期", "说明"].forEach(function (label) {
      var column = el("span", null, label);
      column.setAttribute("role", "columnheader");
      diagnosticTable.appendChild(column);
    });
    body.appendChild(diagnosticTable);
    var emptyState = el("div", "sc-empty", "没有符合当前筛选的结果");
    emptyState.setAttribute("data-sctest", "empty-state");
    emptyState.setAttribute("role", "status");
    emptyState.setAttribute("aria-live", "polite");
    var emptyReset = el("button", "sc-btn", "清除筛选");
    emptyReset.setAttribute("data-sctest", "empty-reset");
    emptyState.appendChild(emptyReset);
    body.appendChild(emptyState);
    panel.appendChild(body);

    var foot = el("div", "sc-foot");
    foot.setAttribute("data-sctest", "footer");
    var sumLine = el("div", "sc-sumline", "");
    sumLine.setAttribute("data-sctest", "summary-line");
    foot.appendChild(sumLine);
    var footerNote = el("span", "sc-foot-note", "expected / actual / detail 来自同一份 sctest/v1 结果协议");
    footerNote.setAttribute("data-sctest", "footer-note");
    footerNote.title = "Console、Shadow DOM Panel、GM_log 和 JSON 使用同一份结果记录";
    foot.appendChild(footerNote);
    var footActions = el("div", "sc-foot-actions");
    var copyBtn = el("button", "sc-btn", "复制报告");
    copyBtn.insertBefore(icon("clipboard-copy", 12), copyBtn.firstChild);
    copyBtn.setAttribute("data-sctest", "footer-copy-report");
    footActions.appendChild(copyBtn);
    var jsonBtn = el("button", "sc-btn", "JSON");
    jsonBtn.insertBefore(icon("braces", 12), jsonBtn.firstChild);
    jsonBtn.setAttribute("data-sctest", "export-json");
    footActions.appendChild(jsonBtn);
    foot.appendChild(footActions);
    panel.appendChild(foot);

    function reportText() {
      var lines = [sumLine.textContent];
      Object.keys(caseNodes).forEach(function (key) {
        var node = caseNodes[key];
        lines.push(
          (ICONS[node.status] || "○") +
            " [" +
            node.status +
            "] " +
            key.replace("//", " › ") +
            (node.result ? formatDetails(node.result) : "")
        );
      });
      return lines.join("\n");
    }

    function reportJson() {
      var cases = Object.keys(caseNodes).map(function (key) {
        var node = caseNodes[key];
        return node.result || { suite: node.suite, name: key.slice(key.indexOf("//") + 2), status: node.status };
      });
      return {
        protocol: "sctest/v1",
        name: runInfo.name,
        context: runInfo.context,
        environment: runInfo.environment || (latestSummary && latestSummary.environment) || createEnvironment(runInfo.context),
        summary: {
          total: state.total,
          passed: state.pass,
          failed: state.fail,
          warned: state.warn,
          info: state.info,
          skipped: state.skip,
          manual: state.manual,
          counts: {
            PASS: state.pass,
            FAIL: state.fail,
            WARN: state.warn,
            INFO: state.info,
            SKIP: state.skip,
            MANUAL: state.manual,
          },
          overall: overallStatus(state),
          durationMs: state.durationMs,
        },
        cases: cases,
      };
    }

    function fallbackCopy(text) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      document.documentElement.appendChild(textarea);
      textarea.select();
      var result = safe(function () {
        return document.execCommand("copy");
      });
      textarea.remove();
      return result.ok && result.value !== false;
    }

    function copyText(text) {
      var clipboard = safe(function () {
        return navigator.clipboard;
      });
      if (clipboard.ok && clipboard.value && typeof clipboard.value.writeText === "function") {
        var write = safe(function () {
          return clipboard.value.writeText(text);
        });
        if (write.ok) {
          return Promise.resolve(write.value).then(
            function () {
              return true;
            },
            function () {
              return fallbackCopy(text);
            }
          );
        }
      }
      return Promise.resolve(fallbackCopy(text));
    }

    function copyWithFeedback(button, text, iconName, label) {
      button.disabled = true;
      return copyText(text)
        .then(function (copied) {
          setIconLabel(button, copied ? "check" : "x", copied ? "已复制" : "复制失败", 12);
          setTimeout(function () {
            setIconLabel(button, iconName, label, 12);
          }, 1200);
          return copied;
        })
        .finally(function () {
          button.disabled = false;
        });
    }

    copyBtn.addEventListener("click", function () {
      return copyWithFeedback(copyBtn, reportText(), "clipboard-copy", "复制报告");
    });
    toolbarCopy.addEventListener("click", function () {
      return copyWithFeedback(toolbarCopy, stringifyReport(reportJson(), 2), "copy", "复制 JSON");
    });
    jsonBtn.addEventListener("click", function () {
      return copyWithFeedback(jsonBtn, stringifyReport(reportJson(), 2), "braces", "JSON");
    });
    emptyReset.addEventListener("click", function () {
      resetBtn.click();
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
      var visibleCases = 0;
      Object.keys(caseNodes).forEach(function (key) {
        var node = caseNodes[key];
        var statusOk =
          activeFilter === "all" ||
          node.status === activeFilter ||
          (activeFilter === "skip" && node.status === STATUS.SKIP) ||
          (activeFilter === "manual" && node.status === STATUS.MANUAL);
        var textOk = !query || node.searchText.indexOf(query) !== -1;
        node.row.hidden = !(statusOk && textOk);
        if (!node.row.hidden) visibleCases++;
        if (node.detail) node.detail.hidden = node.row.hidden || !node.detailExpanded;
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
      emptyState.hidden = visibleCases !== 0;
    }

    [
      [filterAll, "all"],
      [filterFail, STATUS.FAIL],
      [filterWarn, STATUS.WARN],
      [filterInfo, STATUS.INFO],
      [filterSkip, STATUS.SKIP],
      [filterManual, STATUS.MANUAL],
    ].forEach(function (entry) {
      entry[0].addEventListener("click", function () {
        activeFilter = entry[1];
        [filterAll, filterFail, filterWarn, filterInfo, filterSkip, filterManual].forEach(function (button) {
          button.dataset.active = button === entry[0] ? "1" : "0";
          button.setAttribute("aria-pressed", button === entry[0] ? "true" : "false");
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
      collapseAll.setAttribute("aria-label", shouldCollapse ? "全部展开" : "全部折叠");
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

    function updateDetailToggle(node) {
      if (!node.detailToggle) return;
      node.detailToggle.textContent = "";
      node.detailToggle.appendChild(icon(node.detailExpanded ? "chevron-down" : "chevron-right", 12));
      node.detailToggle.setAttribute("aria-expanded", node.detailExpanded ? "true" : "false");
      node.detailToggle.title = node.detailExpanded ? "收起诊断详情" : "展开诊断详情";
      node.detailToggle.setAttribute("aria-label", node.detailExpanded ? "收起诊断详情" : "展开诊断详情");
    }

    function recount() {
      setIconLabel(chipPass, "check", "PASS " + state.pass, 11);
      setIconLabel(chipFail, "x", "FAIL " + state.fail, 11);
      setIconLabel(chipWarn, "info", "WARN " + state.warn, 11);
      setIconLabel(chipInfo, "info", "INFO " + state.info, 11);
      setIconLabel(chipSkip, "minus", "SKIP " + state.skip, 11);
      setIconLabel(chipManual, "hand", "MANUAL " + state.manual, 11);
      setIconLabel(chipTotal, "hash", "共 " + state.total, 11);
      var total = state.total || 1;
      barPass.style.width = (state.pass / total) * 100 + "%";
      barFail.style.width = (state.fail / total) * 100 + "%";
      barWarn.style.width = (state.warn / total) * 100 + "%";
      barInfo.style.width = (state.info / total) * 100 + "%";
      barSkip.style.width = (state.skip / total) * 100 + "%";
      barManual.style.width = (state.manual / total) * 100 + "%";
      statusPill.className =
        "sc-status sc-status-header " +
        (state.fail
          ? "sc-status-fail"
          : state.manual
            ? "sc-status-manual"
            : state.warn
              ? "sc-status-warn"
              : state.complete && state.skip
                ? "sc-status-info"
                : "sc-status-pass");
      setIconLabel(
        statusPill,
        state.fail
          ? "circle-x"
          : state.manual
            ? "hand"
            : state.warn
              ? "info"
              : state.complete && state.skip
                ? "minus"
                : "check",
        state.fail
          ? state.fail + " 项失败"
          : state.manual
            ? state.manual + " 项待人工确认"
            : state.warn
              ? state.warn + " 项警告"
              : !state.total
                ? "等待运行"
                : state.complete && state.skip
                  ? "已完成 · " + state.skip + " 项跳过"
                  : state.complete
                    ? "全部通过"
                    : "运行中",
        13
      );
      duration.textContent = state.durationMs + "ms";
      setIconLabel(queueChip, "list-todo", "待跑 " + state.skip, 11);
      sumLine.textContent =
        "总测试数: " +
        state.total +
        " · 通过: " +
        state.pass +
        " · 失败: " +
        state.fail +
        " · 警告: " +
        state.warn +
        " · 信息: " +
        state.info +
        " · 跳过: " +
        state.skip +
        " · 人工: " +
        state.manual;
      Object.keys(suiteNodes).forEach(function (name) {
        var suiteNode = suiteNodes[name];
        var passed = 0;
        var failed = 0;
        var suiteTotal = 0;
        Object.keys(caseNodes).forEach(function (key) {
          var node = caseNodes[key];
          if (node.suite !== name) return;
          suiteTotal++;
          if (node.status === STATUS.PASS) passed++;
          if (node.status === STATUS.FAIL) failed++;
        });
        if (suiteNode.manualTotal) {
          var manualPending = Object.keys(caseNodes).filter(function (key) {
            return caseNodes[key].suite === name && caseNodes[key].status === STATUS.MANUAL;
          }).length;
          var manualFailed = Object.keys(caseNodes).filter(function (key) {
            var result = caseNodes[key].result || {};
            return caseNodes[key].suite === name && caseNodes[key].status === STATUS.FAIL && result.manualVerdict === STATUS.FAIL;
          }).length;
          suiteNode.stat.dataset.manual = manualPending ? "1" : "0";
          suiteNode.stat.dataset.failed = manualFailed || failed ? "1" : "0";
          if (manualFailed) {
            setIconLabel(suiteNode.stat, "x", "人工失败 " + manualFailed + " / " + suiteNode.manualTotal, 10);
          } else if (manualPending) {
            setIconLabel(suiteNode.stat, "hand", "待人工 " + manualPending + " / " + suiteNode.manualTotal, 10);
          } else if (failed) {
            setIconLabel(suiteNode.stat, "x", "自动失败 " + failed + " · 人工已确认", 10);
          } else {
            setIconLabel(suiteNode.stat, "check", "已确认 " + suiteNode.manualTotal + " / " + suiteNode.manualTotal, 10);
          }
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
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-expanded", "true");
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
      function toggleSuite() {
        suiteNodes[name].collapsed = !suiteNodes[name].collapsed;
        group.hidden = suiteNodes[name].collapsed;
        row.setAttribute("aria-expanded", group.hidden ? "false" : "true");
        chevron.textContent = "";
        chevron.appendChild(icon(group.hidden ? "chevron-right" : "chevron-down", 13));
      }
      row.addEventListener("click", toggleSuite);
      row.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleSuite();
        }
      });
      suiteNodes[name] = {
        row: row,
        group: group,
        stat: stat,
        chevron: chevron,
        manualTotal: manualTotal,
        collapsed: false,
      };
      return suiteNodes[name];
    }

    function applyStatus(c, node) {
      var statusIcon =
        c.status === STATUS.PASS
          ? "check"
          : c.status === STATUS.FAIL
            ? "x"
            : c.status === STATUS.MANUAL
              ? "hand"
              : c.status === STATUS.SKIP
                ? "minus"
                : "info";
      node.icon.textContent = "";
      node.icon.appendChild(icon(statusIcon, 13));
      node.statusLabel.textContent = c.status;
      node.statusLabel.className = "sc-case-status sc-status-" + c.status.toLowerCase();
      node.dur.textContent = c.status === STATUS.MANUAL ? "人工" : c.durationMs + "ms";
      updateDetailToggle(node);
    }

    // 每条结果都显示诊断字段，保持附件中的“实际/预期/说明”阅读顺序；
    // 挂在 node.detail 上以便重跑时替换旧结果，而不是无限追加。
    function renderDetail(node, c) {
      if (node.detail) {
        node.detail.remove();
        node.detail = null;
      }
      var detail = el("div", "sc-detail");
      detail.setAttribute(
        "data-sctest",
        c.status === STATUS.FAIL ? "failure-detail" : c.status === STATUS.SKIP ? "skip-reason" : "diagnostic-detail"
      );

      function addField(label, value, dataName, wide) {
        var field = el("span", "sc-detail-field" + (wide ? " sc-detail-wide" : ""));
        field.appendChild(el("span", "sc-detail-key", label));
        var displayValue = value == null || value === "" ? "-" : typeof value === "string" ? value : stringify(value);
        var valueNode = el("span", "sc-detail-value", displayValue);
        if (dataName) valueNode.setAttribute("data-sctest", dataName);
        field.appendChild(valueNode);
        detail.appendChild(field);
      }

      addField("实际", c.actual, "actual-value", false);
      addField("预期", c.expected, "expected-value", false);
      addField("说明", c.detail, "detail-value", true);
      if (c.error) addField("错误", c.error, "error-value", true);
      node.row.parentNode.insertBefore(detail, node.row.nextSibling);
      node.detail = detail;
      updateDetailToggle(node);
      detail.hidden = node.row.hidden || !node.detailExpanded;
    }

    function removeManualControls(node) {
      if (node.manualPass) node.manualPass.remove();
      if (node.manualFail) node.manualFail.remove();
      node.manualPass = null;
      node.manualFail = null;
    }

    function attachManualControls(node, c) {
      if (node.manualPass) return;
      var pass = el("button", "sc-btn sc-icon-btn sc-manual-pass");
      pass.appendChild(icon("check", 12));
      pass.title = "人工确认通过";
      pass.setAttribute("aria-label", "人工确认通过");
      pass.setAttribute("data-sctest", "manual-pass");
      var fail = el("button", "sc-btn sc-icon-btn sc-manual-fail");
      fail.appendChild(icon("x", 12));
      fail.title = "人工确认失败";
      fail.setAttribute("aria-label", "人工确认失败");
      fail.setAttribute("data-sctest", "manual-fail");

      function settle(ok) {
        removeManualControls(node);
        if (typeof runInfo.onManualVerdict === "function") {
          runInfo.onManualVerdict(
            c.suite,
            c.name,
            ok ? STATUS.PASS : STATUS.FAIL,
            ok ? "人工确认通过" : "人工确认失败"
          );
        } else {
          node.status = ok ? STATUS.PASS : STATUS.FAIL;
          c.status = node.status;
          c.manualVerdict = node.status;
          c.detail = ok ? "人工确认通过" : "人工确认失败";
          applyStatus(c, node);
          recount();
        }
      }
      pass.addEventListener("click", function () {
        settle(true);
      });
      fail.addEventListener("click", function () {
        settle(false);
      });
      node.row.appendChild(pass);
      node.row.appendChild(fail);
      node.manualPass = pass;
      node.manualFail = fail;
    }

    function syncManualControls(node, c) {
      if (c.status === STATUS.MANUAL) {
        node.row.classList.add("sc-case-manual");
        attachManualControls(node, c);
      } else {
        node.row.classList.remove("sc-case-manual");
        removeManualControls(node);
      }
    }

    return {
      panelRoot: root,
      onStart: function () {
        state.complete = false;
        state.total = (runInfo.suites || []).reduce(function (n, s) {
          return n + s.cases.length;
        }, 0);
        recount();
      },
      onCase: function (c) {
        state.complete = false;
        var key = c.suite + "//" + c.name;
        var existing = caseNodes[key];
        if (existing) {
          var previousStatus = existing.status;
          if (existing.status === STATUS.PASS) state.pass--;
          else if (existing.status === STATUS.FAIL) state.fail--;
          else if (existing.status === STATUS.WARN) state.warn--;
          else if (existing.status === STATUS.INFO) state.info--;
          else if (existing.status === STATUS.SKIP) state.skip--;
          else if (existing.status === STATUS.MANUAL) state.manual--;
          existing.status = c.status;
          existing.result = c;
          existing.searchText = [c.suite, c.category, c.name, c.expected, c.actual, c.detail, c.error, c.hint]
            .map(function (value) {
              return value == null ? "" : stringify(value);
            })
            .join(" ")
            .toLowerCase();
          if (c.status === STATUS.FAIL || c.status === STATUS.WARN || c.status === STATUS.MANUAL) {
            existing.detailExpanded = true;
          } else if (previousStatus !== c.status) {
            existing.detailExpanded = false;
          }
          applyStatus(c, existing);
          renderDetail(existing, c);
          syncManualControls(existing, c);
          if (c.status === STATUS.PASS) state.pass++;
          else if (c.status === STATUS.FAIL) state.fail++;
          else if (c.status === STATUS.WARN) state.warn++;
          else if (c.status === STATUS.INFO) state.info++;
          else if (c.status === STATUS.SKIP) state.skip++;
          else if (c.status === STATUS.MANUAL) state.manual++;
          recount();
          return;
        }
        var suite = ensureSuite(c.suite);
        var row = el("div", "sc-case" + (c.status === STATUS.MANUAL ? " sc-case-manual" : ""));
        row.setAttribute("data-sctest", "case-row");
        var caseIcon = el("b", null, ICONS[c.status] || "○");
        var detailToggle = el("button", "sc-case-toggle");
        detailToggle.setAttribute("data-sctest", "toggle-detail");
        detailToggle.addEventListener("click", function (event) {
          event.stopPropagation();
          node.detailExpanded = !node.detailExpanded;
          updateDetailToggle(node);
          applyFilters();
        });
        var label = el("span", "sc-case-label");
        label.appendChild(el("span", null, c.name));
        label.appendChild(el("small", "sc-case-category", c.category || c.suite));
        var statusLabel = el("strong", "sc-case-status", c.status);
        var dur = el("i", "sc-dur", c.status === STATUS.MANUAL ? "人工" : c.durationMs + "ms");
        row.appendChild(caseIcon);
        row.appendChild(detailToggle);
        row.appendChild(label);
        row.appendChild(statusLabel);
        row.appendChild(dur);
        suite.group.appendChild(row);
        var node = {
          row: row,
          icon: caseIcon,
          statusLabel: statusLabel,
          dur: dur,
          status: c.status,
          suite: c.suite,
          result: c,
          detail: null,
          hint: null,
          detailToggle: detailToggle,
          detailExpanded: c.status === STATUS.FAIL || c.status === STATUS.WARN || c.status === STATUS.MANUAL,
          searchText: "",
          manualPass: null,
          manualFail: null,
        };
        caseNodes[key] = node;
        state.total = Math.max(state.total, Object.keys(caseNodes).length);

        if (c.status === STATUS.FAIL) {
          state.fail++;
        } else if (c.status === STATUS.PASS) {
          state.pass++;
        } else if (c.status === STATUS.WARN) {
          state.warn++;
        } else if (c.status === STATUS.INFO) {
          state.info++;
        } else if (c.status === STATUS.SKIP) {
          state.skip++;
        } else if (c.status === STATUS.MANUAL) {
          state.manual++;
        }
        node.searchText = [c.suite, c.category, c.name, c.expected, c.actual, c.detail, c.error, c.hint]
          .map(function (value) {
            return value == null ? "" : stringify(value);
          })
          .join(" ")
          .toLowerCase();
        renderDetail(node, c);

        if (c.status === STATUS.MANUAL) {
          syncManualControls(node, c);
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
        latestSummary = summary;
        state.complete = true;
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
    var framePolicy = opts.framePolicy || "top";

    if (wantPanel) {
      if (framePolicy === "all" || isTopLevelFrame()) {
        var panel = createPanelReporter(runInfo);
        if (panel) reporters.push(panel);
        else wantLog = true;
      } else {
        wantLog = true;
      }
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
        var status = normalizeStatus(c.status);
        if (status === STATUS.PASS) {
          emitLog("✓ [PASS] " + c.suite + " › " + c.name + formatDetails(c), "info", {
            sctest: "case",
            status: status,
            ms: c.durationMs,
          });
        } else if (status === STATUS.FAIL) {
          emitLog("✗ [FAIL] " + c.suite + " › " + c.name + formatDetails(c), "error", {
            sctest: "case",
            status: status,
            suite: c.suite,
          });
        } else {
          var level = status === STATUS.INFO ? "info" : status === STATUS.WARN ? "warn" : "warn";
          emitLog("○ [" + status + "] " + c.suite + " › " + c.name + formatDetails(c), level, {
            sctest: "case",
            status: status,
          });
        }
      },
      onEnd: function (summary) {
        emitLog(
          "■ 总测试数: " +
            summary.total +
            "  PASS: " +
            summary.passed +
            "  FAIL: " +
            summary.failed +
            "  WARN: " +
            summary.warned +
            "  INFO: " +
            summary.info +
            "  SKIP: " +
            summary.skipped +
            "  MANUAL: " +
            summary.manual +
            "  (" +
            summary.durationMs +
            "ms)",
          "info",
          { sctest: "summary", passed: summary.passed, failed: summary.failed, status: summary.overall }
        );
      },
    };
  }

  function formatDetails(c) {
    function display(value) {
      return typeof value === "string" ? value : formatValue(value);
    }
    var details = [];
    if (c.error) details.push("error=" + display(c.error));
    if (c.expected != null) details.push("expected=" + stringify(c.expected));
    if (c.actual != null) details.push("actual=" + stringify(c.actual));
    if (c.detail) details.push("detail=" + display(c.detail));
    return details.length ? " — " + details.join("; ") : "";
  }

  var api = {
    create: create,
    createReportSession: createReportSession,
    safe: safe,
    read: read,
    formatValue: formatValue,
    formatError: formatError,
    UNAVAILABLE: UNAVAILABLE,
    skip: function (reason) {
      throw new SkipSignal(reason);
    },
    STATUS: STATUS,
    MARKER: SCTEST_MARKER,
    __detectContext: detectContext,
    __buildReporters: buildReporters,
    __createConsoleReporter: createConsoleReporter,
    __createPanelReporter: createPanelReporter,
    __createLogReporter: createLogReporter,
    __installPanelStyles: installPanelStyles,
  };

  global.SCTest = api;
})(typeof window !== "undefined" ? window : globalThis);

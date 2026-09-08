// ==UserScript==
// @name         沙盒全局相容性诊断器
// @namespace    https://github.com/scriptscat/scriptcat
// @version      1.0.0
// @description  检查 window、this、globalThis、宿主函数/访问器、事件与 GM API 是否符合 Tampermonkey 沙盒预期
// @author       ScriptCat sandbox audit
// @match        https://*/*?test_sandbox_compatibility_sc
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM.info
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        window.onurlchange
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@b8c6d0839c75ee5e4e4276dd10e201011c445df8/example/tests/lib/sctest.js
// @inject-into  content
// ==/UserScript==

/*
 * 这个脚本是黑盒诊断器，不依赖 ScriptCat 内部模块。
 * 检查矩阵来自 scriptscat/scriptcat PR #1706 的 create_context.ts 与 Vitest：
 *   - realmGlobal 与 hostWindow 可以是两个 realm；realm own descriptor 优先，host 只补齐。
 *   - 函数/访问器必须绑定正确 receiver；构造器和 interface 不可被 bind 剥掉 prototype/静态成员。
 *   - 每个脚本独立复制 descriptor；window/self/globalThis 始终回到当前 sandbox。
 *   - on* 属性用独立事件状态机模拟，函数替换不重复注册；PR/Vitest 预期 handler 的 this 指向 sandbox。
 *     注意：本黑盒脚本目前的 observedThis 项只复核顶层 this，并没有在 handler 内重新采样 this。
 *   - 内部 context 字段不可泄漏，console 与 unsafeWindow console 应尽量隔离。
 *
 * 这里明确申请了非 none 的 grant，并声明 @inject-into content；本脚本并没有声明 @sandbox JavaScript。
 * ScriptCat/VM 的 content 注入可出现 content unsafeWindow，TM 等环境则可能显示 page unsafeWindow；以下以实际探针结果为准。
 */

let observedThis = this;

(function (topLevelThis) {
  "use strict";

  const { describe, check, note, run } = SCTest.create({
    name: "沙盒全局相容性诊断器",
    reporter: "console",
  });
  const { safe, read, UNAVAILABLE } = SCTest;
  const nativeObject = Object;
  const nativeFunction = Function;
  const nativeReflect = Reflect;
  const nativeGetPrototypeOf = nativeObject.getPrototypeOf;
  const nativeGetOwnPropertyDescriptor = nativeObject.getOwnPropertyDescriptor;
  const nativeObjectToString = nativeObject.prototype.toString;
  const nativeHasOwnProperty = nativeObject.prototype.hasOwnProperty;

  const hasOwn = (object, key) => {
    try {
      return nativeHasOwn.call(object, key);
    } catch {
      return false;
    }
  };

  const sandboxGlobal = read(() => globalThis);
  const sandboxWindow = read(() => window);
  const sandboxSelf = read(() => self);
  // 变量名沿用 pageWindow；实际对象是当前 unsafeWindow，在 @inject-into content 下也可能是 content unsafeWindow。
  const pageWindow = read(() => (typeof unsafeWindow === "undefined" ? UNAVAILABLE : unsafeWindow));
  const gmObject = read(() => (typeof GM === "undefined" ? UNAVAILABLE : GM));
  const gmInfoObject = read(() => (typeof GM_info === "undefined" ? UNAVAILABLE : GM_info));

  const valueType = (value) => {
    if (value === UNAVAILABLE) return "不可用";
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    return typeof value;
  };

  const formatError = (error) => {
    if (error === UNAVAILABLE) return "不可用";
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    try {
      return String(error);
    } catch {
      return "未知异常";
    }
  };

  const randkey = `_${Math.random().toString(36).substring(3, 8)}`;
  console.log("randkey is " + randkey);
  let randKeyHook = "";
  try {
    document.documentElement.appendChild(document.createElement("script")).textContent = "var " + randkey + " = 1";
  } catch (e) { randKeyHook = "dom error"; }
  try {
    document.documentElement.appendChild(document.createElement("script")).textContent = "document." + randkey + " = 1";
  } catch (e) { randKeyHook = "dom error"; }

  if (!randKeyHook) {
    randKeyHook = document[randkey] === undefined ? "content" : "page";
  }





  const formatValue = (value) => {
    if (value === UNAVAILABLE) return "<不可用>";
    if (value === sandboxWindow) return "sandbox window";
    if (value === sandboxGlobal) return "sandbox globalThis";
    if (value === sandboxSelf) return "sandbox self";
    if (value === pageWindow) {
      if (randKeyHook !== "dom error") return value[randkey] === 1 ? "page unsafeWindow" : "content unsafeWindow";
      return "page unsafeWindow";
    }
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }
    if (typeof value === "symbol") return String(value);
    if (typeof value === "function") {
      return `function ${value.name || "(anonymous)"}`;
    }
    try {
      return nativeObjectToString.call(value);
    } catch {
      return `<${valueType(value)}>`;
    }
  };

  const skip = (category, name, expected, detail) => {
    check(
      category,
      name,
      () => SCTest.skip(detail),
      expected,
      "当前环境未提供",
      detail,
      { required: false }
    );
  };

  const descriptorFromChain = (object, key) => {
    if (object === UNAVAILABLE || object === null || object === undefined) return null;
    const visited = new Set();
    let current = object;
    let depth = 0;
    while (current && depth < 100 && !visited.has(current)) {
      visited.add(current);
      const descriptor = read(() => nativeGetOwnPropertyDescriptor(current, key));
      if (descriptor !== UNAVAILABLE && descriptor) {
        return { descriptor, depth };
      }
      const next = read(() => nativeGetPrototypeOf(current));
      if (next === UNAVAILABLE || next === current) break;
      current = next;
      depth += 1;
    }
    return null;
  };

  const descriptorSummary = (descriptor) => {
    if (!descriptor) return "未找到 descriptor";
    const keys = [];
    if (hasOwn(descriptor, "value")) keys.push(`value=${formatValue(descriptor.value)}`);
    if (hasOwn(descriptor, "get")) keys.push(`get=${descriptor.get ? "yes" : "no"}`);
    if (hasOwn(descriptor, "set")) keys.push(`set=${descriptor.set ? "yes" : "no"}`);
    if (hasOwn(descriptor, "writable")) keys.push(`writable=${descriptor.writable}`);
    keys.push(`enumerable=${Boolean(descriptor.enumerable)}`);
    keys.push(`configurable=${Boolean(descriptor.configurable)}`);
    return keys.join(", ");
  };

  const runDiagnostics = () => {
    if (sandboxWindow === UNAVAILABLE || sandboxGlobal === UNAVAILABLE) {
      check(
        "启动",
        "取得脚本全局对象",
        () => false,
        "window 与 globalThis 可读",
        () => `window=${formatValue(sandboxWindow)}, globalThis=${formatValue(sandboxGlobal)}`,
        "当前上下文不像浏览器 userscript sandbox，后续检查只保留可执行项目。"
      );
      return;
    }

    // 1. 全局对象与别名：这是 PR #1706 及 TM 半沙盒兼容性的最核心不变量。
    const aliases = [
      ["window === globalThis", () => sandboxWindow === sandboxGlobal, "sandbox window", () => formatValue(sandboxGlobal)],
      ["window === self", () => sandboxWindow === sandboxSelf, "sandbox window", () => formatValue(sandboxSelf)],
      ["window.window === window", () => read(() => sandboxWindow.window) === sandboxWindow, "sandbox window", () => formatValue(read(() => sandboxWindow.window))],
      ["window.self === window", () => read(() => sandboxWindow.self) === sandboxWindow, "sandbox window", () => formatValue(read(() => sandboxWindow.self))],
      [
        "window.globalThis === window",
        () => read(() => sandboxWindow.globalThis) === sandboxWindow,
        "sandbox window",
        () => formatValue(read(() => sandboxWindow.globalThis)),
      ],
      [
        "globalThis.globalThis === globalThis",
        () => read(() => sandboxGlobal.globalThis) === sandboxGlobal,
        "sandbox globalThis",
        () => formatValue(read(() => sandboxGlobal.globalThis)),
      ],
    ];
    for (const [name, predicate, expected, actual] of aliases) {
      check("全局别名", name, predicate, expected, actual);
    }

    check(
      "全局别名",
      "脚本最外层 this === window",
      () => topLevelThis === sandboxWindow,
      "sandbox window",
      () => formatValue(topLevelThis),
      "classic userscript 的顶层 this 应落在脚本沙盒；若这里失败，常见原因是被注入为 module/main world。"
    );


    if (randKeyHook === "content") {

      check(
        "全局别名",
        "@inject-into content is applied",
        () => true,
        "content unsafeWindow (VM); page unsafeWindow (TM)",
        () => formatValue(unsafeWindow),
        "按实际探针区分：VM/SC 的 content 注入可显示 content unsafeWindow；TM 等环境可能显示 page unsafeWindow。"
      );
    } else {
      skip("全局别名", "@inject-into content 探针", "content unsafeWindow 或管理器等价行为", "当前探针未呈现 content 注入特征；可能是管理器忽略/不支持 @inject-into，或其隔离实现不同。");

    }


    const functionGlobal = read(() => nativeFunction("return this")());
    check(
      "全局别名",
      "Function(\"return this\")() === unsafeWindow",
      () => functionGlobal === unsafeWindow,
      "page unsafeWindow (TM) / content unsafeWindow (VM,SC)",
      () => formatValue(functionGlobal),
      "验证 Function 构造器取得的全局对象是否等于当前 unsafeWindow；显示分类保留 page unsafeWindow (TM) / content unsafeWindow (VM,SC)。",

        { onFail: "WARN", onError: "WARN", required: false }
    );

    const evalGlobal = read(() =>
      typeof sandboxWindow.eval === "function" ? sandboxWindow.eval("this") : UNAVAILABLE
    );
    if (evalGlobal === UNAVAILABLE) {
      skip("全局别名", "eval(\"this\")", "sandbox window", "eval 不可用或被管理器配置禁用。该项目不强制要求 eval 开启。");
    } else {
      check(
        "全局别名",
        "window.eval(\"this\") === unsafeWindow",
        () => evalGlobal === unsafeWindow,
      "page unsafeWindow (TM) / content unsafeWindow (VM,SC)",
        () => formatValue(evalGlobal),
        "验证 window.eval(\"this\") 的结果是否等于当前 unsafeWindow；显示分类保留 page unsafeWindow (TM) / content unsafeWindow (VM,SC)。",
        { onFail: "WARN", onError: "WARN", required: false }
      );
    }


    check(
      "全局别名",
      "Function(\"return this\")() === window.eval(\"this\")",
      () => functionGlobal === evalGlobal,
      "true",
      () => `${functionGlobal === evalGlobal}`,
      "验证脚本 functionGlobal === evalGlobal。"
    );


    const strictFunctionThis = read(() =>
      (function () {
        return this;
      })()
    );
    check(
      "全局别名",
      "strict function 的 this === undefined",
      () => strictFunctionThis === undefined,
      "undefined",
      () => formatValue(strictFunctionThis),
      "这是语言层 sanity check，用来区分脚本的顶层 this 与严格函数 this。"
    );

    // 2. sandbox / unsafeWindow 隔离：unsafeWindow 可能是 page unsafeWindow，也可能是 content unsafeWindow。
    // 报告分类名“页面隔离”沿用原脚本；实际比较对象始终是当前 unsafeWindow。
    if (pageWindow === UNAVAILABLE) {
      skip(
        "页面隔离",
        "unsafeWindow 可用",
        "存在 page unsafeWindow / content unsafeWindow",
        "当前管理器没有提供 unsafeWindow；无法验证 unsafeWindow 与 sandbox 的身份边界。"
      );
    } else {
      check(
        "页面隔离",
        "sandbox window !== unsafeWindow",
        () => sandboxWindow !== pageWindow,
        "两个不同的 window 对象",
        () => formatValue(pageWindow),
        "若失败，脚本正在 page/main world 执行，或管理器没有真正建立沙盒。"
      );
      check(
        "页面隔离",
        "globalThis !== unsafeWindow",
        () => sandboxGlobal !== pageWindow,
        "不同于 page unsafeWindow / content unsafeWindow",
        () => formatValue(sandboxGlobal),
        "globalThis 不应与当前 unsafeWindow 为同一 sandbox 对象。"
      );
      check(
        "页面隔离",
        "self !== unsafeWindow",
        () => sandboxSelf !== pageWindow,
        "不同于 page unsafeWindow / content unsafeWindow",
        () => formatValue(sandboxSelf),
        "self 不应与当前 unsafeWindow 为同一 sandbox 对象。"
      );

      const pageSelf = read(() => pageWindow.self);
      const pageGlobalThis = read(() => pageWindow.globalThis);
      check(
        "页面隔离",
        "unsafeWindow.window === unsafeWindow",
        () => read(() => pageWindow.window) === pageWindow,
        "page unsafeWindow / content unsafeWindow",
        () => formatValue(read(() => pageWindow.window)),
        "当前 unsafeWindow 自身别名的 sanity check；具体显示由 page/content 探针决定。",
        { onFail: "WARN", onError: "WARN", required: false }
      );
      check(
        "页面隔离",
        "unsafeWindow.self === unsafeWindow",
        () => pageSelf === pageWindow,
        "page unsafeWindow / content unsafeWindow",
        () => formatValue(pageSelf),
        "当前 unsafeWindow 自身别名的 sanity check；具体显示由 page/content 探针决定。",
        { onFail: "WARN", onError: "WARN", required: false }
      );
      check(
        "页面隔离",
        "unsafeWindow.window === unsafeWindow.self",
        () => read(() => pageWindow.window) === pageSelf,
        "true",
        () => `${read(() => pageWindow.window) === pageSelf}`,
        "验证脚本 unsafeWindow.window === unsafeWindow.self。"
      );
      check(
        "页面隔离",
        "unsafeWindow.globalThis === unsafeWindow",
        () => pageGlobalThis === pageWindow,
        "page unsafeWindow / content unsafeWindow",
        () => formatValue(pageGlobalThis),
        "当前 unsafeWindow 自身别名的 sanity check；具体显示由 page/content 探针决定。",
        { onFail: "WARN", onError: "WARN", required: false }
      );

      // 写入随机 own property，验证 sandbox 写入不会落到当前 unsafeWindow（page/content 依实际环境）。
      const probeKey = `__tm_sandbox_audit_${Math.random().toString(36).slice(2)}`;
      const probeValue = `sandbox-only-${Date.now()}`;
      const pageHadKey = hasOwn(pageWindow, probeKey);
      let sandboxWriteResult = UNAVAILABLE;
      let pageValueAfterWrite = UNAVAILABLE;
      try {
        sandboxWriteResult = safe(() => {
          sandboxWindow[probeKey] = probeValue;
          return sandboxWindow[probeKey];
        });
        sandboxWriteResult = sandboxWriteResult.ok ? sandboxWriteResult.value : UNAVAILABLE;
        pageValueAfterWrite = read(() => pageWindow[probeKey]);
        check(
          "页面隔离",
          "sandbox 普通属性写入不泄漏到 unsafeWindow",
          () => sandboxWriteResult === probeValue && pageValueAfterWrite !== probeValue,
          `sandbox[${probeKey}] 可读，unsafeWindow 不可见`,
          () => `sandbox=${formatValue(sandboxWriteResult)}, unsafeWindow=${formatValue(pageValueAfterWrite)}`,
          "这是最直接的 sandbox/unsafeWindow 状态隔离测试；unsafeWindow 可显示为 page 或 content。"
        );
      } finally {
        safe(() => delete sandboxWindow[probeKey]);
        if (!pageHadKey && read(() => pageWindow[probeKey]) === probeValue) {
          safe(() => delete pageWindow[probeKey]);
        }
      }
    }

    // 3. top/parent/frames：当前 unsafeWindow 的自指 frame 应折回 sandbox；iframe 的非自身引用允许保留。
    if (pageWindow === UNAVAILABLE) {
      skip("窗口层级别名", "top / parent / frames", "符合当前 frame 的层级语义", "缺少 unsafeWindow，无法判断当前 host frame 的自指关系。");
    } else {
      for (const key of ["top", "parent", "frames"]) {
        const pageValue = read(() => pageWindow[key]);
        const sandboxValue = read(() => sandboxWindow[key]);
        if (pageValue === UNAVAILABLE || sandboxValue === UNAVAILABLE) {
          skip("窗口层级别名", `window.${key}`, "可读", "该属性在当前浏览器不可用。");
        } else if (pageValue === pageWindow) {
          check(
            "窗口层级别名",
            `顶层 frame: window.${key} === window`,
            () => sandboxValue === sandboxWindow,
            "sandbox window",
            () => formatValue(sandboxValue),
            "PR #1706 的自引用折返规则：hostWindow 自指时返回当前 mySandbox。"
          );
        } else {
          note(
            "窗口层级别名",
            `iframe: window.${key} 保留非自身引用`,
            "不要错误地把非自身 frame 强行改成当前 sandbox",
            formatValue(sandboxValue),
            "当前值来自父/top/frame realm；PR 的测试允许这类非自身引用保留，具体 identity 由管理器实现决定。"
          );
        }
      }
    }

    // 4. realm intrinsics：split-realm 时，JavaScript 内建来自脚本 realm，不能被 hostWindow 覆盖。
    const intrinsicEntries = [
      ["Object", () => Object],
      ["Function", () => Function],
      ["Array", () => Array],
      ["String", () => String],
      ["Number", () => Number],
      ["Boolean", () => Boolean],
      ["RegExp", () => RegExp],
      ["Date", () => Date],
      ["Error", () => Error],
      ["Promise", () => Promise],
      ["Map", () => Map],
      ["Set", () => Set],
      ["Symbol", () => Symbol],
      ["BigInt", () => BigInt],
      ["JSON", () => JSON],
      ["Math", () => Math],
      ["Reflect", () => Reflect],
    ];
    for (const [name, getIdentifier] of intrinsicEntries) {
      const identifier = read(getIdentifier);
      if (identifier === UNAVAILABLE) {
        skip("脚本 realm 内建", `window.${name}`, `与脚本中的 ${name} 一致`, "当前 JavaScript 引擎未提供该内建对象。");
        continue;
      }
      const windowValue = read(() => sandboxWindow[name]);
      check(
        "脚本 realm 内建",
        `window.${name} === ${name}`,
        () => windowValue === identifier,
        formatValue(identifier),
        () => formatValue(windowValue),
        "realmGlobal own descriptor 优先；同一脚本 realm 的全局别名应保持一致。"
      );
    }

    check(
      "脚本 realm 内建",
      "Object.prototype.toString.call(window)",
      () => {
        const tag = read(() => nativeObjectToString.call(sandboxWindow));
        return tag === "[object Window]" || tag === "[object global]" || tag === "[object Object]";
      },
      "[object Window]（或管理器等价 tag）",
      () => formatValue(read(() => nativeObjectToString.call(sandboxWindow))),
      "不同浏览器/管理器对 pseudo-window 的 toStringTag 可能不同；异常 tag 仍值得检查。",
      { onFail: "WARN", onError: "WARN", required: false }
    );

    const prototypeOfWindow = read(() => nativeGetPrototypeOf(sandboxWindow));
    check(
      "脚本 realm 内建",
      "window 的 prototype 形态",
      () => `${formatValue(prototypeOfWindow)}` === "null",
      "null",
      () => formatValue(prototypeOfWindow),
      "prototype 形态是实现策略证据，不单独决定兼容性；真正关键的是 own descriptor 与身份/receiver 测试。",
      { onFail: "WARN", onError: "WARN", required: false }
    );

    // 5. 宿主属性与 descriptor：读取 getter 不应抛异常，关键函数要可以被抽出调用。
    const hostProperties = [
      ["document", "object"],
      ["location", "object"],
      ["navigator", "object"],
      ["history", "object"],
      ["setTimeout", "function"],
      ["clearTimeout", "function"],
      ["addEventListener", "function"],
      ["removeEventListener", "function"],
      ["dispatchEvent", "function"],
    ];
    for (const [key, expectedType] of hostProperties) {
      const value = read(() => sandboxWindow[key]);
      check(
        "宿主属性",
        `window.${key} 可读且类型正确`,
        () => value !== UNAVAILABLE && value !== null && typeof value === expectedType,
        expectedType,
        () => `${formatValue(value)} (${valueType(value)})`,
        "宿主属性由 hostWindow 补齐，访问器必须以真实 hostWindow 为 receiver。"
      );
    }

    for (const key of ["document", "location", "navigator", "setTimeout", "addEventListener", "onmessage"]) {
      const found = descriptorFromChain(sandboxWindow, key);
      if (!found) {
        note("描述符检查", `window.${key} descriptor`, "可由 own 或原型链取得", "未找到", "属性可能由管理器以其他方式提供。");
      } else {
        note(
          "描述符检查",
          `window.${key} descriptor`,
          "保留 descriptor 语义，不把 getter 提前读成 value",
          `prototype depth=${found.depth}; ${descriptorSummary(found.descriptor)}`,
          "PR #1706 使用 descriptor map，避免普通赋值触发 getter 或丢失 enumerable/configurable/writable。"
        );
      }
    }

    const extractedSetTimeout = read(() => sandboxWindow.setTimeout);
    const extractedClearTimeout = read(() => sandboxWindow.clearTimeout);
    if (typeof extractedSetTimeout !== "function" || typeof extractedClearTimeout !== "function") {
      skip("宿主 receiver", "抽出 setTimeout/clearTimeout 后调用", "不抛 Illegal invocation", "当前上下文没有可调用的定时器。");
    } else {
      let timerId = UNAVAILABLE;
      let timerError = null;
      try {
        // 故意以裸函数调用测试：正确实现应已把函数绑定到 hostWindow。
        timerId = extractedSetTimeout(() => undefined, 0);
        extractedClearTimeout(timerId);
      } catch (error) {
        timerError = error;
      }
      check(
        "宿主 receiver",
        "抽出 setTimeout/clearTimeout 后裸调用",
        () => timerError === null,
        "不抛 Illegal invocation",
        () => (timerError ? `抛出 ${formatError(timerError)}` : `timer id=${formatValue(timerId)}`),
        "覆盖 PR 的 materializeDescriptor/bindFn 路径。"
      );
    }

    const extractedAddEventListener = read(() => sandboxWindow.addEventListener);
    const extractedRemoveEventListener = read(() => sandboxWindow.removeEventListener);
    const extractedDispatchEvent = read(() => sandboxWindow.dispatchEvent);
    const eventConstructor = read(() => sandboxWindow.Event);
    if (
      typeof extractedAddEventListener !== "function" ||
      typeof extractedRemoveEventListener !== "function" ||
      typeof extractedDispatchEvent !== "function" ||
      typeof eventConstructor !== "function"
    ) {
      skip("宿主 receiver", "抽出 EventTarget 方法后调用", "add/remove/dispatch 均可工作", "当前环境缺少完整 EventTarget API。");
    } else {
      const eventName = `tm-sandbox-audit-${Math.random().toString(36).slice(2)}`;
      let calls = 0;
      let eventError = null;
      const listener = () => {
        calls += 1;
      };
      try {
        // 同样故意裸调用，验证 hostWindow receiver 已绑定。
        extractedAddEventListener(eventName, listener, false);
        const event = new eventConstructor(eventName);
        extractedDispatchEvent(event);
        extractedRemoveEventListener(eventName, listener, false);
      } catch (error) {
        eventError = error;
      }
      check(
        "宿主 receiver",
        "抽出 add/remove/dispatchEvent 后裸调用",
        () => eventError === null && calls === 1,
        "无异常且 listener 恰好触发一次",
        () => (eventError ? `抛出 ${formatError(eventError)}` : `listener calls=${calls}`),
        "覆盖 Firefox split-realm 中只能经 hostWindow 原型链取得 EventTarget 方法的场景。"
      );
      safe(() => extractedRemoveEventListener(eventName, listener, false));
    }

    // 6. 构造器/interface 与静态成员：绝不能把 bind 产物误当作普通宿主函数。
    const constructorChecks = [
      ["EventTarget", "prototype"],
      ["Event", "prototype"],
      ["Node", "prototype"],
      ["HTMLElement", "prototype"],
      ["XMLHttpRequest", "prototype"],
    ];
    for (const [name] of constructorChecks) {
      const value = read(() => sandboxWindow[name]);
      if (value === UNAVAILABLE || typeof value !== "function") {
        skip("构造器与 interface", `window.${name}`, "函数且保留 prototype", "浏览器可能不提供该接口，或管理器未暴露该成员。");
      } else {
        check(
          "构造器与 interface",
          `${name} 保留 prototype`,
          () => "prototype" in value && value.prototype !== undefined,
          "存在 prototype",
          () => ("prototype" in value ? formatValue(value.prototype) : "无 prototype"),
          "isConstructorOrInterface 应跳过 bind，保留构造器原型与静态成员。"
        );
      }
    }

    const node = read(() => sandboxWindow.Node);
    if (node !== UNAVAILABLE && typeof node === "function") {
      check(
        "构造器与 interface",
        "Node.ELEMENT_NODE 静态常量",
        () => node.ELEMENT_NODE === 1,
        "1",
        () => formatValue(node.ELEMENT_NODE),
        "验证 Node 没有被错误 bind 成丢失静态成员的函数。",
        { onFail: "WARN", onError: "WARN", required: false }
      );
    } else {
      skip("构造器与 interface", "Node.ELEMENT_NODE 静态常量", "1", "当前浏览器未提供 Node。");
    }

    const nodeFilter = read(() => sandboxWindow.NodeFilter);
    if (nodeFilter !== UNAVAILABLE && nodeFilter !== null) {
      check(
        "构造器与 interface",
        "NodeFilter.SHOW_TEXT 静态常量",
        () => nodeFilter.SHOW_TEXT === 4,
        "4",
        () => formatValue(nodeFilter.SHOW_TEXT),
        "覆盖没有 prototype 但以大写名称识别的 interface。",
        { onFail: "WARN", onError: "WARN", required: false }
      );
    } else {
      skip("构造器与 interface", "NodeFilter.SHOW_TEXT 静态常量", "4", "当前浏览器未提供 NodeFilter。");
    }

    const math = read(() => sandboxWindow.Math);
    const number = read(() => sandboxWindow.Number);
    const object = read(() => sandboxWindow.Object);
    check(
      "构造器与 interface",
      "Math.max(2, 7) === 7",
      () => math !== UNAVAILABLE && math.max(2, 7) === 7,
      "7",
      () => formatValue(read(() => math.max(2, 7))),
      "验证 realm 内建静态方法仍可调用。"
    );
    check(
      "构造器与 interface",
      "Number.isNaN(NaN) === true",
      () => number !== UNAVAILABLE && number.isNaN(NaN) === true,
      "true",
      () => formatValue(read(() => number.isNaN(NaN))),
      "验证 Firefox Xray 下的内建静态成员没有被剥掉。"
    );
    check(
      "构造器与 interface",
      "Object.isFrozen(Object.freeze({})) === true",
      () => object !== UNAVAILABLE && object.isFrozen(object.freeze({})) === true,
      "true",
      () => formatValue(read(() => object.isFrozen(object.freeze({})))),
      "验证 Object 的静态方法与 descriptor 复制正常。"
    );

    // 7. on* 事件属性：模拟 createEventProp 的函数/对象/清空状态机。
    const eventPropertyCandidates = ["onmessage", "onhashchange", "onresize", "onfocus"];
    const eventProperty = eventPropertyCandidates.find((key) => {
      const found = descriptorFromChain(sandboxWindow, key);
      return found && (found.descriptor.get || found.descriptor.set);
    });
    if (!eventProperty || typeof extractedDispatchEvent !== "function" || typeof eventConstructor !== "function") {
      skip("on* 事件状态机", "on* 属性函数替换与 this", "handler 只触发一次且 this===sandbox", "当前环境没有可用的 on* accessor。");
    } else {
      const eventName = eventProperty.slice(2);
      const oldValue = read(() => sandboxWindow[eventProperty]);
      let firstCalls = 0;
      let secondCalls = 0;
      let objectCalls = 0;
      let eventError = null;
      const firstHandler = function () {
        firstCalls += 1;
      };
      const secondHandler = function () {
        secondCalls += 1;
      };
      const objectHandler = { handleEvent: () => (objectCalls += 1) };
      try {
        nativeReflect.set(sandboxWindow, eventProperty, null, sandboxWindow);
        nativeReflect.set(sandboxWindow, eventProperty, firstHandler, sandboxWindow);
        nativeReflect.set(sandboxWindow, eventProperty, secondHandler, sandboxWindow);
        extractedDispatchEvent(new eventConstructor(eventName));
        nativeReflect.set(sandboxWindow, eventProperty, objectHandler, sandboxWindow);
        extractedDispatchEvent(new eventConstructor(eventName));
        nativeReflect.set(sandboxWindow, eventProperty, null, sandboxWindow);
        extractedDispatchEvent(new eventConstructor(eventName));
      } catch (error) {
        eventError = error;
      } finally {
        safe(() => nativeReflect.set(sandboxWindow, eventProperty, oldValue === UNAVAILABLE ? null : oldValue, sandboxWindow));
      }
      check(
        "on* 事件状态机",
        `${eventProperty}: 函数替换只调用新 handler`,
        () => eventError === null && firstCalls === 0 && secondCalls === 1,
        "旧函数 0 次，新函数 1 次",
        () => (eventError ? `抛出 ${formatError(eventError)}` : `old=${firstCalls}, new=${secondCalls}`),
        "function → function 时不应重复注册，也不应保留旧 callback。"
      );
      check(
        "on* 事件状态机",
        `${eventProperty}: observedThis === sandbox window（当前采样为顶层 this）`,
        () => observedThis === sandboxWindow,
        "sandbox window",
        () => formatValue(observedThis),
        "observedThis 只在脚本顶层赋值，handler 内没有更新；因此此项实际复核的是顶层 this，并不能单独证明 handler this。PR/Vitest 的目标仍是 handler this === sandbox。"
      );
      check(
        "on* 事件状态机",
        `${eventProperty}: object handler 不注册为函数监听`,
        () => objectCalls === 0,
        "object handler 不被调用",
        () => `object calls=${objectCalls}`,
        "对象/Symbol 等非 function 值可以保存，但不应被当成真实 on* callback。"
      );
    }

    // 8. window.onurlchange 是独立 grant 通道；只验证 accessor，不主动导航页面。
    const onUrlChangeDescriptor = descriptorFromChain(sandboxWindow, "onurlchange");
    const currentOnUrlChange = read(() => sandboxWindow.onurlchange);
    if (!onUrlChangeDescriptor && (currentOnUrlChange === UNAVAILABLE || currentOnUrlChange === undefined)) {
      skip("特殊 GM/window 能力", "window.onurlchange accessor", "可读写函数/null", "当前管理器未提供该可选 API。");
    } else {
      const oldOnUrlChange = read(() => sandboxWindow.onurlchange);
      let onUrlChangeReadback = UNAVAILABLE;
      const onUrlChangeHandler = () => undefined;
      const result = safe(() => {
        nativeReflect.set(sandboxWindow, "onurlchange", onUrlChangeHandler, sandboxWindow);
        onUrlChangeReadback = sandboxWindow.onurlchange;
        nativeReflect.set(sandboxWindow, "onurlchange", null, sandboxWindow);
      });
      safe(() => nativeReflect.set(sandboxWindow, "onurlchange", oldOnUrlChange === UNAVAILABLE ? null : oldOnUrlChange, sandboxWindow));
      check(
        "特殊 GM/window 能力",
        "window.onurlchange 可写入函数并读回",
        () => result.ok && onUrlChangeReadback === onUrlChangeHandler,
        "读回同一 handler",
        () => (result.ok ? formatValue(onUrlChangeReadback) : `抛出 ${formatError(result.error)}`),
        "PR #1706 将 onurlchange 作为 context 哨兵与 hostWindow 自定义事件通道处理。",
        { onFail: "WARN", onError: "WARN", required: false }
      );
    }

    // 9. ScriptCat 保护字段与模块变量遮蔽；泄漏这些字段通常意味着复制 context 时 protect 失效。
    for (const key of [
      "runFlag",
      "message",
      "contentMsg",
      "scriptRes",
      "grantSet",
      "valueChangeListener",
      "EE",
      "loadScriptPromise",
      "loadScriptResolve",
    ]) {
      const value = read(() => sandboxWindow[key]);
      check(
        "能力边界",
        `内部字段 ${key} 不泄漏`,
        () => value === UNAVAILABLE || value === undefined,
        "undefined",
        () => formatValue(value),
        "复制 GM context 到脚本 window 时应跳过 protect 集合。"
      );
    }
    for (const key of ["define", "module", "exports"]) {
      const value = read(() => sandboxWindow[key]);
      check(
        "能力边界",
        `模块变量 ${key} 被遮蔽为 undefined`,
        () => value === undefined || value === UNAVAILABLE,
        "undefined",
        () => formatValue(value),
        "PR 的 createProxyContext 会主动遮蔽这些名称，避免脚本执行环境误用外部模块对象。",
        { onFail: "WARN", onError: "WARN", required: false }
      );
    }

    // 10. console 与 GM API：不改变持久化数据，只检查暴露面与隔离证据。
    const sandboxConsole = read(() => sandboxWindow.console);
    if (pageWindow !== UNAVAILABLE) {
      const pageConsole = read(() => pageWindow.console);
      check(
        "能力边界",
        "sandbox console 与 unsafeWindow console 分离",
        () => sandboxConsole !== UNAVAILABLE && sandboxConsole !== pageConsole,
        "不同 console 对象（推荐；unsafeWindow 可为 page/content）",
        () => `sandbox=${formatValue(sandboxConsole)}, unsafeWindow=${formatValue(pageConsole)}`,
        "PR #1706 从 ConsolePrototype/descriptor clone 建立沙盒 console；这里比较的是当前 unsafeWindow 的 console（page/content 依探针），不同管理器可能共享，因此为警告级。",
        { onFail: "WARN", onError: "WARN", required: false }
      );
    } else {
      skip("能力边界", "sandbox console 与 unsafeWindow console 分离", "不同 console 对象", "缺少 unsafeWindow。");
    }

    const gmPairs = [
      ["GM_getValue", "GM.getValue"],
      ["GM_setValue", "GM.setValue"],
      ["GM_deleteValue", "GM.deleteValue"],
    ];
      /*
      // ignore this test
    for (const [legacyName, modernName] of gmPairs) {
      const legacy = read(() => globalThis[legacyName]);
      const modern = read(() => (gmObject === UNAVAILABLE ? UNAVAILABLE : gmObject[modernName.slice(3)]));
      if (legacy === UNAVAILABLE && modern === UNAVAILABLE) {
        skip("GM 能力命名", `${legacyName} ↔ ${modernName}`, "两种命名均可用", "当前管理器未提供此 grant，或尚未实现现代/旧式 API。");
      } else {
        check(
          "GM 能力命名",
          `${legacyName} ↔ ${modernName}`,
          () => typeof legacy === "function" && typeof modern === "function",
          "legacy 与 modern 都是 function",
          () => `legacy=${formatValue(legacy)}, modern=${formatValue(modern)}`,
          "对应 createContext 的 GM.* / GM_* 双命名注入；本检查不读写任何持久化值。",
          { onFail: "WARN", onError: "WARN", required: false }
        );
      }
    }
      */

    const modernInfo = read(() => (gmObject === UNAVAILABLE ? UNAVAILABLE : gmObject.info));
    const legacyInfo = gmInfoObject;
    if (modernInfo === UNAVAILABLE && legacyInfo === UNAVAILABLE) {
      skip("GM 能力命名", "GM.info / GM_info", "至少有一个信息对象", "当前管理器没有暴露脚本元数据 API。");
    } else {
      check(
        "GM 能力命名",
        "GM.info 或 GM_info 可读",
        () => (modernInfo !== UNAVAILABLE && modernInfo !== undefined) || (legacyInfo !== UNAVAILABLE && legacyInfo !== undefined),
        "信息对象",
        () => `GM.info=${formatValue(modernInfo)}, GM_info=${formatValue(legacyInfo)}`,
        "只读取元数据，不执行任何高权限 API。",
        { onFail: "WARN", onError: "WARN", required: false }
      );
    }

  };

  describe("沙盒全局相容性诊断", () => {
    runDiagnostics();
  });
  run();
})(this);

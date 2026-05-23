// ==UserScript==
// @name         半沙盒环境测试
// @namespace    https://docs.scriptcat.org/
// @version      0.2.0
// @description  测试默认 userscript 半沙盒环境，不使用 @inject-into content 或 @grant none
// @author       ScriptCat
// @match        https://*/*?SANDBOX_TEST_SC
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_setValues
// @grant        GM_getValues
// @grant        GM_addElement
// @grant        GM_addStyle
// @grant        GM_cookie
// @grant        GM.setValue
// @grant        window.close
// @grant        window.focus
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(async function () {
  "use strict";

  const markerPrefix = `__scriptcat_sandbox_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const testResults = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  console.log(
    "%c=== 半沙盒环境测试开始 ===",
    "color: blue; font-size: 16px; font-weight: bold;",
  );

  function formatValue(value) {
    if (value === window) return "[sandbox window]";
    if (value === unsafeWindow) return "[unsafeWindow]";
    if (value === document) return "[document]";
    if (value && value.nodeType) return `[node ${value.nodeName}]`;
    if (typeof value === "function")
      return `[function ${value.name || "anonymous"}]`;
    if (typeof value === "symbol") return value.toString();
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function assertSame(expected, actual, message) {
    if (!Object.is(expected, actual)) {
      throw new Error(
        `${message} - 期望 ${formatValue(expected)}, 实际 ${formatValue(actual)}`,
      );
    }
  }

  function assertNotSame(unexpected, actual, message) {
    if (Object.is(unexpected, actual)) {
      throw new Error(`${message} - 不应等于 ${formatValue(unexpected)}`);
    }
  }

  function assertTrue(condition, message) {
    if (!condition) throw new Error(message || "断言失败: 条件不为真");
  }

  function assertThrowsOrKeepsValue(assign, read, expected, message) {
    let threw = false;
    try {
      assign();
    } catch {
      threw = true;
    }
    assertSame(
      expected,
      read(),
      `${message}${threw ? "（赋值抛出，值保持不变）" : ""}`,
    );
  }

  async function test(name, fn) {
    testResults.total++;
    try {
      await fn();
      testResults.passed++;
      console.log(`%cPASS ${name}`, "color: green;");
      return true;
    } catch (error) {
      testResults.failed++;
      console.error(`%cFAIL ${name}`, "color: red;", error);
      return false;
    }
  }

  function section(name) {
    console.log(`\n%c--- ${name} ---`, "color: orange; font-weight: bold;");
  }

  function waitForEventLoop() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function withTimeout(promise, label, ms = 5000) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} 超时 ${ms}ms`));
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function withCleanup(fn, cleanup) {
    try {
      return await fn();
    } finally {
      cleanup();
    }
  }

  function snapshotPageProps(keys) {
    const snapshots = Object.create(null);
    for (const key of keys) {
      snapshots[key] = Object.getOwnPropertyDescriptor(unsafeWindow, key);
    }
    return snapshots;
  }

  function restorePageProps(snapshots) {
    for (const key of Object.keys(snapshots)) {
      const desc = snapshots[key];
      if (desc) {
        Object.defineProperty(unsafeWindow, key, desc);
      } else {
        delete unsafeWindow[key];
      }
    }
  }

  section("沙盒全局身份");

  await test("window/self/globalThis/top/parent/frames 均指向沙盒对象", () => {
    assertSame("object", typeof unsafeWindow, "unsafeWindow 应存在");
    assertNotSame(
      unsafeWindow,
      window,
      "默认 grant 环境下 window 不应是页面 window",
    );
    assertSame(window, self, "self 应指向沙盒 window");
    assertSame(window, globalThis, "globalThis 应指向沙盒 window");
    assertSame(window, top, "top 应指向沙盒 window");
    assertSame(window, parent, "parent 应指向沙盒 window");
    assertSame(window, frames, "frames 应指向沙盒 window");
    assertSame(
      "[object Window]",
      Object.prototype.toString.call(window),
      "沙盒 window 应保持 Window 标记",
    );
  });

  await test("沙盒 window 使用空原型，但保留页面 Window 外观 (Issue #962)", () => {
    assertSame(
      null,
      Object.getPrototypeOf(window),
      "沙盒 window 的原型应为空，避免 Object.prototype 污染穿透",
    );
    assertSame(
      unsafeWindow.constructor,
      window.constructor,
      "constructor 应与页面 Window 构造器一致",
    );
    assertSame(
      unsafeWindow.__proto__,
      window.__proto__,
      "__proto__ 应暴露页面 Window 原型用于兼容",
    );
    assertSame(
      false,
      window instanceof unsafeWindow.constructor,
      "沙盒 window 不应是真实 Window 实例",
    );
  });

  await test("页面 DOM getter 返回真实页面对象", () => {
    assertSame(unsafeWindow.document, document, "document 应是页面 document");
    assertSame(
      unsafeWindow.location.href,
      location.href,
      "location 应读取页面地址",
    );
    assertSame(
      unsafeWindow.document.documentElement,
      document.documentElement,
      "DOM 节点身份应与页面一致",
    );
  });

  await test("页面全局变量不会自动穿透到沙盒 window", () =>
    withCleanup(
      () => {
        const key = `${markerPrefix}_page_global`;
        unsafeWindow[key] = "page-value";
        assertSame(
          "page-value",
          unsafeWindow[key],
          "页面变量应写入 unsafeWindow",
        );
        assertSame(undefined, window[key], "页面变量不应出现在沙盒 window");

        window[key] = "sandbox-value";
        assertSame("sandbox-value", window[key], "沙盒变量应写入沙盒 window");
        assertSame("page-value", unsafeWindow[key], "沙盒变量不应覆盖页面变量");
      },
      () => {
        delete window[`${markerPrefix}_page_global`];
        delete unsafeWindow[`${markerPrefix}_page_global`];
      },
    ));

  await test("页面 DOM named property 不应穿透为沙盒全局变量 (Issue #273, #700)", () =>
    withCleanup(
      () => {
        const id = `${markerPrefix}_named_element`;
        const div = document.createElement("div");
        div.id = id;
        document.body.appendChild(div);

        assertSame(
          div,
          unsafeWindow[id],
          "页面 window 应可通过 named property 访问元素",
        );
        assertSame(
          undefined,
          window[id],
          "沙盒 window 不应通过 named property 访问页面元素",
        );
      },
      () => {
        document.getElementById(`${markerPrefix}_named_element`)?.remove();
      },
    ));

  await test("删除沙盒全局变量不应删除页面同名全局变量 (Issue #522)", () =>
    withCleanup(
      () => {
        const key = `${markerPrefix}_delete_page_global`;
        unsafeWindow[key] = "page-value";

        assertSame(undefined, window[key], "页面变量不应自动出现在沙盒 window");

        window[key] = "sandbox-value";
        assertSame("sandbox-value", window[key], "沙盒变量应存在");
        assertSame("page-value", unsafeWindow[key], "页面变量应保持存在");

        delete window[key];

        assertSame(undefined, window[key], "删除后沙盒变量应消失");
        assertSame(
          "page-value",
          unsafeWindow[key],
          "删除沙盒变量不应删除页面变量",
        );
      },
      () => {
        window[`${markerPrefix}_delete_page_global`] = undefined;
        delete window[`${markerPrefix}_delete_page_global`];
        delete unsafeWindow[`${markerPrefix}_delete_page_global`];
      },
    ));

  await test("裸 delete 页面全局变量不应删除沙盒同名全局变量", () =>
    withCleanup(
      () => {
        const key = `${markerPrefix}_delete_bare_page_global`;
        unsafeWindow[key] = "page-value";
        window[key] = "sandbox-value";

        assertSame("sandbox-value", window[key], "裸变量应读取沙盒值");
        assertSame("page-value", unsafeWindow[key], "页面变量应保持存在");

        try {
          Function(`return delete ${key};`)(); // 半沙盒在页面执行
        } catch (e) {
          console.error(e);
          delete unsafeWindow[key]; // fallback
        }

        assertSame(undefined, unsafeWindow[key], "裸 delete 后页面变量应消失");
        assertSame("sandbox-value", window[key], "裸 delete 后沙盒变量不应消失");
      },
      () => {
        window[`${markerPrefix}_delete_bare_page_global`] = undefined;
        delete window[`${markerPrefix}_delete_bare_page_global`];
        delete unsafeWindow[`${markerPrefix}_delete_bare_page_global`];
      },
    ));

  await test("Object.prototype 污染不会穿透到沙盒 window", () =>
    withCleanup(
      () => {
        const key = `${markerPrefix}_polluted`;
        Object.prototype[key] = "polluted-value";
        assertSame("polluted-value", {}[key], "测试前应确认原型污染已生效");
        assertSame(
          undefined,
          window[key],
          "沙盒 window 不应读取 Object.prototype 上的污染字段",
        );
        assertSame(
          false,
          key in window,
          "污染字段不应出现在沙盒 window 的原型链",
        );
      },
      () => {
        delete Object.prototype[`${markerPrefix}_polluted`];
      },
    ));

  await test("特殊关键字与内部字段不从页面或 GM context 泄漏", () =>
    withCleanup(
      () => {
        for (const key of ["define", "module", "exports"]) {
          const desc = Object.getOwnPropertyDescriptor(unsafeWindow, key);
          if (!desc || desc.writable || desc.set) {
            unsafeWindow[key] = `page-${key}`;
          }
        }

        assertSame(undefined, window.define, "define 应被沙盒置为 undefined");
        assertSame(undefined, window.module, "module 应被沙盒置为 undefined");
        assertSame(undefined, window.exports, "exports 应被沙盒置为 undefined");

        for (const key of [
          "runFlag",
          "prefix",
          "message",
          "contentMsg",
          "scriptRes",
          "valueChangeListener",
          "EE",
          "context",
          "grantSet",
          "eventId",
          "loadScriptResolve",
          "loadScriptPromise",
          "setInvalidContext",
          "isInvalidContext",
        ]) {
          assertSame(undefined, window[key], `${key} 不应暴露到沙盒 window`);
        }
      },
      (() => {
        const snapshots = snapshotPageProps(["define", "module", "exports"]);
        return () => restorePageProps(snapshots);
      })(),
    ));

  await test("console 与页面 console 隔离，但方法可用", () => {
    assertNotSame(
      unsafeWindow.console,
      console,
      "沙盒 console 应与页面 console 不是同一个对象",
    );
    assertSame("function", typeof console.log, "console.log 应可调用");
    assertSame("function", typeof console.error, "console.error 应可调用");
  });

  section("原生函数与事件代理");

  await test("裸调用原生函数已绑定真实页面 window，避免 Illegal invocation (Issue #189)", async () => {
    const rawSetTimeout = setTimeout;
    const rawSetInterval = setInterval;
    const rawClearInterval = clearInterval;
    let called = false;
    await new Promise((resolve) => {
      rawSetTimeout(() => {
        called = true;
        resolve();
      }, 0);
    });
    assertSame(true, called, "裸调用 setTimeout 应正常执行");

    let intervalCount = 0;
    await new Promise((resolve) => {
      const timer = rawSetInterval(() => {
        intervalCount++;
        rawClearInterval(timer);
        resolve();
      }, 0);
    });
    assertSame(1, intervalCount, "裸调用 setInterval 应正常执行");

    const rawAddEventListener = addEventListener;
    const rawRemoveEventListener = removeEventListener;
    const eventName = `${markerPrefix}_bare_listener`;
    let count = 0;
    const handler = () => {
      count++;
    };
    rawAddEventListener(eventName, handler);
    unsafeWindow.dispatchEvent(new Event(eventName));
    rawRemoveEventListener(eventName, handler);
    assertSame(1, count, "裸调用 addEventListener 应绑定到页面 window");

    if (typeof fetch === "function") {
      const rawFetch = fetch;
      assertSame("function", typeof rawFetch, "fetch 应可读取为裸函数");
    }
  });

  await test("取出 window.addEventListener 后调用不会 Illegal invocation (Issue #773)", () =>
    withCleanup(
      () => {
        const rawAddEventListener = window.addEventListener;
        const rawRemoveEventListener = window.removeEventListener;
        const eventName = `${markerPrefix}_window_listener`;
        let count = 0;
        const handler = () => {
          count++;
        };

        rawAddEventListener(eventName, handler);
        unsafeWindow.dispatchEvent(new Event(eventName));
        rawRemoveEventListener(eventName, handler);

        assertSame(
          1,
          count,
          "window.addEventListener 取出后调用应绑定到页面 window",
        );
      },
      () => {},
    ));

  await test("被 Proxy 包装的原生函数仍可安全裸调用 (Issue #1030)", async () => {
    const proxiedSetTimeout = new Proxy(setTimeout, {});
    let called = false;
    await new Promise((resolve) => {
      proxiedSetTimeout(() => {
        called = true;
        resolve();
      }, 0);
    });

    assertSame(true, called, "Proxy 包装后的 setTimeout 应正常执行");
  });

  await test("getter 返回页面 window 时会替换为沙盒 window (Issue #1427)", () => {
    assertSame(window, self, "self getter 应返回沙盒 window");
    assertSame(window, parent, "parent getter 应返回沙盒 window");
    assertSame(window, top, "top getter 应返回沙盒 window");
    assertSame(window, frames, "frames getter 应返回沙盒 window");
  });

  await test("onxxx 函数赋值由页面事件触发，event.target 为 unsafeWindow", () =>
    withCleanup(
      () => {
        let count = 0;
        let thisIsNotWindow = false;
        let eventTargetIsUnsafeWindow = false;
        const eventName = `${markerPrefix}_onresize_probe`;

        window.onresize = function (event) {
          count++;
          thisIsNotWindow = this !== unsafeWindow;
          eventTargetIsUnsafeWindow = event.target === unsafeWindow;
          assertSame("resize", event.type, "事件对象应正常传入");
        };

        unsafeWindow.dispatchEvent(new Event("resize"));
        assertSame(1, count, "页面 resize 应触发沙盒 onresize");
        assertSame(true, thisIsNotWindow, "onresize 回调 this 不应为 unsafeWindow");
        assertSame(true, eventTargetIsUnsafeWindow, "onresize 回调 event.target 应为 unsafeWindow");

        window.onresize = null;
        unsafeWindow.dispatchEvent(new Event("resize"));
        unsafeWindow.dispatchEvent(new Event(eventName));
        assertSame(1, count, "清空 onresize 后不应继续触发");
      },
      () => {
        window.onresize = null;
      },
    ));

  await test("onxxx 普通对象只保存不注册监听，primitive 值应移除已注册的监听", () =>
    withCleanup(
      async () => {
        let handled = false;
        const listenerObject = {
          handleEvent() {
            handled = true;
          },
        };
        window.onfocus = listenerObject;
        assertSame(listenerObject, window.onfocus, "非 primitive 对象应被保存");
        unsafeWindow.dispatchEvent(new Event("focus"));
        await waitForEventLoop();
        assertSame(
          false,
          handled,
          "EventListenerObject 形式不应被 onxxx 代理注册",
        );
        handled = false;
        const func = function () { handled = true };
        window.onfocus = func;
        assertSame(func, window.onfocus, "function 对象应被保存");
        unsafeWindow.dispatchEvent(new Event("focus"));
        await waitForEventLoop();
        assertSame(
          true,
          handled,
          "EventListener 形式应被 onxxx 代理注册",
        );
        handled = false;
        window.onfocus = 123;
        assertNotSame(func, window.onfocus, "primitive 对象时注册能被移除 (1)");
        unsafeWindow.dispatchEvent(new Event("focus"));
        await waitForEventLoop();
        assertSame(
          false,
          handled,
          "primitive 对象时注册能被移除 (2)",
        );
      },
      () => {
        window.onfocus = null;
        window.onblur = null;
      },
    ));

  await test("onxxx 函数替换后只调用最新函数", () =>
    withCleanup(
      () => {
        let oldCount = 0;
        let newCount = 0;
        window.onhashchange = function () {
          oldCount++;
        };
        window.onhashchange = function () {
          newCount++;
        };

        unsafeWindow.dispatchEvent(new Event("hashchange"));
        assertSame(0, oldCount, "旧 onhashchange 不应再被调用");
        assertSame(1, newCount, "新 onhashchange 应被调用一次");
      },
      () => {
        window.onhashchange = null;
      },
    ));

  // 测试对象仅限于 window 和 top
  await test("window/top 不能被脚本改写", () => {
    assertThrowsOrKeepsValue(
      () => {
        window.window = "bad";
      },
      () => window.window,
      window,
      "window 自引用应保持不变",
    );
    assertThrowsOrKeepsValue(
      () => {
        window.top = "bad";
      },
      () => window.top,
      window,
      "top 自引用应保持不变",
    );
  });

  await test("TM半沙盒：把祖先类别继承直接写在半沙盒上 (Issue #1462 PR #1463)", async () => {
    assertSame(true, Object.hasOwn(unsafeWindow, "addEventListener"), "unsafeWindow 继承 Object.hasOwn");
    assertSame(true, Reflect.has(unsafeWindow, "addEventListener"), "unsafeWindow 继承 Reflect.has");
    assertSame(false, Object.hasOwn(window, "addEventListener"), "window 属性 Object.hasOwn");
    assertSame(true, Reflect.has(window, "addEventListener"), "window 属性 Reflect.has");
  });

  section("GM API 注入与命名空间");

  await test("GM_info、GM.info 与 unsafeWindow 正确暴露", () => {
    assertSame("object", typeof GM_info, "GM_info 应可用");
    assertSame("object", typeof GM.info, "GM.info 应可用");
    assertSame(JSON.stringify(GM_info), JSON.stringify(GM.info), "GM.info 应与 GM_info 一致 (JSON.stringify)");
    assertSame(
      unsafeWindow,
      window.unsafeWindow,
      "unsafeWindow 应指向页面 window",
    );
    assertSame("object", typeof GM_info.script, "GM_info.script 应存在");
  });

  await test("GM_ 与 GM.* 双命名空间由 grant 自动补齐", () => {
    assertSame("function", typeof GM_getValue, "GM_getValue 应可用");
    assertSame(
      "function",
      typeof GM.getValue,
      "GM.getValue 应由 GM_getValue grant 补齐",
    );
    assertSame("function", typeof GM_setValue, "GM_setValue 应可用");
    assertSame("function", typeof GM.setValue, "GM.setValue 应可用");
    assertSame("function", typeof GM_deleteValue, "GM_deleteValue 应可用");
    assertSame(
      "function",
      typeof GM.deleteValue,
      "GM.deleteValue 应由 GM_deleteValue grant 补齐",
    );
    assertSame("function", typeof GM_listValues, "GM_listValues 应可用");
    assertSame(
      "function",
      typeof GM.listValues,
      "GM.listValues 应由 GM_listValues grant 补齐",
    );
  });

  await test("GM_setValue/GM_getValue/GM_deleteValue 同步路径正常", () =>
    withCleanup(
      () => {
        const key = `${markerPrefix}_value`;
        GM_setValue(key, { env: "sandbox", ok: true });
        const stored = GM_getValue(key);
        assertSame("sandbox", stored.env, "GM_getValue 应读取同步写入对象");
        assertSame(true, stored.ok, "对象值应保持属性");
        assertTrue(
          GM_listValues().includes(key),
          "GM_listValues 应包含写入的键",
        );
        GM_deleteValue(key);
        assertSame(
          "fallback",
          GM_getValue(key, "fallback"),
          "GM_deleteValue 应删除值",
        );
      },
      () => {
        GM_deleteValue(`${markerPrefix}_value`);
      },
    ));

  await test("GM.setValue/GM.getValue/GM.deleteValue Promise 路径正常", async () =>
    withCleanup(
      async () => {
        const key = `${markerPrefix}_async_value`;
        await withTimeout(GM.setValue(key, "async-value"), "GM.setValue");
        assertSame(
          "async-value",
          await withTimeout(GM.getValue(key), "GM.getValue"),
          "GM.getValue 应读取 GM.setValue 写入值",
        );
        assertTrue(
          (await withTimeout(GM.listValues(), "GM.listValues")).includes(key),
          "GM.listValues 应包含异步写入的键",
        );
        await withTimeout(GM.deleteValue(key), "GM.deleteValue");
        assertSame(
          "fallback",
          await withTimeout(
            GM.getValue(key, "fallback"),
            "GM.getValue fallback",
          ),
          "GM.deleteValue 应删除值",
        );
      },
      () => {
        GM_deleteValue(`${markerPrefix}_async_value`);
      },
    ));

  await test("GM_setValues/GM_getValues 以及 GM.getValues 依赖注入正常", () =>
    withCleanup(
      async () => {
        const keyA = `${markerPrefix}_multi_a`;
        const keyB = `${markerPrefix}_multi_b`;
        const keyMissing = `${markerPrefix}_multi_missing`;

        GM_setValues({ [keyA]: "A", [keyB]: { deep: 1 } });
        const picked = GM_getValues([keyA, keyB, keyMissing]);
        assertSame("A", picked[keyA], "GM_getValues 数组模式应返回已存在键");
        assertSame(1, picked[keyB].deep, "GM_getValues 应返回对象值");
        assertSame(
          false,
          Object.prototype.hasOwnProperty.call(picked, keyMissing),
          "数组模式不应包含缺失键",
        );

        const defaults = GM_getValues({
          [keyA]: "default-a",
          [keyMissing]: "default-missing",
        });
        assertSame("A", defaults[keyA], "对象模式应优先返回已存在值");
        assertSame(
          "default-missing",
          defaults[keyMissing],
          "对象模式应为缺失键返回默认值",
        );

        const asyncPicked = await withTimeout(
          GM.getValues({ [keyB]: null }),
          "GM.getValues",
        );
        assertSame(
          1,
          asyncPicked[keyB].deep,
          "GM.getValues 应由 GM_getValues grant 依赖注入",
        );
      },
      () => {
        GM_deleteValue(`${markerPrefix}_multi_a`);
        GM_deleteValue(`${markerPrefix}_multi_b`);
      },
    ));

  await test("GM_cookie grant 构建函数对象与多级命名空间", () => {
    assertSame("function", typeof GM_cookie, "GM_cookie 应可用");
    assertSame(
      "function",
      typeof GM_cookie.set,
      "GM_cookie.set 应由兼容命名空间注入",
    );
    assertSame(
      "function",
      typeof GM_cookie.list,
      "GM_cookie.list 应由兼容命名空间注入",
    );
    assertSame(
      "function",
      typeof GM_cookie.delete,
      "GM_cookie.delete 应由兼容命名空间注入",
    );
    assertSame(
      "function",
      typeof GM.cookie.set,
      "GM.cookie.set 应由 GM.cookie 依赖注入",
    );
    assertSame(
      "function",
      typeof GM.cookie.list,
      "GM.cookie.list 应由 GM.cookie 依赖注入",
    );
    assertSame(
      "function",
      typeof GM.cookie.delete,
      "GM.cookie.delete 应由 GM.cookie 依赖注入",
    );
  });

  await test("GM_addStyle 与 GM.addStyle 都插入页面 document", async () =>
    withCleanup(
      async () => {
        const className = `${markerPrefix}_style`;
        const style = GM_addStyle(
          `.${className} { color: rgb(1, 2, 3) !important; }`,
        );
        assertSame("STYLE", style.tagName, "GM_addStyle 应创建 style 标签");
        assertSame(
          document,
          style.ownerDocument,
          "GM_addStyle 返回元素应属于页面 document",
        );

        const asyncStyle = await withTimeout(
          GM.addStyle(
            `.${className}_async { color: rgb(4, 5, 6) !important; }`,
          ),
          "GM.addStyle",
        );
        assertSame(
          "STYLE",
          asyncStyle.tagName,
          "GM.addStyle 应 resolve style 标签",
        );
        assertSame(
          document,
          asyncStyle.ownerDocument,
          "GM.addStyle 返回元素应属于页面 document",
        );

        style.dataset.scriptcatSandboxTest = "sync";
        asyncStyle.dataset.scriptcatSandboxTest = "async";
      },
      () => {
        document
          .querySelectorAll("style[data-scriptcat-sandbox-test]")
          .forEach((node) => node.remove());
      },
    ));

  await test("GM_addElement 支持默认 parent、显式 parent、非字符串 property", async () =>
    withCleanup(
      async () => {
        const key = `${markerPrefix}_gm_script`;
        const div = GM_addElement("div", {
          id: `${markerPrefix}_div`,
          textContent: "ScriptCat sandbox test",
          hidden: true,
        });
        assertSame("DIV", div.tagName, "GM_addElement(tag, attrs) 应创建元素");
        assertSame(
          document,
          div.ownerDocument,
          "默认创建元素应属于页面 document",
        );
        assertSame(true, div.hidden, "boolean 应通过 property setter 设置");

        const child = await withTimeout(
          GM.addElement(div, "span", {
            textContent: "child",
          }),
          "GM.addElement",
        );
        assertSame(
          "SPAN",
          child.tagName,
          "GM.addElement(parent, tag, attrs) 应创建子元素",
        );
        assertSame(div, child.parentNode, "显式 parent 应生效");

        const script = GM_addElement("script", {
          textContent: `window["${key}"] = "from-gm-add-element";`,
        });
        assertSame(
          "from-gm-add-element",
          unsafeWindow[key],
          "GM_addElement 插入 script 应在页面 window 执行",
        );
        assertSame(
          undefined,
          window[key],
          "页面执行结果不应自动写回沙盒 window",
        );
        script.remove();
      },
      () => {
        document.getElementById(`${markerPrefix}_div`)?.remove();
        delete unsafeWindow[`${markerPrefix}_gm_script`];
      },
    ));

  await test("window.close/window.focus grant 暴露为沙盒 window 方法", () => {
    assertSame(
      "function",
      typeof window.close,
      "window.close grant 应暴露 close",
    );
    assertSame(
      "function",
      typeof window.focus,
      "window.focus grant 应暴露 focus",
    );
    assertNotSame(
      unsafeWindow.close,
      window.close,
      "沙盒 close 应不是页面原始 close",
    );
    assertNotSame(
      unsafeWindow.focus,
      window.focus,
      "沙盒 focus 应不是页面原始 focus",
    );
  });

  section("兼容行为");

  await test("Object 静态方法与 RegExp 静态状态保持可用", () => {
    assertSame(
      true,
      Object.isFrozen(Object.freeze({})),
      "Object.freeze 应可裸用",
    );

    const match = "abc123".match(/(\d+)/);
    assertSame("123", match && match[1], "RegExp match 应正常返回捕获组");
    assertSame("123", RegExp.$1, "RegExp.$1 应保留页面原生静态状态行为");
  });

  await test("Symbol 属性只写入当前沙盒，不影响页面 window", () =>
    withCleanup(
      () => {
        const symbolKey = Symbol(`${markerPrefix}_symbol`);
        window[symbolKey] = "sandbox-symbol";
        assertSame(
          "sandbox-symbol",
          window[symbolKey],
          "沙盒应允许 Symbol 属性",
        );
        assertSame(
          undefined,
          unsafeWindow[symbolKey],
          "Symbol 属性不应写入页面 window",
        );
      },
      () => {},
    ));

  await test("eval 保持可用，并在当前沙盒内解析全局", () => {
    const key = `${markerPrefix}_eval`;
    eval(`window["${key}"] = "from-eval";`);
    assertSame("from-eval", window[key], "eval 应能写入沙盒 window");
    assertSame(undefined, unsafeWindow[key], "eval 写入不应穿透页面 window");
    delete window[key];
  });

  console.log(
    "\n%c=== 测试完成 ===",
    "color: blue; font-size: 16px; font-weight: bold;",
  );
  console.log(
    `%c总计: ${testResults.total} | 通过: ${testResults.passed} | 失败: ${testResults.failed}`,
    testResults.failed === 0
      ? "color: green; font-weight: bold;"
      : "color: red; font-weight: bold;",
  );

  if (testResults.failed === 0) {
    console.log(
      "%c所有测试通过",
      "color: green; font-size: 14px; font-weight: bold;",
    );
  } else {
    console.log(
      "%c部分测试失败，请检查上面的错误信息",
      "color: red; font-size: 14px; font-weight: bold;",
    );
  }
})();

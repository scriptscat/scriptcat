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
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @run-at       document-end
// ==/UserScript==

var testVar1001 = 1001;
const mpt = document.body.appendChild(document.createElement("test-element-1002"));
mpt.id = "test-element-1002";
mpt.name = "test-element-1002";

(async function () {
  "use strict";

  const { describe, it, expect, run } = SCTest.create({ name: "半沙盒环境测试" });

  const markerPrefix = `__scriptcat_sandbox_${Date.now()}_${Math.random().toString(36).slice(2)}`;

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

  // assertSame 只保留给 assertThrowsOrKeepsValue 内部使用（其实现不改，见下）；
  // 其余断言点已迁移为 expect(actual).toBe(expected)。
  function assertSame(expected, actual, message) {
    if (!Object.is(expected, actual)) {
      throw new Error(
        `${message} - 期望 ${formatValue(expected)}, 实际 ${formatValue(actual)}`,
      );
    }
  }

  function assertNotSame(unexpected, actual, message) {
    if (unexpected === actual) {
      throw new Error((message || "断言失败") + " - 不应等于 " + JSON.stringify(unexpected));
    }
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

  describe("沙盒全局身份", () => {
    it("检测全局 testVar1001 会否跳出沙盒", () => {
      expect(window["testVar1001"]).toBe(undefined);
      expect(unsafeWindow["testVar1001"]).toBe(undefined);
    });

    it("检测全局 test-element-1002", () => {
      expect(unsafeWindow["test-element-1002"]?.id).toBe("test-element-1002");
      expect(window["test-element-1002"]?.id).toBe(undefined);
    });

    it("window/self/globalThis/top/parent/frames 均指向沙盒对象", () => {
      expect(typeof unsafeWindow).toBe("object");
      assertNotSame(
        unsafeWindow,
        window,
        "默认 grant 环境下 window 不应是页面 window",
      );
      expect(self).toBe(window);
      expect(globalThis).toBe(window);
      expect(top).toBe(window);
      expect(parent).toBe(window);
      expect(frames).toBe(window);
      expect(Object.prototype.toString.call(window)).toBe("[object Window]");
    });

    it("沙盒 window 使用空原型，但保留页面 Window 外观 (Issue #962)", () => {
      expect(Object.getPrototypeOf(window)).toBe(null);
      expect(window.constructor).toBe(unsafeWindow.constructor);
      expect(window.__proto__).toBe(unsafeWindow.__proto__);
      expect(window instanceof unsafeWindow.constructor).toBe(false);
    });

    it("页面 DOM getter 返回真实页面对象", () => {
      expect(document).toBe(unsafeWindow.document);
      expect(location.href).toBe(unsafeWindow.location.href);
      expect(document.documentElement).toBe(unsafeWindow.document.documentElement);
    });

    it("页面全局变量不会自动穿透到沙盒 window", () =>
      withCleanup(
        () => {
          const key = `${markerPrefix}_page_global`;
          unsafeWindow[key] = "page-value";
          expect(unsafeWindow[key]).toBe("page-value");
          expect(window[key]).toBe(undefined);

          window[key] = "sandbox-value";
          expect(window[key]).toBe("sandbox-value");
          expect(unsafeWindow[key]).toBe("page-value");
        },
        () => {
          delete window[`${markerPrefix}_page_global`];
          delete unsafeWindow[`${markerPrefix}_page_global`];
        },
      ));

    it("页面 DOM named property 不应穿透为沙盒全局变量 (Issue #273, #700)", () =>
      withCleanup(
        () => {
          const id = `${markerPrefix}_named_element`;
          const div = document.createElement("div");
          div.id = id;
          document.body.appendChild(div);

          expect(unsafeWindow[id]).toBe(div);
          expect(window[id]).toBe(undefined);
        },
        () => {
          document.getElementById(`${markerPrefix}_named_element`)?.remove();
        },
      ));

    it("删除沙盒全局变量不应删除页面同名全局变量 (Issue #522)", () =>
      withCleanup(
        () => {
          const key = `${markerPrefix}_delete_page_global`;
          unsafeWindow[key] = "page-value";

          expect(window[key]).toBe(undefined);

          window[key] = "sandbox-value";
          expect(window[key]).toBe("sandbox-value");
          expect(unsafeWindow[key]).toBe("page-value");

          delete window[key];

          expect(window[key]).toBe(undefined);
          expect(unsafeWindow[key]).toBe("page-value");
        },
        () => {
          window[`${markerPrefix}_delete_page_global`] = undefined;
          delete window[`${markerPrefix}_delete_page_global`];
          delete unsafeWindow[`${markerPrefix}_delete_page_global`];
        },
      ));

    it("裸 delete 页面全局变量不应删除沙盒同名全局变量", () =>
      withCleanup(
        () => {
          const key = `${markerPrefix}_delete_bare_page_global`;
          unsafeWindow[key] = "page-value";
          window[key] = "sandbox-value";

          expect(window[key]).toBe("sandbox-value");
          expect(unsafeWindow[key]).toBe("page-value");

          try {
            Function(`return delete ${key};`)(); // 半沙盒在页面执行
          } catch (e) {
            console.error(e);
            delete unsafeWindow[key]; // fallback
          }

          expect(unsafeWindow[key]).toBe(undefined);
          expect(window[key]).toBe("sandbox-value");
        },
        () => {
          window[`${markerPrefix}_delete_bare_page_global`] = undefined;
          delete window[`${markerPrefix}_delete_bare_page_global`];
          delete unsafeWindow[`${markerPrefix}_delete_bare_page_global`];
        },
      ));

    it("Object.prototype 污染不会穿透到沙盒 window", () =>
      withCleanup(
        () => {
          const key = `${markerPrefix}_polluted`;
          Object.prototype[key] = "polluted-value";
          expect({}[key]).toBe("polluted-value");
          expect(window[key]).toBe(undefined);
          expect(key in window).toBe(false);
        },
        () => {
          delete Object.prototype[`${markerPrefix}_polluted`];
        },
      ));

    it("特殊关键字与内部字段不从页面或 GM context 泄漏", () =>
      withCleanup(
        () => {
          for (const key of ["define", "module", "exports"]) {
            const desc = Object.getOwnPropertyDescriptor(unsafeWindow, key);
            if (!desc || desc.writable || desc.set) {
              unsafeWindow[key] = `page-${key}`;
            }
          }

          expect(window.define).toBe(undefined);
          expect(window.module).toBe(undefined);
          expect(window.exports).toBe(undefined);

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
            expect(window[key]).toBe(undefined);
          }
        },
        (() => {
          const snapshots = snapshotPageProps(["define", "module", "exports"]);
          return () => restorePageProps(snapshots);
        })(),
      ));

    it("console 与页面 console 隔离，但方法可用", () => {
      assertNotSame(
        unsafeWindow.console,
        console,
        "沙盒 console 应与页面 console 不是同一个对象",
      );
      expect(typeof console.log).toBe("function");
      expect(typeof console.error).toBe("function");
    });
  });

  describe("原生函数与事件代理", () => {
    it("裸调用原生函数已绑定真实页面 window，避免 Illegal invocation (Issue #189)", async () => {
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
      expect(called).toBe(true);

      let intervalCount = 0;
      await new Promise((resolve) => {
        const timer = rawSetInterval(() => {
          intervalCount++;
          rawClearInterval(timer);
          resolve();
        }, 0);
      });
      expect(intervalCount).toBe(1);

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
      expect(count).toBe(1);

      if (typeof fetch === "function") {
        const rawFetch = fetch;
        expect(typeof rawFetch).toBe("function");
      }
    });

    it("取出 window.addEventListener 后调用不会 Illegal invocation (Issue #773)", () =>
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

          expect(count).toBe(1);
        },
        () => {},
      ));

    it("被 Proxy 包装的原生函数仍可安全裸调用 (Issue #1030)", async () => {
      const proxiedSetTimeout = new Proxy(setTimeout, {});
      let called = false;
      await new Promise((resolve) => {
        proxiedSetTimeout(() => {
          called = true;
          resolve();
        }, 0);
      });

      expect(called).toBe(true);
    });

    it("getter 返回页面 window 时会替换为沙盒 window (Issue #1427)", () => {
      expect(self).toBe(window);
      expect(parent).toBe(window);
      expect(top).toBe(window);
      expect(frames).toBe(window);
    });

    it("onxxx 函数赋值由页面事件触发，event.target 为 unsafeWindow", () =>
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
            expect(event.type).toBe("resize");
          };

          unsafeWindow.dispatchEvent(new Event("resize"));
          expect(count).toBe(1);
          expect(thisIsNotWindow).toBe(true);
          expect(eventTargetIsUnsafeWindow).toBe(true);

          window.onresize = null;
          unsafeWindow.dispatchEvent(new Event("resize"));
          unsafeWindow.dispatchEvent(new Event(eventName));
          expect(count).toBe(1);
        },
        () => {
          window.onresize = null;
        },
      ));

    it("onxxx 普通对象只保存不注册监听，primitive 值应移除已注册的监听", () =>
      withCleanup(
        async () => {
          let handled = false;
          const listenerObject = {
            handleEvent() {
              handled = true;
            },
          };
          window.onfocus = listenerObject;
          expect(window.onfocus).toBe(listenerObject);
          unsafeWindow.dispatchEvent(new Event("focus"));
          await waitForEventLoop();
          expect(handled).toBe(false);
          handled = false;
          const func = function () { handled = true };
          window.onfocus = func;
          expect(window.onfocus).toBe(func);
          unsafeWindow.dispatchEvent(new Event("focus"));
          await waitForEventLoop();
          expect(handled).toBe(true);
          handled = false;
          window.onfocus = 123;
          assertNotSame(func, window.onfocus, "primitive 对象时注册能被移除 (1)");
          unsafeWindow.dispatchEvent(new Event("focus"));
          await waitForEventLoop();
          expect(handled).toBe(false);
        },
        () => {
          window.onfocus = null;
          window.onblur = null;
        },
      ));

    it("onxxx 函数替换后只调用最新函数", () =>
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
          expect(oldCount).toBe(0);
          expect(newCount).toBe(1);
        },
        () => {
          window.onhashchange = null;
        },
      ));

    // 测试对象仅限于 window 和 top
    it("window/top 不能被脚本改写", () => {
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

    it("TM半沙盒：把祖先类别继承直接写在半沙盒上 (Issue #1462 PR #1463)", async () => {
      const trueWindow = unsafeWindow;
      const sandboxWindow = window;
      expect(Object.hasOwn(trueWindow, "addEventListener")).toBe(false);
      expect(Reflect.has(trueWindow, "addEventListener")).toBe(true);
      expect(Object.hasOwn(sandboxWindow, "addEventListener")).toBe(true);
      expect(Reflect.has(sandboxWindow, "addEventListener")).toBe(true);
    });
  });

  describe("GM API 注入与命名空间", () => {
    it("GM_info、GM.info 与 unsafeWindow 正确暴露", () => {
      expect(typeof GM_info).toBe("object");
      expect(typeof GM.info).toBe("object");
      expect(JSON.stringify(GM.info)).toBe(JSON.stringify(GM_info));
      expect(window.unsafeWindow).toBe(unsafeWindow);
      expect(typeof GM_info.script).toBe("object");
    });

    it("GM_ 与 GM.* 双命名空间由 grant 自动补齐", () => {
      expect(typeof GM_getValue).toBe("function");
      expect(typeof GM.getValue).toBe("function");
      expect(typeof GM_setValue).toBe("function");
      expect(typeof GM.setValue).toBe("function");
      expect(typeof GM_deleteValue).toBe("function");
      expect(typeof GM.deleteValue).toBe("function");
      expect(typeof GM_listValues).toBe("function");
      expect(typeof GM.listValues).toBe("function");
    });

    it("GM_setValue/GM_getValue/GM_deleteValue 同步路径正常", () =>
      withCleanup(
        () => {
          const key = `${markerPrefix}_value`;
          GM_setValue(key, { env: "sandbox", ok: true });
          const stored = GM_getValue(key);
          expect(stored.env).toBe("sandbox");
          expect(stored.ok).toBe(true);
          expect(GM_listValues().includes(key)).toBeTruthy();
          GM_deleteValue(key);
          expect(GM_getValue(key, "fallback")).toBe("fallback");
        },
        () => {
          GM_deleteValue(`${markerPrefix}_value`);
        },
      ));

    it("GM.setValue/GM.getValue/GM.deleteValue Promise 路径正常", async () =>
      withCleanup(
        async () => {
          const key = `${markerPrefix}_async_value`;
          await withTimeout(GM.setValue(key, "async-value"), "GM.setValue");
          expect(await withTimeout(GM.getValue(key), "GM.getValue")).toBe("async-value");
          expect(
            (await withTimeout(GM.listValues(), "GM.listValues")).includes(key)
          ).toBeTruthy();
          await withTimeout(GM.deleteValue(key), "GM.deleteValue");
          expect(
            await withTimeout(GM.getValue(key, "fallback"), "GM.getValue fallback")
          ).toBe("fallback");
        },
        () => {
          GM_deleteValue(`${markerPrefix}_async_value`);
        },
      ));

    it("GM_setValues/GM_getValues 以及 GM.getValues 依赖注入正常", () =>
      withCleanup(
        async () => {
          const keyA = `${markerPrefix}_multi_a`;
          const keyB = `${markerPrefix}_multi_b`;
          const keyMissing = `${markerPrefix}_multi_missing`;

          GM_setValues({ [keyA]: "A", [keyB]: { deep: 1 } });
          const picked = GM_getValues([keyA, keyB, keyMissing]);
          expect(picked[keyA]).toBe("A");
          expect(picked[keyB].deep).toBe(1);
          expect(Object.prototype.hasOwnProperty.call(picked, keyMissing)).toBe(false);

          const defaults = GM_getValues({
            [keyA]: "default-a",
            [keyMissing]: "default-missing",
          });
          expect(defaults[keyA]).toBe("A");
          expect(defaults[keyMissing]).toBe("default-missing");

          const asyncPicked = await withTimeout(
            GM.getValues({ [keyB]: null }),
            "GM.getValues",
          );
          expect(asyncPicked[keyB].deep).toBe(1);
        },
        () => {
          GM_deleteValue(`${markerPrefix}_multi_a`);
          GM_deleteValue(`${markerPrefix}_multi_b`);
        },
      ));

    it("GM_cookie grant 构建函数对象与多级命名空间", () => {
      expect(typeof GM_cookie).toBe("function");
      expect(typeof GM_cookie.set).toBe("function");
      expect(typeof GM_cookie.list).toBe("function");
      expect(typeof GM_cookie.delete).toBe("function");
      expect(typeof GM.cookie.set).toBe("function");
      expect(typeof GM.cookie.list).toBe("function");
      expect(typeof GM.cookie.delete).toBe("function");
    });

    it("GM_addStyle 与 GM.addStyle 都插入页面 document", async () =>
      withCleanup(
        async () => {
          const className = `${markerPrefix}_style`;
          const style = GM_addStyle(
            `.${className} { color: rgb(1, 2, 3) !important; }`,
          );
          expect(style.tagName).toBe("STYLE");
          expect(style.ownerDocument).toBe(document);

          const asyncStyle = await withTimeout(
            GM.addStyle(
              `.${className}_async { color: rgb(4, 5, 6) !important; }`,
            ),
            "GM.addStyle",
          );
          expect(asyncStyle.tagName).toBe("STYLE");
          expect(asyncStyle.ownerDocument).toBe(document);

          style.dataset.scriptcatSandboxTest = "sync";
          asyncStyle.dataset.scriptcatSandboxTest = "async";
        },
        () => {
          document
            .querySelectorAll("style[data-scriptcat-sandbox-test]")
            .forEach((node) => node.remove());
        },
      ));

    it("GM_addElement 支持默认 parent、显式 parent、非字符串 property", async () =>
      withCleanup(
        async () => {
          const key = `${markerPrefix}_gm_script`;
          const div = GM_addElement("div", {
            id: `${markerPrefix}_div`,
            textContent: "ScriptCat sandbox test",
            hidden: true,
          });
          expect(div.tagName).toBe("DIV");
          expect(div.ownerDocument).toBe(document);
          expect(div.hidden).toBe(true);

          const child = await withTimeout(
            GM.addElement(div, "span", {
              textContent: "child",
            }),
            "GM.addElement",
          );
          expect(child.tagName).toBe("SPAN");
          expect(child.parentNode).toBe(div);

          const script = GM_addElement("script", {
            textContent: `window["${key}"] = "from-gm-add-element";`,
          });
          expect(unsafeWindow[key]).toBe("from-gm-add-element");
          expect(window[key]).toBe(undefined);
          script.remove();
        },
        () => {
          document.getElementById(`${markerPrefix}_div`)?.remove();
          delete unsafeWindow[`${markerPrefix}_gm_script`];
        },
      ));

    it("window.close/window.focus grant 暴露为沙盒 window 方法", () => {
      expect(typeof window.close).toBe("function");
      expect(typeof window.focus).toBe("function");
      assertNotSame(unsafeWindow.close, window.close, "沙盒 close 应不是页面原始 close");
      assertNotSame(unsafeWindow.focus, window.focus, "沙盒 focus 应不是页面原始 focus");
    });
  });

  describe("兼容行为", () => {
    it("Object 静态方法与 RegExp 静态状态保持可用", () => {
      expect(Object.isFrozen(Object.freeze({}))).toBe(true);

      const match = "abc123".match(/(\d+)/);
      expect(match && match[1]).toBe("123");
      expect(RegExp.$1).toBe("123");
    });

    it("Symbol 属性只写入当前沙盒，不影响页面 window", () =>
      withCleanup(
        () => {
          const symbolKey = Symbol(`${markerPrefix}_symbol`);
          window[symbolKey] = "sandbox-symbol";
          expect(window[symbolKey]).toBe("sandbox-symbol");
          expect(unsafeWindow[symbolKey]).toBe(undefined);
        },
        () => {},
      ));

    if (location.origin.includes("content-security-policy")) {
      // CSP 不测试 eval
    } else {
      // eval 不一定能通过
      // 这跟沙盒无关。不应进行此测试
      it("eval 保持可用，并在当前沙盒内解析全局", () => {
        const key = `${markerPrefix}_eval`;
        eval(`window["${key}"] = "from-eval";`);
        expect(window[key]).toBe("from-eval");
        expect(unsafeWindow[key]).toBe(undefined);
        delete window[key];
      });
    }
  });

  await run();
})();

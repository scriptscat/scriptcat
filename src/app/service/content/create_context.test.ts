import { afterEach, describe, it, expect, vi } from "vitest";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { encodeRValue } from "@App/pkg/utils/message_value";
import { createContext, createProxyContext, shouldFnBind, type RealmRoots } from "./create_context";

const createScriptInfo = (metadata: Record<string, string[]> = {}): TScriptInfo =>
  ({
    id: 1,
    uuid: "script-uuid",
    name: "create-context-test",
    metadata: {
      grant: ["none"],
      version: ["1.0.0"],
      ...metadata,
    },
    code: "",
    sourceCode: "",
    value: {
      foo: "bar",
      nested: { a: 1 },
    },
    resource: {},
  }) as unknown as TScriptInfo;

const createTestContext = (grants: string[], metadata: Record<string, string[]> = {}) =>
  createContext(
    createScriptInfo(metadata),
    { script: { name: "create-context-test" }, scriptMetaStr: "" },
    "vitest",
    undefined as any,
    undefined as any,
    new Set(grants)
  );

const createSplitRealmRoots = (): RealmRoots => {
  const realmGlobal = Object.create(null) as Record<PropertyKey, any>;
  const hostWindow = Object.create(null) as Record<PropertyKey, any>;
  const eventTarget = new EventTarget();

  realmGlobal.Node = class RealmNode {};
  realmGlobal.XMLHttpRequest = class RealmXMLHttpRequest {};
  realmGlobal.realmOnly = "realm-value";
  Object.defineProperty(realmGlobal, "realmAccessor", {
    configurable: true,
    enumerable: true,
    get() {
      return this === realmGlobal ? "realm-receiver" : "wrong-receiver";
    },
  });

  hostWindow.constructor = window.constructor;
  hostWindow.EventTarget = EventTarget;
  hostWindow.Node = Node;
  hostWindow.NodeFilter = NodeFilter;
  hostWindow.Event = Event;
  hostWindow.XMLHttpRequest = class HostXMLHttpRequest {
    static DONE = 4;
  };
  hostWindow.document = document;
  hostWindow.hostOnly = "host-value";
  hostWindow.addEventListener = eventTarget.addEventListener.bind(eventTarget);
  hostWindow.removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
  hostWindow.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);
  Object.defineProperty(hostWindow, "onload", {
    configurable: true,
    enumerable: true,
    get: () => null,
    set: () => undefined,
  });

  return { realmGlobal, hostWindow };
};

describe.concurrent("shouldFnBind", () => {
  it.concurrent("不处理非原生函数", () => {
    const o: Record<string, any> = {};
    o.targetArrowFn = () => {};
    expect(shouldFnBind(o.targetArrowFn)).toBe(false);
    o.targetArrowFn = new Proxy(o.targetArrowFn, {});
    expect(shouldFnBind(o.targetArrowFn)).toBe(false);
    o.targetFn1 = function () {};
    expect(shouldFnBind(o.targetFn1)).toBe(false);
    o.targetFn1 = new Proxy(o.targetFn1, {});
    expect(shouldFnBind(o.targetFn1)).toBe(false);
    o.targetFn2 = function targetFn2() {};
    expect(shouldFnBind(o.targetFn2)).toBe(false);
    o.targetFn2 = new Proxy(o.targetFn2, {});
    expect(shouldFnBind(o.targetFn2)).toBe(false);
  });
  it.concurrent("处理Proxy Function #985", () => {
    const o: Record<string, any> = {};
    // 例1: valueOf
    o.valueOf = global.valueOf;
    expect(shouldFnBind(o.valueOf)).toBe(true);
    o.valueOf = new Proxy(o.valueOf, {});
    expect(shouldFnBind(o.valueOf)).toBe(true);
    // 例2: setTimeoutForTest1: 验证一次拦截
    // @ts-ignore
    o.setTimeoutForTest1 = global.setTimeoutForTest1;
    expect(shouldFnBind(o.setTimeoutForTest1)).toBe(true);
    o.setTimeoutForTest1 = new Proxy(o.setTimeoutForTest1, {
      apply: (target, thisArg, argArray) => {
        console.log("proxy call", { target, thisArg, argArray });
      },
    });
    expect(shouldFnBind(o.setTimeoutForTest1)).toBe(true);
    // 例2: setTimeoutForTest2: 验证二次拦截
    // @ts-ignore
    o.setTimeoutForTest2 = global.setTimeoutForTest2;
    expect(shouldFnBind(o.setTimeoutForTest2)).toBe(true);
    o.setTimeoutForTest2 = new Proxy(o.setTimeoutForTest2, {
      apply: (target, thisArg, argArray) => {
        console.log("proxy call", { target, thisArg, argArray });
      },
    });
    expect(shouldFnBind(o.setTimeoutForTest2)).toBe(true);
  });
});

describe.concurrent("createContext", () => {
  it.concurrent("按 @grant 注入 GM_ 与 GM.* 双命名空间，并忽略未知 grant", async () => {
    const context = createTestContext(["GM_getValue", "GM_setValue", "GM.cookie", "not_exist"]);

    expect(context.GM_getValue("foo")).toBe("bar");
    expect(await context.GM.getValue("foo")).toBe("bar");
    expect(context.GM_setValue.name).toBe("bound GM_setValue");
    expect(context.GM.setValue.name).toBe("bound GM.setValue");
    expect(context.GM.cookie.name).toBe("bound GM.cookie");
    expect(context.GM.cookie.set.name).toBe("bound GM.cookie.set");
    expect(context.GM.cookie.list.name).toBe("bound GM.cookie.list");
    expect(context.not_exist).toBeUndefined();
    expect(context.grantSet.has("not_exist")).toBe(false);
  });

  it.concurrent("兼容 GM.Cookie 风格的多级命名空间", () => {
    const context = createTestContext(["GM_cookie"]);

    expect(context.GM_cookie.name).toBe("bound GM_cookie");
    expect(context.GM_cookie.set.name).toBe("bound GM_cookie.set");
    expect(context.GM_cookie.list.name).toBe("bound GM_cookie.list");
    expect(context.GM_cookie.delete.name).toBe("bound GM_cookie.delete");
  });

  it.concurrent("window grant 先挂到 context.window，再由代理沙盒暴露为 window 方法", () => {
    const context = createTestContext(["window.close", "window.focus"]);
    const sandbox = createProxyContext(context);

    expect(context.close).toBeUndefined();
    expect(context.window.close.name).toBe("bound window.close");
    expect(context.window.focus.name).toBe("bound window.focus");
    expect(sandbox.close).toBe(context.window.close);
    expect(sandbox.focus).toBe(context.window.focus);
  });

  it.concurrent("early-start 脚本会等待 loadScriptResolve 后才完成 CAT_scriptLoaded", async () => {
    const context = createTestContext(["CAT_scriptLoaded"], {
      "early-start": [""],
      "run-at": ["document-start"],
    });

    let loaded = false;
    const loadedPromise = context.CAT_scriptLoaded().then(() => {
      loaded = true;
    });

    await Promise.resolve();
    expect(loaded).toBe(false);

    (context as any).loadScriptResolve();
    await loadedPromise;
    expect(loaded).toBe(true);
  });

  it.concurrent("非 early-start 脚本的 CAT_scriptLoaded 不会产生等待 Promise", () => {
    const context = createTestContext(["CAT_scriptLoaded"], {
      "run-at": ["document-end"],
    });

    expect(context.CAT_scriptLoaded()).toBeUndefined();
    expect((context as any).loadScriptResolve).toBeUndefined();
  });

  it.concurrent("setInvalidContext 会释放监听器且后续 valueUpdate 不再触发", () => {
    const script = createScriptInfo();
    const context = createContext(
      script,
      {},
      "vitest",
      undefined as any,
      undefined as any,
      new Set(["GM_addValueChangeListener"])
    );
    const listener = vi.fn();
    context.GM_addValueChangeListener("foo", listener);

    context.valueUpdate({
      id: "remote-1",
      uuid: script.uuid,
      storageName: "",
      sender: { runFlag: "other-run-flag", tabId: 7 },
      entries: [["foo", encodeRValue("next"), encodeRValue("bar")]],
      valueUpdated: true,
    });
    expect(listener).toHaveBeenCalledWith("foo", "bar", "next", true, 7);

    context.setInvalidContext();
    context.setInvalidContext();
    expect(context.isInvalidContext()).toBe(true);

    context.valueUpdate({
      id: "remote-2",
      uuid: script.uuid,
      storageName: "",
      sender: { runFlag: "other-run-flag", tabId: 8 },
      entries: [["foo", encodeRValue("again"), encodeRValue("next")]],
      valueUpdated: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe.concurrent("createProxyContext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.concurrent("隔离沙盒全局对象、保护内部字段，并提供一次性的 $ 入口", () => {
    const context = createTestContext(["GM_getValue"]);
    const sandbox = createProxyContext(context);

    expect(sandbox.window).toBe(sandbox);
    expect(sandbox.self).toBe(sandbox);
    expect(sandbox.globalThis).toBe(sandbox);
    expect(sandbox.parent).toBe(sandbox);
    // DOM 测试环境的 frames 可能返回 Window proxy；这里覆盖浏览器稳定的自引用关键字。
    expect(sandbox.GM_getValue("foo")).toBe("bar");
    expect(sandbox.runFlag).toBeUndefined();
    expect(sandbox.message).toBeUndefined();
    expect(sandbox.define).toBeUndefined();
    expect(sandbox.module).toBeUndefined();
    expect(sandbox.exports).toBeUndefined();
    expect(sandbox.console).not.toBe(console);

    const firstDollarRead = sandbox.$;
    expect(firstDollarRead).toBe(sandbox);
    expect("$" in sandbox).toBe(false);
  });

  it.concurrent("原生函数会绑定到真实 global，避免作为裸函数调用时报 Illegal invocation", () => {
    const sandbox = createProxyContext(createTestContext([]));
    const setTimeoutForTest1 = sandbox.setTimeoutForTest1;

    expect(() => setTimeoutForTest1(() => undefined, 0)).not.toThrow();
  });

  it.concurrent("onxxx 事件属性使用沙盒 this，并在清空后移除页面监听", () => {
    const addEventListener = vi.spyOn(global, "addEventListener");
    const removeEventListener = vi.spyOn(global, "removeEventListener");
    const sandbox = createProxyContext(createTestContext([]));
    const onload = vi.fn(function (this: any) {
      expect(this).toBe(sandbox);
    });

    sandbox.onload = onload;
    expect(addEventListener).toHaveBeenCalledWith("load", expect.any(Object));

    const eventObject = addEventListener.mock.calls.find(([name]) => name === "load")?.[1] as EventListenerObject;
    eventObject.handleEvent(new Event("load"));
    expect(onload).toHaveBeenCalledTimes(1);

    sandbox.onload = null;
    expect(removeEventListener).toHaveBeenCalledWith("load", eventObject);
  });

  it.concurrent("TM半沙盒：把祖先类别继承直接写在半沙盒上 ( #1462 #1463 )", () => {
    const sandbox = createProxyContext(createTestContext([]));
    expect(Object.hasOwn(sandbox, "addEventListener")).toBe(true);
  });

  describe.concurrent("split-global materialization", () => {
    it.concurrent("materializes separate realm and host roots through the eager snapshot", () => {
      const roots = createSplitRealmRoots();
      const sandbox = createProxyContext(createTestContext([]), roots);

      expect(sandbox.Node).toBe(roots.hostWindow.Node);
      expect(sandbox.Node.prototype).toBe(roots.hostWindow.Node.prototype);
      expect(sandbox.XMLHttpRequest).toBe(roots.hostWindow.XMLHttpRequest);
      expect(sandbox.XMLHttpRequest.DONE).toBe(4);
      expect(sandbox.EventTarget).toBe(roots.hostWindow.EventTarget);
      expect(sandbox.document).toBe(document);
      expect(sandbox.realmOnly).toBe("realm-value");
      expect(sandbox.realmAccessor).toBe("realm-receiver");
      expect(sandbox.hostOnly).toBeUndefined();

      const listener = vi.fn();
      sandbox.addEventListener("split-root", listener);
      roots.hostWindow.dispatchEvent(new Event("split-root"));
      expect(listener).toHaveBeenCalledTimes(1);
      sandbox.removeEventListener("split-root", listener);

      const onload = vi.fn();
      Reflect.set(sandbox, "onload", onload);
      roots.hostWindow.dispatchEvent(new Event("load"));
      Reflect.set(sandbox, "onload", null);
      roots.hostWindow.dispatchEvent(new Event("load"));
      expect(onload).toHaveBeenCalledTimes(1);
    });

    it.concurrent("keeps all self-referential window names inside the sandbox", () => {
      const sandbox = createProxyContext(createTestContext([]));

      expect(sandbox.window).toBe(sandbox);
      expect(sandbox.self).toBe(sandbox);
      expect(sandbox.globalThis).toBe(sandbox);
      expect(sandbox.top).toBe(sandbox);
      expect(sandbox.parent).toBe(sandbox);
      expect(sandbox.frames).toBe(sandbox);
    });

    it.concurrent("forwards live host accessors without leaking page globals", () => {
      const sandbox = createProxyContext(createTestContext([]));
      const pageKey = "__scriptcat_split_global_page_value";

      Reflect.set(window, pageKey, "page-value");
      try {
        expect(sandbox.document).toBe(window.document);
        expect(sandbox.location).toBe(window.location);
        expect(sandbox[pageKey]).toBeUndefined();
      } finally {
        Reflect.deleteProperty(window, pageKey);
      }
    });

    it.concurrent("preserves host constructor static constants and prototype identity", () => {
      const sandbox = createProxyContext(createTestContext([]));

      expect(sandbox.Node).toBe(window.Node);
      expect(sandbox.Node.ELEMENT_NODE).toBe(window.Node.ELEMENT_NODE);
      expect(sandbox.Node.prototype).toBe(window.Node.prototype);
      expect(sandbox.Event).toBe(window.Event);
      expect(sandbox.Event.prototype).toBe(window.Event.prototype);
    });

    it.concurrent("keeps JavaScript built-in static methods available", () => {
      const sandbox = createProxyContext(createTestContext([]));

      expect(sandbox.Number.isNaN).toBe(Number.isNaN);
      expect(sandbox.Math.max(2, 7)).toBe(7);
      expect(sandbox.Object.isFrozen(Object.freeze({}))).toBe(true);
    });

    it.concurrent("forwards extracted host methods with the host receiver", () => {
      const sandbox = createProxyContext(createTestContext([]));
      const add = sandbox.addEventListener;
      const remove = sandbox.removeEventListener;
      const dispatch = sandbox.dispatchEvent;
      const eventName = "__scriptcat_split_global_event";
      const listener = vi.fn();

      add(eventName, listener);
      dispatch(new Event(eventName));
      remove(eventName, listener);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it.concurrent("does not register an event listener for an object handler", () => {
      const sandbox = createProxyContext(createTestContext([]));
      const listenerObject = { handleEvent: vi.fn() };

      Reflect.set(sandbox, "onfocus", listenerObject);
      window.dispatchEvent(new Event("focus"));

      expect(listenerObject.handleEvent).not.toHaveBeenCalled();
      sandbox.onfocus = null;
    });

    it.concurrent("removes the old event listener when an on-property is cleared", () => {
      const sandbox = createProxyContext(createTestContext([]));
      const handler = vi.fn();

      sandbox.onresize = handler;
      window.dispatchEvent(new Event("resize"));
      sandbox.onresize = null;
      window.dispatchEvent(new Event("resize"));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it.concurrent("replaces an on-property listener without retaining the previous callback", () => {
      const sandbox = createProxyContext(createTestContext([]));
      const oldHandler = vi.fn();
      const newHandler = vi.fn();

      try {
        sandbox.onhashchange = oldHandler;
        sandbox.onhashchange = newHandler;
        window.dispatchEvent(new Event("hashchange"));

        expect(oldHandler).not.toHaveBeenCalled();
        expect(newHandler).toHaveBeenCalledTimes(1);
      } finally {
        sandbox.onhashchange = null;
      }
    });

    it.concurrent("isolates writes between split-global sandboxes", () => {
      const first = createProxyContext(createTestContext([]));
      const second = createProxyContext(createTestContext([]));

      first.__split_global_local_value = "first";

      expect(first.__split_global_local_value).toBe("first");
      expect(second.__split_global_local_value).toBeUndefined();
      expect(Reflect.get(window, "__split_global_local_value")).toBeUndefined();
    });

    it.concurrent("keeps the page window identity separate from the sandbox identity", () => {
      const sandbox = createProxyContext(createTestContext([]));

      expect(sandbox).not.toBe(window);
      expect(sandbox.unsafeWindow).toBe(window);
    });
  });
});

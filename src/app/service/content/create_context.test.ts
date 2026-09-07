import { afterEach, describe, it, expect, vi } from "vitest";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { encodeRValue } from "@App/pkg/utils/message_value";
import { createContext, createProxyContext, shouldFnBind } from "./create_context";

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
});

// Firefox 的 content / USER_SCRIPT world 全局是 Cu.Sandbox：globalThis 与 window 分属两个 realm，
// 沙盒的原型链在 Xray window 处截断，EventTarget.prototype 上的成员只能经 window 取得。
// happy-dom 里 globalThis === window，只能用一个「仅存在于 window 原型链上」的成员模拟该拓扑。
describe("Firefox content world：globalThis 与 window 分属不同 realm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("沙盒补齐只能经 window 原型链取得的成员 (#1692)", async () => {
    const windowProto = Object.create(null);
    // 原生 DOM 方法没有 prototype，这里必须用同样形状（方法简写），否则模型不成立
    windowProto.onlyReachableViaWindow = {
      onlyReachableViaWindow(this: unknown) {
        return this;
      },
    }.onlyReachableViaWindow;
    const fakeWindow = Object.create(windowProto);
    vi.stubGlobal("window", fakeWindow);
    vi.resetModules();

    const module = await import("./create_context.js");
    const context = module.createContext(
      createScriptInfo(),
      { script: { name: "create-context-test" }, scriptMetaStr: "" },
      "vitest",
      undefined as any,
      undefined as any,
      new Set<string>()
    );
    const sandbox = module.createProxyContext(context);

    expect(typeof sandbox.onlyReachableViaWindow).toBe("function");
    // bind 目标必须跟随该轮的根物件，否则跨 realm 呼叫会触发 brand check 失败
    expect(sandbox.onlyReachableViaWindow()).toBe(fakeWindow);
  });

  it("接口物件保留 prototype 与静态常量，不被 bind 剥空", async () => {
    // bind 的产物没有 prototype、也丢掉全部静态成员。Firefox 的 Cu.Sandbox 上
    // Node / NodeFilter 之类不是自有属性，会走到 protoBaseDescs 分支，
    // 无差别 bind 会让 Node.ELEMENT_NODE / NodeFilter.SHOW_TEXT 全变成 undefined。
    const windowProto = Object.create(null);
    // 构造函数形状（Node、Event、XMLHttpRequest）
    const NodeLike = function NodeLike() {};
    (NodeLike as any).ELEMENT_NODE = 1;
    windowProto.NodeLike = NodeLike;
    // 回调接口形状（NodeFilter）：大写字头但没有 prototype
    const FilterLike = () => undefined;
    (FilterLike as any).SHOW_TEXT = 4;
    windowProto.FilterLike = FilterLike;

    const fakeWindow = Object.create(windowProto);
    vi.stubGlobal("window", fakeWindow);
    vi.resetModules();

    const module = await import("./create_context.js");
    const sandbox = module.createProxyContext(
      module.createContext(
        createScriptInfo(),
        { script: { name: "create-context-test" }, scriptMetaStr: "" },
        "vitest",
        undefined as any,
        undefined as any,
        new Set<string>()
      )
    );

    expect(sandbox.NodeLike.ELEMENT_NODE).toBe(1);
    expect(sandbox.NodeLike.prototype).toBe(NodeLike.prototype);
    expect(sandbox.FilterLike.SHOW_TEXT).toBe(4);
  });

  it("window / self 指向沙盒自身，不逃逸到页面 window", async () => {
    // Firefox 下 globalThis.window 是页面 Window 的 Xray 包装，不等于 global；
    // 只按 global 判定自引用会让沙盒里的 window / self 指回页面，
    // 脚本写在 self 上的东西（例如沉浸式翻译的 GM_fetch）就落到了页面而不是沙盒。
    const pageWindow: Record<string, any> = Object.create(null);
    pageWindow.window = pageWindow;
    pageWindow.self = pageWindow;
    vi.stubGlobal("window", pageWindow);
    vi.resetModules();

    const module = await import("./create_context.js");
    const sandbox = module.createProxyContext(
      module.createContext(
        createScriptInfo(),
        { script: { name: "create-context-test" }, scriptMetaStr: "" },
        "vitest",
        undefined as any,
        undefined as any,
        new Set<string>()
      )
    );

    expect(sandbox.window).toBe(sandbox);
    expect(sandbox.self).toBe(sandbox);
  });
});

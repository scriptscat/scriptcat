import { afterEach, describe, expect, it, vi } from "vitest";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { encodeRValue } from "@App/pkg/utils/message_value";
import { createContext, createProxyContext, shouldFnBind, type RealmRoots } from "./create_context";

type AnyRecord = Record<PropertyKey, any>;

const REALM_INTRINSIC_KEYS = [
  "Object",
  "Function",
  "Array",
  "String",
  "Number",
  "Boolean",
  "RegExp",
  "Date",
  "Error",
  "Promise",
  "Map",
  "Set",
  "Symbol",
  "BigInt",
  "JSON",
  "Math",
  "Reflect",
] as const;

/**
 * 這個 event target 只實作 createProxyContext 真正依賴的 contract。
 * 它不依賴 happy-dom 的 Window、WindowProxy 或原生事件實作，讓事件測試只驗證
 * createEventProp 的註冊/移除/handleEvent 狀態機。
 */
class DeterministicEventTarget {
  private readonly listeners = new Map<string, Set<EventListener | EventListenerObject>>();

  addEventListener(type: string, listener: EventListener | EventListenerObject | null) {
    if (!listener) return;
    let entries = this.listeners.get(type);
    if (!entries) this.listeners.set(type, (entries = new Set()));
    entries.add(listener);
  }

  removeEventListener(type: string, listener: EventListener | EventListenerObject | null) {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event) {
    for (const listener of [...(this.listeners.get(event.type) || [])]) {
      if (typeof listener === "function") listener.call(undefined, event);
      else listener.handleEvent(event);
    }
    return true;
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size || 0;
  }
}

const createSplitRealmRoots = () => {
  const eventTarget = new DeterministicEventTarget();
  const realmGlobal = Object.create(null) as AnyRecord;
  const hostWindowPrototype = Object.create(null) as AnyRecord;
  const hostWindow = Object.create(hostWindowPrototype) as AnyRecord;

  // PseudoWindow 的 identity/brand 證據。
  hostWindow[Symbol.toStringTag] = "Window";
  hostWindow.constructor = function HostWindow() {};
  Object.defineProperty(hostWindow, "__proto__", {
    configurable: true,
    enumerable: false,
    value: hostWindowPrototype,
    writable: false,
  });

  // 用 object literal method 產生「無 prototype、但不是 native」的 host method。
  // createGlobalSnapshot 會把它放入 protoBaseDescs，materializeDescriptor 再綁定 hostWindow。
  const hostMethods = {
    addEventListener(type: string, listener: any) {
      return eventTarget.addEventListener(type, listener);
    },
    removeEventListener(type: string, listener: any) {
      return eventTarget.removeEventListener(type, listener);
    },
    dispatchEvent(event: Event) {
      return eventTarget.dispatchEvent(event);
    },
    dynamicPrototypeMethod(this: unknown) {
      return this;
    },
  };
  hostWindowPrototype.addEventListener = hostMethods.addEventListener;
  hostWindowPrototype.removeEventListener = hostMethods.removeEventListener;
  hostWindowPrototype.dispatchEvent = hostMethods.dispatchEvent;
  hostWindowPrototype.dynamicPrototypeMethod = hostMethods.dynamicPrototypeMethod;
  Object.defineProperty(hostWindowPrototype, "dynamicPrototypeValue", {
    configurable: true,
    enumerable: true,
    value: { source: "prototype" },
    writable: false,
  });

  // 兩個 root 都有，但刻意讓 realmGlobal own descriptor 勝出。
  const runtimeGlobal = globalThis as AnyRecord;
  for (const key of REALM_INTRINSIC_KEYS) {
    realmGlobal[key] = runtimeGlobal[key];
  }
  realmGlobal.realmOnly = "realm-value";
  Object.defineProperty(realmGlobal, "realmAccessor", {
    configurable: true,
    enumerable: true,
    get() {
      return this === realmGlobal ? "realm-receiver" : "wrong-receiver";
    },
  });

  const TestEvent = class TestEvent {
    type: string;

    constructor(type: string) {
      this.type = type;
    }
  };
  hostWindow.Event = TestEvent;
  hostWindow.EventTarget = class HostEventTarget {};

  // 只有必要的 document 保留為 host own；普通動態頁面屬性放在 prototype，
  // 避免和 hostOnlySecret 的隔離負向 regression 混成同一種 fixture。
  hostWindow.document = { owner: hostWindow };
  hostWindowPrototype.dynamicHostValue = { source: "host" };
  hostWindowPrototype.dynamicHostMethod = {
    dynamicHostMethod(this: unknown) {
      return this;
    },
  }.dynamicHostMethod;

  let dynamicHostAccessorValue = "host-value";
  Object.defineProperty(hostWindowPrototype, "dynamicHostAccessor", {
    configurable: true,
    enumerable: true,
    get() {
      return this === hostWindow ? dynamicHostAccessorValue : "wrong-receiver";
    },
    set(value) {
      dynamicHostAccessorValue = this === hostWindow ? value : "wrong-receiver";
    },
  });
  hostWindowPrototype.hostNativeCallable = Object.prototype.valueOf;

  Object.defineProperty(hostWindowPrototype, "location", {
    configurable: true,
    enumerable: true,
    get() {
      return this === hostWindow ? { href: "https://example.test/" } : undefined;
    },
    set() {
      // setter 只用來驗證 receiver；不改變 location object。
    },
  });

  const NodeLike = function NodeLike() {};
  (NodeLike as AnyRecord).ELEMENT_NODE = 1;
  hostWindow.NodeLike = NodeLike;

  const FilterLike = () => undefined;
  (FilterLike as AnyRecord).SHOW_TEXT = 4;
  hostWindow.FilterLike = FilterLike;

  const XMLHttpRequestLike = class XMLHttpRequestLike {};
  (XMLHttpRequestLike as AnyRecord).DONE = 4;
  hostWindow.XMLHttpRequestLike = XMLHttpRequestLike;

  Object.defineProperty(hostWindow, "onload", {
    configurable: true,
    enumerable: true,
    get: () => null,
    set: () => undefined,
  });
  Object.defineProperty(hostWindow, "oncustomcompat", {
    configurable: true,
    enumerable: true,
    get: () => null,
    set: () => undefined,
  });
  Object.defineProperty(hostWindowPrototype, "onmessage", {
    configurable: true,
    enumerable: true,
    get: () => null,
    set: () => undefined,
  });

  hostWindow.window = hostWindow;
  hostWindow.self = hostWindow;
  hostWindow.globalThis = hostWindow;
  hostWindow.top = hostWindow;
  hostWindow.parent = hostWindow;
  hostWindow.frames = hostWindow;

  const roots: RealmRoots = { realmGlobal, hostWindow };
  return { roots, eventTarget, hostWindow, hostWindowPrototype, realmGlobal, TestEvent };
};

const createSharedRealmRoots = () => {
  const fixture = createSplitRealmRoots();
  const runtimeGlobal = globalThis as AnyRecord;
  for (const key of REALM_INTRINSIC_KEYS) {
    fixture.hostWindow[key] = runtimeGlobal[key];
  }

  return {
    ...fixture,
    roots: {
      realmGlobal: fixture.hostWindow,
      hostWindow: fixture.hostWindow,
    } as RealmRoots,
  };
};

const createDefaultRootWindow = () => createSplitRealmRoots();

const createNavigableWindowFixture = () => {
  const fixture = createDefaultRootWindow();
  const navigation = new DeterministicEventTarget();
  let href = "https://example.test/";
  const location = Object.create(null) as AnyRecord;
  Object.defineProperty(location, "href", {
    configurable: true,
    enumerable: true,
    get: () => href,
    set: (value: string) => {
      href = value;
    },
  });
  // createSplitRealmRoots 的 prototype 上有只讀用的 location accessor；這裡必須
  // 明確建立 own data property，否則普通賦值只會命中 inherited setter。
  Object.defineProperty(fixture.hostWindow, "location", {
    configurable: true,
    enumerable: true,
    value: location,
    writable: true,
  });
  fixture.hostWindow.navigation = navigation;
  return { ...fixture, location, navigation };
};

const createProxyFixture = (extra: AnyRecord = {}) => {
  const fixture = createSplitRealmRoots();
  const context = Object.assign(Object.create(null), {
    window: Object.create(null),
    ...extra,
  });
  return {
    ...fixture,
    context,
    sandbox: createProxyContext(context, fixture.roots),
  };
};

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

describe("shouldFnBind", () => {
  it("只把 native-like callable 視為需要 receiver binding", () => {
    expect(shouldFnBind(Object.prototype.valueOf)).toBe(true);
    expect(shouldFnBind(() => undefined)).toBe(false);
    expect(shouldFnBind(function userFunction() {})).toBe(false);
    expect(shouldFnBind(function Constructor() {})).toBe(false);
    expect(shouldFnBind(new Proxy(Object.prototype.valueOf, {}))).toBe(true);

    const userArrow = () => undefined;
    const userFunction = function userFunction() {};
    // A Proxy hides the original source and presents a native-like string, so the heuristic binds it.
    expect(shouldFnBind(new Proxy(userArrow, {}))).toBe(true);
    expect(shouldFnBind(new Proxy(userFunction, {}))).toBe(false);
  });
});

describe("createContext: capability and lifecycle contract", () => {
  it("建立 GM_* / GM.* 對稱命名，並對未知 grant 保持閉合", async () => {
    const context = createTestContext(["GM_getValue", "GM_setValue", "GM_cookie", "not_exist"]);

    expect(context.GM_getValue("foo")).toBe("bar");
    expect(await context.GM.getValue("foo")).toBe("bar");
    expect(context.GM_setValue).toBeTypeOf("function");
    expect(context.GM.setValue).toBeTypeOf("function");
    expect(context.GM_cookie).toBeTypeOf("function");
    expect(context.GM_cookie.set).toBeTypeOf("function");
    expect(context.GM_cookie.list).toBeTypeOf("function");
    expect(context.GM_cookie.delete).toBeTypeOf("function");
    expect(context.not_exist).toBeUndefined();
    expect(context.grantSet.has("not_exist")).toBe(false);
    expect(context.grantSet.has("GM_getValue")).toBe(true);
    expect(context.grantSet.has("GM.getValue")).toBe(true);
  });

  it.each(["GM.cookie", "GM_cookie"] as const)("雙向注入 cookie API：輸入 %s 時兩種公開形狀都可用", (grant) => {
    const context = createTestContext([grant]);

    expect(context.GM.cookie).toBeTypeOf("function");
    expect(context.GM.cookie.set).toBeTypeOf("function");
    expect(context.GM.cookie.list).toBeTypeOf("function");
    expect(context.GM.cookie.delete).toBeTypeOf("function");
    expect(context.GM_cookie).toBeTypeOf("function");
    expect(context.GM_cookie.set).toBeTypeOf("function");
    expect(context.GM_cookie.list).toBeTypeOf("function");
    expect(context.GM_cookie.delete).toBeTypeOf("function");
    expect(context.grantSet.has("GM.cookie")).toBe(true);
    expect(context.grantSet.has("GM_cookie")).toBe(true);
  });

  it("將 window grant 留在 context.window，投影時才暴露到 sandbox", () => {
    const context = createTestContext(["window.close", "window.focus"]);
    const sandbox = createProxyContext(context, createSplitRealmRoots().roots);

    expect(context.close).toBeUndefined();
    expect(context.window.close).toBeTypeOf("function");
    expect(context.window.focus).toBeTypeOf("function");
    expect(sandbox.close).toBe(context.window.close);
    expect(sandbox.focus).toBe(context.window.focus);
  });

  it("early-start 的 CAT_scriptLoaded 只在 resolve 後完成", async () => {
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
    const loadScriptResolve = (context as unknown as AnyRecord).loadScriptResolve as () => void;
    loadScriptResolve();
    await loadedPromise;
    expect(loaded).toBe(true);
  });

  it("非 early-start 不建立多餘的等待點", () => {
    const context = createTestContext(["CAT_scriptLoaded"], { "run-at": ["document-end"] });
    const contextValues = context as unknown as AnyRecord;

    expect(context.CAT_scriptLoaded()).toBeUndefined();
    expect(contextValues.loadScriptResolve).toBeUndefined();
  });

  it("失效清理是 idempotent，且舊 value listener 不再收到更新", () => {
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

    const update = (id: string, value: string, tabId: number) =>
      context.valueUpdate({
        id,
        uuid: script.uuid,
        storageName: "",
        sender: { runFlag: "other-run-flag", tabId },
        entries: [["foo", encodeRValue(value), encodeRValue("bar")]],
        valueUpdated: true,
      });

    update("remote-1", "next", 7);
    expect(listener).toHaveBeenCalledWith("foo", "bar", "next", true, 7);

    const contextValues = context as unknown as AnyRecord;
    const runFlag = contextValues.runFlag;
    context.setInvalidContext();
    context.setInvalidContext();

    expect(context.isInvalidContext()).toBe(true);
    expect(contextValues.runFlag).not.toBe(runFlag);
    expect(contextValues.runFlag).toContain("(invalid)");
    expect(contextValues.message).toBeNull();
    expect(contextValues.scriptRes).toBeNull();

    update("remote-2", "again", 8);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe.sequential("createProxyContext: module default split roots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("不傳 roots 時仍從模組載入的 fake window 原型鏈補齊 host method", async () => {
    const fixture = createDefaultRootWindow();
    const hostArray = class HostArray {};
    fixture.hostWindow.Array = hostArray;
    vi.stubGlobal("defaultRootRealmOnly", "realm-default");
    vi.stubGlobal("window", fixture.hostWindow);
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

    expect(sandbox.dynamicPrototypeMethod()).toBe(fixture.hostWindow);
    expect(sandbox.dynamicPrototypeValue).toBe(fixture.hostWindow.dynamicPrototypeValue);
    expect(sandbox.Array).toBe(globalThis.Array);
    expect(sandbox.Array).not.toBe(hostArray);
    expect(sandbox.defaultRootRealmOnly).toBe("realm-default");
  });

  it("default roots 下 constructor/interface 仍保留 prototype 與 static member", async () => {
    const fixture = createDefaultRootWindow();
    vi.stubGlobal("window", fixture.hostWindow);
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

    expect(sandbox.NodeLike.ELEMENT_NODE).toBe(1);
    expect(sandbox.NodeLike.prototype).toBe(fixture.hostWindow.NodeLike.prototype);
    expect(sandbox.FilterLike.SHOW_TEXT).toBe(4);
    expect(sandbox.XMLHttpRequestLike.DONE).toBe(4);
  });

  it("default roots 下 unsafeWindow 指向 host，window/self/globalThis 仍指向當前 sandbox", async () => {
    const fixture = createDefaultRootWindow();
    vi.stubGlobal("window", fixture.hostWindow);
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

    expect(context.unsafeWindow).toBe(fixture.hostWindow);
    expect(sandbox.unsafeWindow).toBe(fixture.hostWindow);
    expect(sandbox).not.toBe(fixture.hostWindow);
    expect(sandbox.window).toBe(sandbox);
    expect(sandbox.self).toBe(sandbox);
    expect(sandbox.globalThis).toBe(sandbox);
  });

  it("default roots 下有 window.onurlchange grant 時可由同一 host navigation channel 收到事件", async () => {
    const fixture = createNavigableWindowFixture();
    vi.stubGlobal("window", fixture.hostWindow);
    vi.resetModules();

    const module = await import("./create_context.js");
    const context = module.createContext(
      createScriptInfo(),
      { script: { name: "create-context-test" }, scriptMetaStr: "" },
      "vitest",
      undefined as any,
      undefined as any,
      new Set(["window.onurlchange"])
    );
    const sandbox = module.createProxyContext(context);
    const handler = vi.fn(function (this: unknown, event: any) {
      expect(this).toBe(sandbox);
      expect(event.type).toBe("urlchange");
      expect(typeof event.url).toBe("string");
    });

    expect(context.onurlchange).toBeNull();
    sandbox.onurlchange = handler;
    fixture.location.href = "https://example.test/next";
    fixture.navigation.dispatchEvent(new Event("navigate"));
    await Promise.resolve();

    const destinationEvent = new Event("navigate");
    Object.defineProperty(destinationEvent, "destination", {
      configurable: true,
      value: { url: "https://example.test/destination" },
    });
    fixture.location.href = "https://example.test/final";
    fixture.navigation.dispatchEvent(destinationEvent);
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0].url).toBe("https://example.test/next");
    expect(handler.mock.calls[1][0].url).toBe("https://example.test/destination");
    expect(sandbox.onurlchange).toBe(handler);
  });
});

describe("createProxyContext: deterministic realm contract", () => {
  it("固定 window/self/globalThis，並把每次 sandbox 的寫入隔離", () => {
    const first = createProxyFixture({ GM_getValue: vi.fn() });
    const second = createProxyFixture({ GM_getValue: vi.fn() });

    expect(first.sandbox.window).toBe(first.sandbox);
    expect(first.sandbox.self).toBe(first.sandbox);
    expect(first.sandbox.globalThis).toBe(first.sandbox);
    expect(first.sandbox).not.toBe(first.hostWindow);
    expect(Object.getPrototypeOf(first.sandbox)).toBeNull();
    expect(first.sandbox.define).toBeUndefined();
    expect(first.sandbox.module).toBeUndefined();
    expect(first.sandbox.exports).toBeUndefined();
    expect(first.sandbox.console).not.toBe(console);

    const dollar = first.sandbox.$;
    expect(dollar).toBe(first.sandbox);
    expect("$" in first.sandbox).toBe(false);
    expect(first.sandbox.$).toBeUndefined();

    first.sandbox.__local = "first";
    expect(first.sandbox.__local).toBe("first");
    expect(second.sandbox.__local).toBeUndefined();
    expect(first.hostWindow.__local).toBeUndefined();
    expect(first.sandbox.GM_getValue).toBe(first.context.GM_getValue);
  });

  it("realmGlobal own descriptor 優先於 hostWindow 同名 descriptor", () => {
    const fixture = createSplitRealmRoots();
    const realmMath = { max: () => "realm" };
    const hostMath = { max: () => "host" };
    fixture.realmGlobal.Math = realmMath;
    fixture.hostWindow.Math = hostMath;
    fixture.realmGlobal.realmNativeCallable = Object.prototype.valueOf;
    fixture.hostWindowPrototype.realmNativeCallable = Object.prototype.toString;
    fixture.realmGlobal.realmDataVsHostAccessor = "realm-data";
    Object.defineProperty(fixture.hostWindowPrototype, "realmDataVsHostAccessor", {
      configurable: true,
      enumerable: true,
      get: () => "host-accessor",
      set: () => undefined,
    });
    fixture.realmGlobal.realmDataVsHostNative = "realm-data";
    fixture.hostWindowPrototype.realmDataVsHostNative = Object.prototype.valueOf;
    Object.defineProperty(fixture.realmGlobal, "sameAccessor", {
      configurable: true,
      enumerable: true,
      get() {
        return this === fixture.realmGlobal ? "realm" : "wrong-receiver";
      },
      set(value: string) {
        fixture.realmGlobal.sameAccessorValue = this === fixture.realmGlobal ? value : "wrong-receiver";
      },
    });
    Object.defineProperty(fixture.hostWindowPrototype, "sameAccessor", {
      configurable: true,
      enumerable: true,
      get() {
        return this === fixture.hostWindow ? "host" : "wrong-receiver";
      },
      set() {
        throw new Error("host accessor should not win over realm own accessor");
      },
    });

    const sandbox = createProxyContext(Object.create(null), fixture.roots);

    expect(sandbox.Math).toBe(realmMath);
    expect(sandbox.Math).not.toBe(hostMath);
    expect(sandbox.realmOnly).toBe("realm-value");
    expect(sandbox.realmAccessor).toBe("realm-receiver");
    expect(sandbox.realmNativeCallable()).toBe(fixture.realmGlobal);
    expect(sandbox.sameAccessor).toBe("realm");
    expect(sandbox.realmDataVsHostAccessor).toBe("realm-data");
    expect(sandbox.realmDataVsHostNative).toBe("realm-data");
  });

  it("Chrome shared-root 下仍保留 host prototype、內建 static 與 alias 語義", () => {
    const fixture = createSharedRealmRoots();
    const sandbox = createProxyContext(Object.create(null), fixture.roots);

    expect(sandbox.Math).toBe(fixture.hostWindow.Math);
    expect(sandbox.Math.max(2, 7)).toBe(7);
    expect(Object.hasOwn(sandbox, "addEventListener")).toBe(true);
    expect(sandbox.document).toBe(fixture.hostWindow.document);
    expect(sandbox.dynamicPrototypeMethod()).toBe(fixture.hostWindow);
    expect(sandbox.dynamicHostAccessor).toBe("host-value");

    sandbox.dynamicHostAccessor = "updated";
    expect(sandbox.dynamicHostAccessor).toBe("updated");
    expect(sandbox.window).toBe(sandbox);
    expect(sandbox.self).toBe(sandbox);
    expect(sandbox.globalThis).toBe(sandbox);
  });

  it("收集 host prototype 與明確保留的 document own 成員，並綁定正確 receiver", () => {
    const fixture = createSplitRealmRoots();
    const sandbox = createProxyContext(Object.create(null), fixture.roots);

    expect(sandbox.dynamicHostValue).toBe(fixture.hostWindow.dynamicHostValue);
    expect(sandbox.dynamicHostMethod()).toBe(fixture.hostWindow);
    expect(sandbox.dynamicPrototypeMethod()).toBe(fixture.hostWindow);
    expect(sandbox.hostNativeCallable()).toBe(fixture.hostWindow);
    expect(sandbox.dynamicPrototypeValue).toBe(fixture.hostWindow.dynamicPrototypeValue);
    expect(sandbox.dynamicHostAccessor).toBe("host-value");
    expect(sandbox.document).toBe(fixture.hostWindow.document);

    sandbox.dynamicHostAccessor = "updated";
    expect(sandbox.dynamicHostAccessor).toBe("updated");

    expect(Object.getOwnPropertyDescriptor(sandbox, "dynamicPrototypeValue")).toMatchObject({
      value: fixture.hostWindow.dynamicPrototypeValue,
      writable: false,
      enumerable: true,
      configurable: true,
    });
  });

  it("host own page property 會隨 host descriptor snapshot 複製到 sandbox", () => {
    const fixture = createSplitRealmRoots();
    fixture.hostWindow.hostOnlySecret = { source: "page-only" };
    Object.defineProperty(fixture.hostWindow, "hostOnlyHiddenSecret", {
      configurable: true,
      enumerable: false,
      value: { source: "page-only-hidden" },
      writable: true,
    });

    const sandbox = createProxyContext(Object.create(null), fixture.roots);

    expect(sandbox.hostOnlySecret).toBe(fixture.hostWindow.hostOnlySecret);
    expect(sandbox.hostOnlyHiddenSecret).toBe(fixture.hostWindow.hostOnlyHiddenSecret);
  });

  it("保留 constructor/interface 的 prototype 與 static member，不把它們 bind 剝空", () => {
    const fixture = createSplitRealmRoots();
    const sandbox = createProxyContext(Object.create(null), fixture.roots);

    expect(sandbox.NodeLike.ELEMENT_NODE).toBe(1);
    expect(sandbox.NodeLike.prototype).toBe(fixture.hostWindow.NodeLike.prototype);
    expect(sandbox.FilterLike.SHOW_TEXT).toBe(4);
    expect(sandbox.FilterLike).toBe(fixture.hostWindow.FilterLike);
    expect(sandbox.XMLHttpRequestLike.DONE).toBe(4);
    expect(sandbox.XMLHttpRequestLike.prototype).toBe(fixture.hostWindow.XMLHttpRequestLike.prototype);
  });

  it("以 hostWindow identity 建立 pseudo-window 的 toStringTag/constructor/__proto__", () => {
    const fixture = createSplitRealmRoots();
    const sandbox = createProxyContext(Object.create(null), fixture.roots);

    expect(Object.prototype.toString.call(sandbox)).toBe("[object Window]");
    expect(sandbox.constructor).toBe(fixture.hostWindow.constructor);
    expect(sandbox.__proto__).toBe(fixture.hostWindow.__proto__);
    expect(Object.getPrototypeOf(sandbox)).toBeNull();
  });

  it("抽出 host EventTarget 方法後仍可呼叫，且 listener 只觸發一次", () => {
    const fixture = createSplitRealmRoots();
    const sandbox = createProxyContext(Object.create(null), fixture.roots);
    const eventName = "extracted-host-event";
    const listener = vi.fn();
    const add = sandbox.addEventListener;
    const remove = sandbox.removeEventListener;
    const dispatch = sandbox.dispatchEvent as unknown as (event: { type: string }) => boolean;

    add(eventName, listener);
    dispatch(new fixture.TestEvent(eventName));
    remove(eventName, listener);
    dispatch(new fixture.TestEvent(eventName));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(fixture.eventTarget.listenerCount(eventName)).toBe(0);
  });

  it("僅存在於 host prototype 的 onmessage descriptor 也會建立 sandbox event channel", () => {
    const fixture = createSplitRealmRoots();
    const sandbox = createProxyContext(Object.create(null), fixture.roots);
    const handler = vi.fn(function (this: unknown) {
      expect(this).toBe(sandbox);
    });

    sandbox.onmessage = handler;
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("message"));
    sandbox.onmessage = null;
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("message"));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(fixture.eventTarget.listenerCount("message")).toBe(0);
  });

  it("host prototype accessor 以最近 descriptor 為準，不被 parent descriptor 覆寫", () => {
    const fixture = createSplitRealmRoots();
    const parentPrototype = Object.create(null) as AnyRecord;
    const hostPrototype = Object.create(parentPrototype) as AnyRecord;
    let hostValue = "unset";

    Object.defineProperty(parentPrototype, "precedenceAccessor", {
      configurable: true,
      enumerable: true,
      get: () => "parent",
      set: () => undefined,
    });
    Object.defineProperty(hostPrototype, "precedenceAccessor", {
      configurable: true,
      enumerable: true,
      get() {
        return this === fixture.hostWindow ? "host" : "wrong-receiver";
      },
      set(value: string) {
        hostValue = this === fixture.hostWindow ? value : "wrong-receiver";
      },
    });
    Object.defineProperty(hostPrototype, "hostAccessor", {
      configurable: true,
      enumerable: true,
      get() {
        return this === fixture.hostWindow ? "host" : "wrong-receiver";
      },
      set(value: string) {
        hostValue = this === fixture.hostWindow ? value : "wrong-receiver";
      },
    });
    Object.setPrototypeOf(parentPrototype, fixture.hostWindowPrototype);
    Object.setPrototypeOf(fixture.hostWindow, hostPrototype);

    const sandbox = createProxyContext(Object.create(null), fixture.roots);

    expect(sandbox.precedenceAccessor).toBe("host");
    expect(sandbox.hostAccessor).toBe("host");
    sandbox.hostAccessor = "updated";
    expect(hostValue).toBe("updated");
  });

  it("accessor materialization 不應依賴 host getter/setter 自身的 .bind，且保留 descriptor flags", () => {
    const fixture = createSplitRealmRoots();
    let receivedValue = "unset";
    const getter = function (this: unknown) {
      return this === fixture.hostWindow ? "host" : "wrong-receiver";
    };
    const setter = function (this: unknown, value: string) {
      receivedValue = this === fixture.hostWindow ? value : "wrong-receiver";
    };

    // 模擬 Xray callable：函數本身存在，但不保證透過 property lookup 取得 .bind。
    Object.defineProperty(getter, "bind", { configurable: true, value: undefined });
    Object.defineProperty(setter, "bind", { configurable: true, value: undefined });
    Object.defineProperty(fixture.hostWindowPrototype, "xrayLikeAccessor", {
      configurable: true,
      enumerable: true,
      get: getter,
      set: setter,
    });

    const sandbox = createProxyContext(Object.create(null), fixture.roots);
    const descriptor = Object.getOwnPropertyDescriptor(sandbox, "xrayLikeAccessor");

    expect(sandbox.xrayLikeAccessor).toBe("host");
    sandbox.xrayLikeAccessor = "updated";
    expect(receivedValue).toBe("updated");
    expect(descriptor).toMatchObject({ configurable: true, enumerable: true });
    expect(descriptor?.get).toBeTypeOf("function");
    expect(descriptor?.set).toBeTypeOf("function");
  });

  it("同名 realm accessor 不會阻止 host on* event property 被收集", () => {
    const fixture = createSplitRealmRoots();
    Object.defineProperty(fixture.realmGlobal, "oncollectorcollision", {
      configurable: false,
      enumerable: true,
      get: () => "realm-accessor",
    });
    Object.defineProperty(fixture.hostWindow, "oncollectorcollision", {
      configurable: true,
      enumerable: true,
      get: () => null,
      set: () => undefined,
    });

    const sandbox = createProxyContext(Object.create(null), fixture.roots);
    const handler = vi.fn();

    sandbox.oncollectorcollision = handler;
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("collectorcollision"));
    sandbox.oncollectorcollision = null;

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("on* 狀態機：function replacement 不重複註冊，object/null 會移除 callback", () => {
    const fixture = createSplitRealmRoots();
    const sandbox = createProxyContext(Object.create(null), fixture.roots);
    const first = vi.fn();
    const second = vi.fn(function (this: unknown) {
      expect(this).toBe(sandbox);
    });
    const objectHandler = { handleEvent: vi.fn() };

    sandbox.onload = first;
    sandbox.onload = second;
    expect(fixture.eventTarget.listenerCount("load")).toBe(1);
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("load"));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    Reflect.set(sandbox, "onload", objectHandler);
    expect(fixture.eventTarget.listenerCount("load")).toBe(0);
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("load"));
    expect(objectHandler.handleEvent).not.toHaveBeenCalled();

    const third = vi.fn();
    sandbox.onload = third;
    expect(fixture.eventTarget.listenerCount("load")).toBe(1);
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("load"));
    expect(third).toHaveBeenCalledTimes(1);

    Reflect.set(sandbox, "onload", 0);
    expect(sandbox.onload).toBeNull();
    expect(fixture.eventTarget.listenerCount("load")).toBe(0);
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("load"));
    expect(third).toHaveBeenCalledTimes(1);

    Reflect.set(sandbox, "onload", "not-a-handler");
    expect(sandbox.onload).toBeNull();
    expect(fixture.eventTarget.listenerCount("load")).toBe(0);
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("load"));
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("split realm 下 self/window/globalThis 寫入都留在當前 sandbox", () => {
    const fixture = createSplitRealmRoots();
    const sandbox = createProxyContext(Object.create(null), fixture.roots);

    Reflect.set(sandbox.self, "__split_alias_value", "sandbox-value");

    expect(Reflect.get(sandbox.window, "__split_alias_value")).toBe("sandbox-value");
    expect(Reflect.get(sandbox.globalThis, "__split_alias_value")).toBe("sandbox-value");
    expect(Reflect.get(fixture.hostWindow, "__split_alias_value")).toBeUndefined();
  });

  it("top/parent/frames 在自身引用與 iframe 非自身引用間保持語義", () => {
    const fixture = createSplitRealmRoots();
    const parentWindow = Object.create(null);
    const topWindow = Object.create(null);
    const frames = Object.create(null);
    fixture.hostWindow.parent = parentWindow;
    fixture.hostWindow.top = topWindow;
    fixture.hostWindow.frames = frames;

    const iframeSandbox = createProxyContext(Object.create(null), fixture.roots);
    expect(iframeSandbox.parent).toBe(parentWindow);
    expect(iframeSandbox.top).toBe(topWindow);
    expect(iframeSandbox.frames).toBe(frames);

    fixture.hostWindow.parent = fixture.hostWindow;
    fixture.hostWindow.top = fixture.hostWindow;
    fixture.hostWindow.frames = fixture.hostWindow;
    const topSandbox = createProxyContext(Object.create(null), fixture.roots);
    expect(topSandbox.parent).toBe(topSandbox);
    expect(topSandbox.top).toBe(topSandbox);
    expect(topSandbox.frames).toBe(topSandbox);
  });

  it("context protect 欄位不會複製到 script global，但已授權 API 會複製", () => {
    const api = vi.fn();
    const fixture = createProxyFixture({
      GM_getValue: api,
      runFlag: "internal-run-flag",
      message: { secret: true },
      contentMsg: { secret: true },
      grantSet: new Set(["GM_getValue"]),
      EE: { secret: true },
    });

    expect(fixture.sandbox.GM_getValue).toBe(api);
    expect(fixture.sandbox.runFlag).toBeUndefined();
    expect(fixture.sandbox.message).toBeUndefined();
    expect(fixture.sandbox.contentMsg).toBeUndefined();
    expect(fixture.sandbox.grantSet).toBeUndefined();
    expect(fixture.sandbox.EE).toBeUndefined();
  });

  it("沒有 window.onurlchange grant 時不建立 accessor 或 host navigation channel", () => {
    const fixture = createSplitRealmRoots();
    const sandbox = createProxyContext(createTestContext([]), fixture.roots);
    const handler = vi.fn();

    expect(sandbox.onurlchange).toBeUndefined();
    expect("onurlchange" in sandbox).toBe(false);

    sandbox.onurlchange = handler;
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("urlchange"));

    expect(handler).not.toHaveBeenCalled();
    expect(fixture.eventTarget.listenerCount("urlchange")).toBe(0);
  });

  it("@grant window.onurlchange 使用獨立 accessor 與 host urlchange channel", () => {
    const fixture = createSplitRealmRoots();
    const context = createTestContext(["window.onurlchange"]);

    expect(context.onurlchange).toBeNull();
    const sandbox = createProxyContext(context, fixture.roots);
    const handler = vi.fn(function (this: unknown) {
      expect(this).toBe(sandbox);
    });

    sandbox.onurlchange = handler;
    expect(sandbox.onurlchange).toBe(handler);
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("urlchange"));
    expect(handler).toHaveBeenCalledTimes(1);

    sandbox.onurlchange = null;
    fixture.hostWindow.dispatchEvent(new fixture.TestEvent("urlchange"));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

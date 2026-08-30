import type { TScriptInfo } from "@App/app/repo/scripts";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { Message } from "@Packages/message/types";
import EventEmitter from "eventemitter3";
import { GMContextApiGet, protect } from "./gm_api/gm_context";
import { isEarlyStartScript } from "./utils";
import { ListenerManager } from "./listener_manager";
import { createGMBase } from "./gm_api/gm_api";
import { attachNavigateHandler, type UrlChangeEvent } from "./gm_api/navigation_handle";

// 不要使用 {}, 改使用 Object.create(null) - 避免在页面生成沙盒时，受到 Object.prototype 被注入的影响

// 构建沙盒上下文
export const createContext = (
  scriptRes: TScriptInfo,
  GMInfo: any,
  envPrefix: string,
  message: Message,
  contentMsg: Message,
  scriptGrants: Set<string>
) => {
  // 按照GMApi构建
  const valueChangeListener = new ListenerManager<GMTypes.ValueChangeListener>();
  const EE = new EventEmitter<string, any>();
  // 如果是preDocumentStart脚本，装载loadScriptPromise
  let loadScriptPromise: Promise<void> | undefined;
  let loadScriptResolve: (() => void) | undefined;
  if (isEarlyStartScript(scriptRes.metadata)) {
    loadScriptPromise = new Promise((resolve) => {
      loadScriptResolve = resolve;
    });
  }
  let invalid = false;
  const GM = Object.create(null);
  GM.info = GMInfo;
  const context = createGMBase({
    prefix: envPrefix,
    message,
    contentMsg,
    scriptRes,
    valueChangeListener,
    EE,
    runFlag: uuidv4(),
    eventId: 10000,
    GM: GM,
    GM_info: GMInfo,
    window: Object.create(null),
    grantSet: new Set(),
    loadScriptPromise,
    loadScriptResolve,
    setInvalidContext() {
      if (invalid) return;
      invalid = true;
      this.valueChangeListener.clear();
      this.EE.removeAllListeners();
      this.runFlag = `${uuidv4()}(invalid)`; // 更改 uuid 防止 runFlag 相关操作
      // 释放记忆
      this.message = null;
      this.scriptRes = null;
      this.valueChangeListener = null;
      this.EE = null;
    },
    isInvalidContext() {
      return invalid;
    },
  });
  const grantedAPIs: { [key: string]: any } = Object.create(null);
  const __methodInject__ = (grant: string): boolean => {
    const grantSet: Set<string> = context.grantSet;
    const s = GMContextApiGet(grant);
    if (!s) return false; // @grant 的定义未实现，略过 (返回 false 表示 @grant 不存在)
    if (grantSet.has(grant)) return true; // 重复的@grant，略过 (返回 true 表示 @grant 存在)
    grantSet.add(grant);
    for (const { fnKey, api, param } of s) {
      grantedAPIs[fnKey] = api.bind(context);
      const depend = param?.depend;
      if (depend) {
        for (const grant of depend) {
          __methodInject__(grant);
        }
      }
    }
    return true;
  };
  for (const grant of scriptGrants) {
    // GM. 与 GM_ 都需要注入
    __methodInject__(grant);
    if (grant.startsWith("GM.")) {
      __methodInject__(grant.replace("GM.", "GM_"));
    } else if (grant.startsWith("GM_")) {
      __methodInject__(grant.replace("GM_", "GM."));
    }
  }
  // 兼容GM.Cookie.*
  for (const fnKey of Object.keys(grantedAPIs)) {
    const fnKeyArray = fnKey.split(".");
    const m = fnKeyArray.length;
    let g = context;
    let s = "";
    for (let i = 0; i < m; i++) {
      const part = fnKeyArray[i];
      s += `${i ? "." : ""}${part}`;
      g = g[part] || (g[part] = grantedAPIs[s] || Object.create(null));
    }
  }
  context.unsafeWindow = window;
  if (scriptGrants.has("window.onurlchange") && context.onurlchange === undefined) {
    context.onurlchange = null;
    attachNavigateHandler(window as any);
  }
  return context;
};

const noEval = false;

// 取得原生函数代码表示
const getNativeCodeSegs = () => {
  const k = "propertyIsEnumerable"; // 选用 Object.propertyIsEnumerable 取得原生函数代码表示
  const codeSeg = `${Object[k]}`;
  const idx1 = codeSeg.indexOf(k);
  const idx2 = codeSeg.indexOf("()");
  const idx3 = codeSeg.lastIndexOf("(");
  if (idx1 > 0 && idx2 > 0 && idx3 === idx2) {
    return [codeSeg.substring(0, idx1), codeSeg.substring(idx1 + k.length)];
  }
  return null;
};

const ncs = getNativeCodeSegs();

// 判断是否应该将函数绑定到global （原生函数）
export const shouldFnBind = (f: any) => {
  if (typeof f !== "function") return false;
  // 函数有 prototype 即为 Class
  if ("prototype" in f) return false; // 避免getter, 使用 in operator (注意, nodeJS的测试环境有异)
  // 要求函数名字小写字头 能筛选掉 NodeFilter 之类 Interface （ 大写开头不用于直接呼叫 ）
  // 要求函数名字不包含空白 能筛选掉 已经this绑定函数
  const { name } = f as typeof Function.prototype;
  if (!name) return false;
  const e = name.charCodeAt(0);
  if (e >= 97 && e <= 122 && !name.includes(" ")) {
    // 为避免浏览器插件封装了 原生函数，需要进行 toString 测试 （Proxy封装例外）
    if (ncs?.[1]) {
      const s = `${f}`;
      // 广告拦截扩展进行Proxy封装后丢失名字 （Chrome：所有经Proxy封装都会变成无名原生函数）
      if (s === `${ncs[0]}${name}${ncs[1]}` || s === `${ncs[0]}${ncs[1]}`) {
        return true;
      }
    } else {
      // 代码错误，全部 bind
      return true;
    }
  }
  return false;
};

// 取物件本身及所有父类(不包含Object)的PropertyDescriptor
type DescriptorOwner = Record<PropertyKey, any>;
type DescriptorEntry = [string | symbol, PropertyDescriptor];
type TrackedDescriptor = {
  descriptor: PropertyDescriptor;
  receiver: DescriptorOwner;
  isConstructor: boolean;
};

type DescriptorMap = Record<string, PropertyDescriptor>;

const getAllPropertyDescriptors = (obj: DescriptorOwner, callback: (value: DescriptorEntry) => void) => {
  while (obj && obj !== Object) {
    const descs = Object.getOwnPropertyDescriptors(obj);
    Reflect.ownKeys(descs).forEach((key) => callback([key, descs[key as keyof typeof descs]]));
    obj = Object.getPrototypeOf(obj);
  }
};

// constructor/interface 不可绑定，否则 bind 会丢失 prototype 和静态成员。
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const isConstructorOrInterface = (value: unknown): value is Function =>
  typeof value === "function" && ("prototype" in value || /^[A-Z]/.test(String(Reflect.get(value, "name"))));

const trackDescriptor = (descriptor: PropertyDescriptor, receiver: DescriptorOwner): TrackedDescriptor => ({
  descriptor,
  receiver,
  isConstructor: isConstructorOrInterface(descriptor.value),
});

const materializeDescriptor = ({ descriptor, receiver, isConstructor }: TrackedDescriptor): PropertyDescriptor => {
  if ("value" in descriptor) {
    if (typeof descriptor.value !== "function" || isConstructor) return { ...descriptor };
    return {
      ...descriptor,
      value: Function.prototype.bind.call(descriptor.value, receiver),
    };
  }
  return {
    ...descriptor,
    get: descriptor.get?.bind(receiver),
    set: descriptor.set?.bind(receiver),
  };
};

// Firefox 的 content / USER_SCRIPT world 将 JavaScript global 与页面 window 拆成两个 realm。
// 这里只读取 hostWindow 的原型链，并转发确定需要页面 brand 的成员，避免把页面全局 own properties 带入沙盒。
const hostWindowAccessors = new Set([
  "document",
  "location",
  "navigator",
  "history",
  "screen",
  "performance",
  "crypto",
  "localStorage",
  "sessionStorage",
  "visualViewport",
  "innerWidth",
  "innerHeight",
  "scrollX",
  "scrollY",
  "devicePixelRatio",
]);
const hostWindowMethods = new Set([
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "getComputedStyle",
  "matchMedia",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "scroll",
  "scrollTo",
  "scrollBy",
  "blur",
]);
const hostWindowConstructors = new Set([
  "Window",
  "EventTarget",
  "Node",
  "Element",
  "HTMLElement",
  "Document",
  "DocumentFragment",
  "ShadowRoot",
  "Text",
  "Range",
  "MutationObserver",
  "NodeFilter",
  "TreeWalker",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "PointerEvent",
  "InputEvent",
  "FocusEvent",
  "ErrorEvent",
  "ProgressEvent",
  "MessageEvent",
  "StorageEvent",
  "WheelEvent",
  "DragEvent",
  "ClipboardEvent",
  "DOMParser",
  "XMLSerializer",
  "FormData",
  "File",
  "FileList",
  "Blob",
  "URL",
  "URLSearchParams",
  "Headers",
  "Request",
  "Response",
  "XMLHttpRequest",
]);
const hostWindowKeys = new Set([...hostWindowAccessors, ...hostWindowMethods, ...hostWindowConstructors]);

type GlobalSnapshot = {
  sharedInitCopy: typeof globalThis & Record<PropertyKey, any>;
  eventKeys: Set<string>;
};

export type RealmRoots = {
  realmGlobal: DescriptorOwner;
  hostWindow: DescriptorOwner;
};

const createGlobalSnapshot = ({ realmGlobal, hostWindow }: RealmRoots): GlobalSnapshot => {
  // descsCache 记录已处理的属性；先处理的 realm/子类 descriptor 不会被后续父类覆盖。
  const descsCache: Set<string | symbol> = new Set(["eval", "window", "self", "globalThis", "top", "parent"]);
  const initOwnDescs = Object.getOwnPropertyDescriptors(realmGlobal);
  // overriddenDescs 会以 sandbox own descriptor 覆盖原有定义；eventKeys 只记录需要模拟的 on* 属性。
  const overriddenDescs: DescriptorMap = Object.create(null);
  const eventKeys = new Set<string>();
  // hostEventKeys 用于区分 host 原型事件，避免第二次遍历 hostWindow 时重复处理。
  const hostEventKeys = new Set<string>();
  const protoBaseDescs: DescriptorMap = Object.create(null);

  const getHostWindowDescriptor = (key: string): PropertyDescriptor | undefined => {
    let owner: DescriptorOwner | null = hostWindow;
    while (owner) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (descriptor) return descriptor;
      owner = Object.getPrototypeOf(owner);
    }
    return undefined;
  };

  const collectRealmDescriptors = () => {
    // 包含物件本身及所有父类(不包含Object)的PropertyDescriptor。
    // 主要是找出哪些 function 值、setter/getter 需要替换 global window。
    getAllPropertyDescriptors(realmGlobal, ([key, desc]) => {
      if (!desc || descsCache.has(key) || typeof key !== "string") return;

      if (desc.writable) {
        // 替换 function 的 this 为实际的 global window。被封装的属性会继续向父类寻找原生属性；constructor/interface 则保留原值。
        if (shouldFnBind(desc.value)) {
          overriddenDescs[key] = materializeDescriptor(trackDescriptor(desc, realmGlobal));
          descsCache.add(key); // 必须：子类属性覆盖父类属性
        } else if (!(key in initOwnDescs) && !Object.hasOwn(realmGlobal, key) && !protoBaseDescs[key]) {
          protoBaseDescs[key] = materializeDescriptor(trackDescriptor(desc, realmGlobal));
        }
        return;
      }

      if (desc.configurable && desc.get && desc.set && desc.enumerable && key.startsWith("on")) {
        // 替换 onxxxxx 事件赋值操作，例如 (window.)onload、(window.)onerror。
        eventKeys.add(key);
      } else if (desc.get || desc.set) {
        // 替换 getter/setter 的 this 为实际的 global window，例如 (window.)location、(window.)document。
        overriddenDescs[key] = materializeDescriptor(trackDescriptor(desc, realmGlobal));
        descsCache.add(key); // 必须：子类属性覆盖父类属性
      }
    });
  };

  const collectHostWindowPrototypeDescriptors = () => {
    const hostWindowPrototype = Object.getPrototypeOf(hostWindow);
    if (!hostWindowPrototype) return;

    getAllPropertyDescriptors(hostWindowPrototype, ([key, desc]) => {
      if (!desc || descsCache.has(key) || typeof key !== "string") return;

      if (desc.configurable && desc.get && desc.set && key.startsWith("on")) {
        eventKeys.add(key);
        hostEventKeys.add(key);
        return;
      }

      if (desc.writable) {
        if (shouldFnBind(desc.value)) {
          overriddenDescs[key] = materializeDescriptor(trackDescriptor(desc, hostWindow));
          descsCache.add(key);
        } else if (!(key in initOwnDescs) && !Object.hasOwn(realmGlobal, key) && !protoBaseDescs[key]) {
          protoBaseDescs[key] = materializeDescriptor(trackDescriptor(desc, hostWindow));
        }
      } else if (desc.get || desc.set) {
        overriddenDescs[key] = materializeDescriptor(trackDescriptor(desc, hostWindow));
        descsCache.add(key);
      }
    });
  };

  const collectHostWindowEventDescriptors = () => {
    getAllPropertyDescriptors(hostWindow, ([key, desc]) => {
      if (
        typeof key !== "string" ||
        hostEventKeys.has(key) ||
        !key.startsWith("on") ||
        !desc.configurable ||
        !desc.get ||
        !desc.set
      ) {
        return;
      }
      eventKeys.add(key);
    });
  };

  const addHostWindowForwarding = (key: string) => {
    if (!(key in hostWindow)) return;
    const hostDescriptor = getHostWindowDescriptor(key);
    if (hostWindowAccessors.has(key)) {
      overriddenDescs[key] = {
        configurable: true,
        enumerable: true,
        get: () => Reflect.get(hostWindow, key, hostWindow),
        ...(hostDescriptor?.set
          ? {
              set: (value: any) => {
                Reflect.set(hostWindow, key, value, hostWindow);
              },
            }
          : {}),
      };
    } else if (hostWindowMethods.has(key)) {
      const method = Reflect.get(hostWindow, key, hostWindow);
      overriddenDescs[key] = {
        configurable: true,
        enumerable: true,
        writable: true,
        value: typeof method === "function" ? Function.prototype.bind.call(method, hostWindow) : method,
      };
    } else if (hostWindowConstructors.has(key)) {
      overriddenDescs[key] = {
        configurable: true,
        enumerable: true,
        writable: true,
        value: Reflect.get(hostWindow, key, hostWindow),
      };
    }
  };

  // 第一趟 realmGlobal：Firefox 的 content / USER_SCRIPT world 在这里保留完整的 JavaScript 内置对象。
  collectRealmDescriptors();
  // 第二趟 hostWindow 原型链：补齐 Xray window 无法取得的 DOM/EventTarget 成员。
  // 一般的 hostWindow own properties 不应带入沙盒，只有事件属性和下面的白名单会被转发。
  collectHostWindowPrototypeDescriptors();
  descsCache.clear(); // 内存释放
  collectHostWindowEventDescriptors();

  for (const key of hostWindowKeys) addHostWindowForwarding(key);

  // sharedInitCopy: 完全继承Window.prototype 及 自定义 OwnPropertyDescriptor
  // OwnPropertyDescriptor定义 为 原OwnPropertyDescriptor定义 (DragEvent, MouseEvent, RegExp, EventTarget, JSON等)
  //  + 覆盖定义 (document, location, setTimeout, setInterval, addEventListener 等)
  // sharedInitCopy: ScriptCat脚本共通使用

  // PseudoWindow 没有真实 Window.prototype，因此祖先成员必须先手动复制到 sandbox own descriptors。
  const USE_PSEUDO_WINDOW = true; // 日后或能设置使 ScriptCat的沙盒 window 能以 name / id 存取页面元素

  class PseudoWindow {}
  const PseudoWindowPrototype = PseudoWindow.prototype;
  Object.defineProperty(PseudoWindowPrototype, Symbol.toStringTag, {
    //@ts-ignore
    value: hostWindow[Symbol.toStringTag],
    writable: false,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(PseudoWindowPrototype, "constructor", {
    value: hostWindow.constructor,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(PseudoWindowPrototype, "__proto__", {
    //@ts-ignore
    value: hostWindow.__proto__,
    writable: false,
    enumerable: false,
    configurable: true,
  });

  const sharedInitCopy = USE_PSEUDO_WINDOW
    ? Object.create(null, {
        ...protoBaseDescs, // 较快的 @unwrap 注入时有机会改变 EventTarget.prototype
        ...Object.getOwnPropertyDescriptors(PseudoWindowPrototype),
        ...initOwnDescs,
        ...overriddenDescs,
      })
    : Object.create(Object.getPrototypeOf(realmGlobal), {
        ...initOwnDescs,
        ...overriddenDescs,
      });

  return { sharedInitCopy, eventKeys };
};

const defaultGlobalSnapshot = createGlobalSnapshot({ realmGlobal: global, hostWindow: window });

// 把沙盒的 console 和网页的 console 隔离
const initConsoleDescs = Object.getOwnPropertyDescriptors(console);
const ConsolePrototype = Object.getPrototypeOf(console);

type GMWorldContext = typeof globalThis & Record<PropertyKey, any>;

const isPrimitive = (x: any) => x !== Object(x);

// 拦截上下文
export const createProxyContext = <const Context extends GMWorldContext>(
  context: any,
  roots: RealmRoots = { realmGlobal: global, hostWindow: window }
): Context => {
  // let withContext: Context | undefined | { [key: string]: any } = undefined;
  // 为避免做成混乱。 ScriptCat脚本中 self, globalThis, parent 为固定值不能修改

  const { sharedInitCopy, eventKeys } =
    roots.realmGlobal === global && roots.hostWindow === window ? defaultGlobalSnapshot : createGlobalSnapshot(roots);
  const ownDescs = Object.getOwnPropertyDescriptors(sharedInitCopy);

  // mySandbox: ScriptCat各脚本独自使用
  let mySandbox: typeof sharedInitCopy | undefined = undefined;
  const hostAddEventListener = roots.hostWindow.addEventListener.bind(roots.hostWindow);
  const hostRemoveEventListener = roots.hostWindow.removeEventListener.bind(roots.hostWindow);

  // 用 eventHandling 机制模拟 onxxxxxxx 事件设置
  // 监听事件实际上的方法是eventObject.handleEvent
  const createEventProp = (key: string) => {
    const eventName = (<string>key).slice(2);
    // 赋值变量
    const eventObject: EventListenerObject & { fn: any } = {
      fn: null,
      handleEvent(event) {
        const fn = mySandbox![key];
        if (!fn || fn !== this.fn) {
          hostRemoveEventListener(eventName, eventObject);
          this.fn = null;
        } else {
          fn.call(mySandbox, event);
        }
      },
    };
    return {
      get() {
        return eventObject.fn;
      },
      set(newVal: EventListener | any) {
        const { fn } = eventObject;
        if (newVal !== fn) {
          if (isPrimitive(newVal)) {
            // 按照实际操作，primitive types (number, string, boolean, ...) 会被转换成 null
            newVal = null;
          }
          if (typeof fn !== typeof newVal) {
            // function <-> function 时无需重新监听
            if (typeof fn === "function") {
              // 停止当前事件监听
              hostRemoveEventListener(eventName, eventObject);
            } else if (typeof newVal === "function") {
              // 非primitive types 的话，只考虑 function type
              // Symbol, Object (包括 EventListenerObject ) 等只会保存而不进行事件监听
              hostAddEventListener(eventName, eventObject);
            }
          }
          eventObject.fn = newVal;
        }
      },
    };
  };

  for (const key of eventKeys) {
    const eventSetterGetter = createEventProp(key);
    ownDescs[key] = {
      ...ownDescs[key],
      ...eventSetterGetter,
    };
  }

  // split realm 下 hostWindow 可能经由 realmGlobal.window 暴露；这些别名必须始终留在当前 sandbox 内。
  for (const key of ["window", "self", "globalThis", "top", "parent", "frames"]) {
    ownDescs[key] = {
      configurable: true,
      enumerable: true,
      get() {
        return mySandbox;
      },
    };
  }
  if (noEval) {
    if (ownDescs?.eval?.value) {
      ownDescs.eval.value = undefined;
    }
  }

  // 一次性 get, 用于 with(this.$) 设计
  ownDescs.$ = {
    enumerable: false,
    configurable: true,
    get() {
      delete (<any>this).$; // 一次性
      return mySandbox; // 非拦截（TM相容）
    },
  };

  // @grant window.onurlchange
  if (context?.onurlchange === null) {
    let currentValue: ((this: GlobalEventHandlers, ev: UrlChangeEvent) => any) | null = null;
    ownDescs.onurlchange = {
      enumerable: true,
      configurable: true,
      get() {
        return currentValue;
      },
      set(nv) {
        if (typeof nv !== "function") nv = null;
        currentValue = nv;
        return true;
      },
    };
  }

  // 把初始Copy加上特殊变量后，生成一份新Copy
  mySandbox = Object.create(Object.getPrototypeOf(sharedInitCopy), ownDescs) as typeof globalThis &
    Record<PropertyKey, any>;

  // 处理特殊关键字，不能穿越出沙盒，也不能被外部修改
  for (const key of ["define", "module", "exports"]) {
    mySandbox[key] = undefined;
  }

  // 脚本window设置

  // 把 GM Api (或其他全域API) 复制到 脚本window
  // 请手动检查避开key，防止与window的属性setter有冲突 或 属性名重复
  for (const key of Object.keys(context)) {
    if (key in protect || key === "window") continue;
    mySandbox[key] = context[key]; // window以外
  }

  // 把 GM context物件的 window属性内容移至exposedWindow
  // 由于目前只有 window.close, window.open, window.onurlchange, 不需要循环 window
  const cWindow = context.window as (Window & Record<string, any>) | undefined;

  // @grant window.close
  if (cWindow?.close) {
    mySandbox.close = cWindow.close;
  }

  // @grant window.focus
  if (cWindow?.focus) {
    mySandbox.focus = cWindow.focus;
  }

  // @grant window.onurlchange
  if (context?.onurlchange === null) {
    const handle = function (this: Window & Record<string, any>, e: UrlChangeEvent) {
      this.onurlchange?.(e);
    } as EventListener;
    (<EventTarget>roots.hostWindow).addEventListener("urlchange", handle.bind(mySandbox), false);
  }

  // 从网页 console 隔离出来的沙盒 console
  mySandbox.console = Object.create(ConsolePrototype, initConsoleDescs);

  return mySandbox;
};

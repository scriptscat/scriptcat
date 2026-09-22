import type { TScriptInfo } from "@App/app/repo/scripts";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { Message } from "@Packages/message/types";
import EventEmitter from "eventemitter3";
import { GMContextApiGet, protect } from "./gm_api/gm_context";
import { getGrantCandidates } from "./gm_api/grant";
import { isEarlyStartScript } from "./utils";
import { ListenerManager } from "./listener_manager";
import { createGMBase, type IGM_Base } from "./gm_api/gm_api";
import { attachNavigateHandler, type UrlChangeEvent } from "./gm_api/navigation_handle";
import { nativeCall, Native } from "./global";

const createCapability = (api: (...args: any[]) => any, receiver: object) => {
  // 由闭包提供上下文，脚本侧只传 API 自身的参数。
  /* eslint-disable prefer-rest-params -- 以固定参数转发保留调用参数数量，避免每次调用创建 rest 数组。 */
  const capability = function (this: unknown) {
    switch (arguments.length) {
      case 0:
        return api(receiver);
      case 1:
        return api(receiver, arguments[0]);
      case 2:
        return api(receiver, arguments[0], arguments[1]);
      case 3:
        return api(receiver, arguments[0], arguments[1], arguments[2]);
      case 4:
        return api(receiver, arguments[0], arguments[1], arguments[2], arguments[3]);
      default: {
        // Reflect.apply accepts an array-like object; a null prototype avoids inherited index setters.
        const args = Native.objectCreate(null) as { length: number; [index: number]: unknown };
        args[0] = receiver;
        for (let i = 0; i < arguments.length; i += 1) args[i + 1] = arguments[i];
        args.length = arguments.length + 1;
        return Native.reflectApply(api, undefined, args);
      }
    }
  };
  /* eslint-enable prefer-rest-params */
  Native.objectDefineProperty(capability, "name", {
    configurable: true,
    value: api.name,
  });
  Native.objectDefineProperty(capability, "length", {
    configurable: true,
    value: api.length > 1 ? api.length - 1 : 0,
  });
  return capability;
};

// 不要使用 {}, 改使用 Object.create(null) - 避免在页面生成沙盒时，受到 Object.prototype 被注入的影响

export type ScriptContext = IGM_Base & {
  [key: string]: any;
  setExecutionRunFlag(runFlag: string): void;
  resolveLoadScript(): void;
};

type InternalScriptContext = IGM_Base & {
  [key: string]: any;
  runFlag: string;
  loadScriptResolve?: () => void;
};

// context → mySandbox 投影时必须排除的内部键：四个已在 protect 中登记的 GM_Base
// 生命周期成员，加上两个只存在于 facade、未登记在 protect 的早期启动钩子。
// 供 createProxyContext 的投影过滤，以及 exec_script.ts 的 globalInjection 碰撞检查复用。
export const isInternalContextKey = (key: string): boolean =>
  key === "setExecutionRunFlag" || key === "resolveLoadScript" || Native.objectHasOwn(protect, key);

// 构建沙盒上下文
export const createContext = (
  scriptRes: TScriptInfo,
  GMInfo: any,
  envPrefix: string,
  message: Message,
  contentMsg: Message,
  scriptGrants: Set<string>
) => {
  // 复制授权集合并使用捕获的 Set 实现，避免页面改写迭代器后影响 API 注入。
  const scriptGrantSet = new Native.Set(scriptGrants);
  // 按照GMApi构建
  const valueChangeListener = new ListenerManager();
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
  const GM = Native.objectCreate(null);
  GM.info = GMInfo;
  const context = createGMBase({
    prefix: envPrefix,
    message,
    contentMsg,
    scriptRes,
    valueChangeListener,
    EE,
    runFlag: scriptRes.executionRunFlag || uuidv4(),
    eventId: 10000,
    GM: GM,
    GM_info: GMInfo,
    window: Native.objectCreate(null),
    grantSet: new Native.Set<string>(),
    loadScriptPromise,
    loadScriptResolve,
    setInvalidContext() {
      if (invalid) return;
      invalid = true;
      this.loadScriptResolve?.();
      this.loadScriptResolve = undefined;
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
  }) as unknown as InternalScriptContext;
  const publicContext = Native.objectCreate(null) as ScriptContext;
  publicContext.GM = GM;
  publicContext.GM_info = GMInfo;
  publicContext.window = Native.objectCreate(null);
  publicContext.unsafeWindow = window;

  // 生命周期方法只供隔离执行器使用；对脚本不可见由 createProxyContext 的显式
  // isInternalContextKey 投影过滤保证，不依赖此处的描述符可枚举性——描述符字面量
  // 会继承 Object.prototype，页面预先放置的 get/set 会让 defineProperty 抛错。
  publicContext.valueUpdate = (data: any) => context.valueUpdate(data);
  publicContext.emitEvent = (event: string, eventId: string, data: any) => context.emitEvent(event, eventId, data);
  publicContext.setInvalidContext = () => context.setInvalidContext();
  publicContext.isInvalidContext = () => context.isInvalidContext();
  publicContext.setExecutionRunFlag = (runFlag: string) => {
    context.runFlag = runFlag;
  };
  publicContext.resolveLoadScript = () => {
    context.loadScriptResolve?.();
  };

  const grantedAPIs: { [key: string]: any } = Native.objectCreate(null);
  const __methodInject__ = (grant: string): boolean => {
    const grantSet: Set<string> = context.grantSet;
    const s = GMContextApiGet(grant);
    if (!s) return false; // @grant 的定义未实现，略过 (返回 false 表示 @grant 不存在)
    if (grantSet.has(grant)) return true; // 重复的@grant，略过 (返回 true 表示 @grant 存在)
    grantSet.add(grant);
    for (let i = 0; i < s.length; i += 1) {
      const { fnKey, api, param } = s[i];
      grantedAPIs[fnKey] = createCapability(api, context);
      const depend = param?.depend;
      if (depend) {
        for (let j = 0; j < depend.length; j += 1) __methodInject__(depend[j]);
      }
    }
    return true;
  };
  // 只能调用捕获的 forEach；此处不依赖页面提供的 Set iterator。
  scriptGrantSet.forEach((grant) => {
    if (typeof grant !== "string") return;
    const candidates = getGrantCandidates(grant);
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      __methodInject__(candidate);
    }
  });
  // 兼容GM.Cookie.*
  const grantedKeys = Native.objectKeys(grantedAPIs);
  for (let i = 0; i < grantedKeys.length; i += 1) {
    const fnKey = grantedKeys[i];
    const fnKeyArray = fnKey.split(".");
    const m = fnKeyArray.length;
    let g = publicContext;
    let s = "";
    for (let i = 0; i < m; i++) {
      const part = fnKeyArray[i];
      s += `${i ? "." : ""}${part}`;
      g = g[part] || (g[part] = grantedAPIs[s] || Native.objectCreate(null));
    }
  }
  if (scriptGrantSet.has("window.onurlchange") && context.onurlchange === undefined) {
    publicContext.onurlchange = null;
    attachNavigateHandler(window as any);
  }
  return publicContext;
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

type DescriptorMap = Record<string, PropertyDescriptor>;

const getAllPropertyDescriptors = (
  obj: DescriptorOwner,
  callback: (key: string | symbol, descriptor: PropertyDescriptor) => void
) => {
  while (obj && obj !== Object) {
    const descs = Native.objectGetOwnPropertyDescriptors(obj);
    const keys = Native.reflectOwnKeys(descs);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      callback(key, descs[key as keyof typeof descs]);
    }
    obj = Native.objectGetPrototypeOf(obj);
  }
};

// constructor/interface 不可绑定，否则 bind 会丢失 prototype 和静态成员。
const isConstructorOrInterface = (value: unknown) => {
  if (typeof value !== "function") return false;
  if ("prototype" in value) return true;
  const firstChar = (value as { name: string }).name.charCodeAt(0);
  return firstChar >= 65 && firstChar <= 90;
};

// 避免 host/Xray function 的 .bind lookup 不可靠
const materializeDescriptor = (descriptor: PropertyDescriptor, receiver: DescriptorOwner): PropertyDescriptor => {
  if ("value" in descriptor) {
    if (typeof descriptor.value !== "function" || isConstructorOrInterface(descriptor.value)) return descriptor;
    return {
      ...descriptor,
      value: Native.bind(descriptor.value, receiver),
    };
  }
  if (!descriptor.get && !descriptor.set) return descriptor;
  return {
    ...descriptor,
    get: descriptor.get ? Native.bind(descriptor.get, receiver) : undefined,
    set: descriptor.set ? Native.bind(descriptor.set, receiver) : undefined,
  };
};

type GlobalSnapshot = {
  sharedInitCopy: typeof globalThis & Record<PropertyKey, any>;
  eventKeys: Set<string>;
};

export type RealmRoots = {
  realmGlobal: DescriptorOwner;
  hostWindow: DescriptorOwner;
};

const createGlobalSnapshot = ({ realmGlobal, hostWindow }: RealmRoots): GlobalSnapshot => {
  // 在 CacheSet 加入的 propKeys 将会在 mySandbox 实装阶段时设置。
  // 先处理的 descriptor 覆盖后续父类。
  const descsCache: Set<string | symbol> = new Native.Set(["eval", "window", "self", "globalThis", "top", "parent"]);

  // realmGlobal own descriptor 优先，hostWindow descriptor 只补足 host 成员。
  const initOwnDescs = Native.objectGetOwnPropertyDescriptors(realmGlobal);

  // overriddenDescs 将以物件 OwnPropertyDescriptor 方式进行物件属性修改。
  // 覆盖原有的 OwnPropertyDescriptor 定义或父类的 PropertyDescriptor 定义。
  const overriddenDescs: DescriptorMap = Native.objectCreate(null);

  // 记录原生 onxxxxx 的 property key。
  const eventKeys = new Native.Set<string>();

  // 在 USE_PSEUDO_WINDOW 情况下，由于没有类的 prototype，父类的成员要手动传下去。
  const protoBaseDescs: DescriptorMap = Native.objectCreate(null);

  const collectRealmDescriptors = () => {
    // 只读取 realmGlobal own descriptors，避免混合 Firefox 的两个 realm。
    const descriptors = Native.objectGetOwnPropertyDescriptors(realmGlobal);
    const keys = Native.objectKeys(descriptors);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const desc = descriptors[key];
      if (descsCache.has(key)) continue;
      descsCache.add(key); // realm own descriptors take precedence over host descriptors

      if ("value" in desc) {
        // 替换 function 的 this 为实际的 realm global。
        if (desc.writable && shouldFnBind(desc.value)) {
          overriddenDescs[key] = materializeDescriptor(desc, realmGlobal);
        }
        continue;
      }

      if (desc.configurable && desc.get && desc.set && desc.enumerable && key.startsWith("on")) {
        // 替换 onxxxxx 事件赋值操作。
        // 例：(window.)onload, (window.)onerror。
        eventKeys.add(key);
        continue;
      }
      if (desc.get || desc.set) {
        // 替换 getter setter 的 this 为实际的 realm global。
        // 例：(window.)location, (window.)document。
        overriddenDescs[key] = materializeDescriptor(desc, realmGlobal);
      }
    }
  };

  const collectHostWindowDescriptors = () => {
    // 取物件本身及所有父类(不包含Object)的PropertyDescriptor。
    // 主要是找出哪些 function 值、setter/getter 需要替换 host window。
    getAllPropertyDescriptors(hostWindow, (key, desc) => {
      if (!desc || typeof key !== "string") return;

      if (desc.configurable && desc.get && desc.set && key.startsWith("on")) {
        // 替换 onxxxxx 事件赋值操作。
        // 例：(window.)onload, (window.)onerror。
        eventKeys.add(key);
        return;
      }
      if (descsCache.has(key)) return;

      if ("value" in desc) {
        // 替换 function 的 this 为实际的 host window。
        if (shouldFnBind(desc.value)) {
          overriddenDescs[key] = materializeDescriptor(desc, hostWindow);
          descsCache.add(key);
        } else if (!(key in initOwnDescs) && !Native.objectHasOwn(realmGlobal, key) && !protoBaseDescs[key]) {
          protoBaseDescs[key] = materializeDescriptor(desc, hostWindow);
        }
        return;
      }
      if (desc.get || desc.set) {
        // 替换 getter setter 的 this 为实际的 host window。
        // 例：(window.)location, (window.)document。
        overriddenDescs[key] = materializeDescriptor(desc, hostWindow);
        descsCache.add(key);
      }
    });
  };

  // 第一趟 realmGlobal：保留 JavaScript 内置对象。
  collectRealmDescriptors();
  // 第二趟 hostWindow：补齐 Firefox split-realm 的 host 成员。
  collectHostWindowDescriptors();
  descsCache.clear(); // 内存释放

  // sharedInitCopy: 完全继承Window.prototype 及 自定义 OwnPropertyDescriptor
  // OwnPropertyDescriptor定义 为 原OwnPropertyDescriptor定义 (DragEvent, MouseEvent, RegExp, EventTarget, JSON等)
  //  + 覆盖定义 (document, location, setTimeout, setInterval, addEventListener 等)
  // sharedInitCopy: ScriptCat脚本共通使用

  // PseudoWindow 没有真实 Window.prototype，因此祖先成员必须先手动复制到 sandbox own descriptors。
  const USE_PSEUDO_WINDOW = true; // 日后或能设置使 ScriptCat的沙盒 window 能以 name / id 存取页面元素

  class PseudoWindow {}
  const PseudoWindowPrototype = PseudoWindow.prototype;
  Native.objectDefineProperty(PseudoWindowPrototype, Symbol.toStringTag, {
    //@ts-ignore
    value: hostWindow[Symbol.toStringTag],
    writable: false,
    enumerable: false,
    configurable: true,
  });
  Native.objectDefineProperty(PseudoWindowPrototype, "constructor", {
    value: hostWindow.constructor,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  Native.objectDefineProperty(PseudoWindowPrototype, "__proto__", {
    //@ts-ignore
    value: hostWindow.__proto__,
    writable: false,
    enumerable: false,
    configurable: true,
  });

  const sharedInitCopy = USE_PSEUDO_WINDOW
    ? Native.objectCreate(null, {
        ...protoBaseDescs, // 较快的 @unwrap 注入时有机会改变 EventTarget.prototype
        ...Native.objectGetOwnPropertyDescriptors(PseudoWindowPrototype),
        ...initOwnDescs,
        ...overriddenDescs,
      })
    : Native.objectCreate(Native.objectGetPrototypeOf(realmGlobal), {
        ...initOwnDescs,
        ...overriddenDescs,
      });

  return { sharedInitCopy, eventKeys };
};

const defaultGlobalSnapshot = createGlobalSnapshot({ realmGlobal: global, hostWindow: window });

// 把沙盒的 console 和网页的 console 隔离
const initConsoleDescs = Native.objectGetOwnPropertyDescriptors(console);
const ConsolePrototype = Native.objectGetPrototypeOf(console);

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
  // Descriptor maps receive page-controlled event names, so keep lookups and writes out of Object.prototype.
  const ownDescs = Native.objectAssign(
    Native.objectCreate(null),
    Native.objectGetOwnPropertyDescriptors(sharedInitCopy)
  ) as Record<PropertyKey, PropertyDescriptor>;

  // mySandbox: ScriptCat各脚本独自使用
  let mySandbox: typeof sharedInitCopy | undefined = undefined;
  const hostAddEventListener = Native.bind(roots.hostWindow.addEventListener, roots.hostWindow);
  const hostRemoveEventListener = Native.bind(roots.hostWindow.removeEventListener, roots.hostWindow);

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
          nativeCall(fn, mySandbox, event);
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

  eventKeys.forEach((key) => {
    const eventSetterGetter = createEventProp(key);
    const ownDescriptor = Native.objectGetOwnPropertyDescriptor(ownDescs, key)?.value as PropertyDescriptor | undefined;
    // ownDescs 是 Native.objectCreate(null) 建出的纯字典，这里写入的每个 key 也都是普通可写
    // 数据属性（由前面的 objectAssign 建立），不存在继承 setter 的风险，直接赋值即可等价于
    // defineProperty 显式声明的 configurable/enumerable/writable:true。
    ownDescs[key] = {
      ...ownDescriptor,
      ...eventSetterGetter,
    };
  });

  // split realm 下 hostWindow 可能经由 realmGlobal.window 暴露；这些别名必须始终留在当前 sandbox 内。
  const sandboxAliases = ["window", "self", "globalThis"];
  for (let i = 0; i < sandboxAliases.length; i += 1) {
    const key = sandboxAliases[i];
    ownDescs[key] = {
      configurable: true,
      enumerable: true,
      get() {
        return mySandbox;
      },
    };
  }
  const windowAliases = ["top", "parent", "frames"];
  for (let i = 0; i < windowAliases.length; i += 1) {
    const key = windowAliases[i];
    const descriptor = ownDescs[key];
    const hostValue = Native.reflectGet(roots.hostWindow, key, roots.hostWindow);
    if (hostValue === undefined && !descriptor) continue;

    ownDescs[key] = {
      ...descriptor,
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() {
        const value = Native.reflectGet(roots.hostWindow, key, roots.hostWindow);
        return value === roots.hostWindow || value === roots.realmGlobal ? mySandbox : value;
      },
      set: undefined,
    };
    delete ownDescs[key].value;
    delete ownDescs[key].writable;
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
      set(nv: unknown) {
        currentValue = typeof nv === "function" ? (nv as (this: GlobalEventHandlers, ev: UrlChangeEvent) => any) : null;
        return true;
      },
    };
  }

  // 把初始Copy加上特殊变量后，生成一份新Copy
  mySandbox = Native.objectCreate(Native.objectGetPrototypeOf(sharedInitCopy), ownDescs) as typeof globalThis &
    Record<PropertyKey, any>;

  // 处理特殊关键字，不能穿越出沙盒，也不能被外部修改
  const moduleKeys = ["define", "module", "exports"];
  for (let i = 0; i < moduleKeys.length; i += 1) {
    const key = moduleKeys[i];
    mySandbox[key] = undefined;
  }

  // 脚本window设置

  // 把 GM Api (或其他全域API) 复制到 脚本window
  // 请手动检查避开key，防止与window的属性setter有冲突 或 属性名重复
  const contextKeys = Native.objectKeys(context);
  for (let i = 0; i < contextKeys.length; i += 1) {
    const key = contextKeys[i];
    if (isInternalContextKey(key) || key === "window") continue;
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
    (<EventTarget>roots.hostWindow).addEventListener("urlchange", Native.bind(handle, mySandbox), false);
  }

  // 从网页 console 隔离出来的沙盒 console
  mySandbox.console = Native.objectCreate(ConsolePrototype, initConsoleDescs);

  return mySandbox;
};

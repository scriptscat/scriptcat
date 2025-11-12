import { type ScriptRunResource } from "@App/app/repo/scripts";
import { v4 as uuidv4 } from "uuid";
import type { Message } from "@Packages/message/types";
import EventEmitter from "eventemitter3";
import { GMContextApiGet } from "./gm/gm_context";
import { protect } from "./gm/gm_context";
import { isEarlyStartScript } from "./utils";
import { ListenerManager } from "./listener_manager";
import { createGMBase } from "./gm/gm_api";

// 构建沙盒上下文
export const createContext = (
  scriptRes: ScriptRunResource,
  GMInfo: any,
  envPrefix: string,
  message: Message,
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
  const context = createGMBase({
    prefix: envPrefix,
    message,
    scriptRes,
    valueChangeListener,
    EE,
    runFlag: uuidv4(),
    eventId: 10000,
    GM: { info: GMInfo },
    GM_info: GMInfo,
    window: {
      // onurlchange: null,
    },
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
  const grantedAPIs: { [key: string]: any } = {};
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
    __methodInject__(grant);
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
      g = g[part] || (g[part] = grantedAPIs[s] || {});
    }
  }
  context.unsafeWindow = window;
  return context;
};

const noEval = false;

// 判断是否应该将函数绑定到global
const shouldFnBind = (f: any) => {
  if (typeof f !== "function") return false;
  if ("prototype" in f) return false; // 避免getter, 使用 in operator (注意, nodeJS的测试环境有异)
  // window中的函式，大写开头不用于直接呼叫 （例如NodeFilter)
  const { name } = f;
  if (!name) return false;
  const e = name.charCodeAt(0);
  return e >= 97 && e <= 122;
};

type ForEachCallback<T> = (value: T, index: number, array: T[]) => void;

// 取物件本身及所有父类(不包含Object)的PropertyDescriptor
const getAllPropertyDescriptors = (obj: any, callback: ForEachCallback<[string | symbol, PropertyDescriptor]>) => {
  while (obj && obj !== Object) {
    const descs = Object.getOwnPropertyDescriptors(obj);
    Object.entries(descs).forEach(callback);
    obj = Object.getPrototypeOf(obj);
  }
};

// 在 CacheSet 加入的propKeys将会在 mySandbox 实装阶段时设置
const descsCache: Set<string | symbol> = new Set(["eval", "window", "self", "globalThis", "top", "parent"]);

const initOwnDescs = Object.getOwnPropertyDescriptors(global);

// overridedDescs将以物件OwnPropertyDescriptor方式进行物件属性修改
// 覆盖原有的 OwnPropertyDescriptor定义 或 父类的PropertyDescriptor定义
const overridedDescs: Record<string, PropertyDescriptor> = {};

// 记录原生 onxxxxx 的 PropertyDescriptor
const eventDescs: Record<string, PropertyDescriptor> = {};

// 包含物件本身及所有父类(不包含Object)的PropertyDescriptor
// 主要是找出哪些 function值， setter/getter 需要替换 global window
getAllPropertyDescriptors(global, ([key, desc]) => {
  if (!desc || descsCache.has(key) || typeof key !== "string") return;

  if (desc.writable) {
    // 属性 value

    const value = desc.value;

    // 替换 function 的 this 为 实际的 global window
    // 例：父类的 addEventListener
    if (shouldFnBind(value)) {
      const boundValue = value.bind(global);
      overridedDescs[key] = {
        ...desc,
        value: boundValue,
      };
    }
  } else {
    if (desc.configurable && desc.get && desc.set && desc.enumerable && key.startsWith("on")) {
      // 替换 onxxxxx 事件赋值操作
      // 例：(window.)onload, (window.)onerror
      eventDescs[key] = desc;
    } else {
      if (desc.get || desc.set) {
        // 替换 getter setter 的 this 为 实际的 global window
        // 例：(window.)location, (window.)document
        overridedDescs[key] = {
          ...desc,
          get: desc?.get?.bind(global),
          set: desc?.set?.bind(global),
        };
      }
    }
  }
});
descsCache.clear(); // 内存释放

// sharedInitCopy: 完全继承Window.prototype 及 自定义 OwnPropertyDescriptor
// OwnPropertyDescriptor定义 为 原OwnPropertyDescriptor定义 (DragEvent, MouseEvent, RegExp, EventTarget, JSON等)
//  + 覆盖定义 (document, location, setTimeout, setInterval, addEventListener 等)
// sharedInitCopy: ScriptCat脚本共通使用
const sharedInitCopy = Object.create(null, {
  ...initOwnDescs,
  ...overridedDescs,
  // Symbol.toStringTag设置为 Window
  [Symbol.toStringTag]: { value: "Window", writable: false, enumerable: false, configurable: true },
});

type GMWorldContext = typeof globalThis & Record<PropertyKey, any>;

const isPrimitive = (x: any) => x !== Object(x);

// 拦截上下文
export const createProxyContext = <const Context extends GMWorldContext>(context: any): Context => {
  // let withContext: Context | undefined | { [key: string]: any } = undefined;
  // 为避免做成混乱。 ScriptCat脚本中 self, globalThis, parent 为固定值不能修改

  const ownDescs = Object.getOwnPropertyDescriptors(sharedInitCopy);

  // mySandbox: ScriptCat各脚本独自使用
  let mySandbox: typeof sharedInitCopy | undefined = undefined;

  const createFuncWrapper = (f: () => any) => {
    return function (this: any) {
      const ret = f.call(global);
      if (ret === global) return mySandbox;
      return ret;
    };
  };

  // 用 eventHandling 机制模拟 onxxxxxxx 事件设置
  // 监听事件实际上的方法是eventObject.handleEvent
  const createEventProp = (key: string) => {
    const eventName = (<string>key).slice(2);
    // 赋值变量
    const eventObject: EventListenerObject & { fn: any } = {
      fn: null,
      handleEvent(event) {
        const fn = mySandbox[key];
        if (!fn || fn !== this.fn) {
          global.removeEventListener(eventName, eventObject);
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
              global.removeEventListener(eventName, eventObject);
            } else if (typeof newVal === "function") {
              // 非primitive types 的话，只考虑 function type
              // Symbol, Object (包括 EventListenerObject ) 等只会保存而不进行事件监听
              global.addEventListener(eventName, eventObject);
            }
          }
          eventObject.fn = newVal;
        }
      },
    };
  };

  for (const key of Object.keys(eventDescs)) {
    const eventSetterGetter = createEventProp(key);
    ownDescs[key] = {
      ...ownDescs[key],
      ...eventSetterGetter,
    };
  }

  for (const key of ["window", "self", "globalThis", "top", "parent"]) {
    const desc = ownDescs[key];
    if (desc?.value === global) {
      // globalThis
      // 避免 self referencing, 改以 getter 形式
      desc.get = function () {
        return mySandbox;
      };
      desc.set = undefined;
      // 为了 value 转 getter/setter，必须删除 writable 和 value
      delete desc.writable;
      delete desc.value;
    } else if (desc?.get) {
      // 真实的 window 物件中部份属性(self, parent) 存在setter. 意义不明
      // 为避免做成混乱，ScriptCat脚本的沙盒不提供setter（即不能修改）
      // (像window.document, 能写 window.document = null 不会报错但赋值不变)
      desc.get = createFuncWrapper(desc.get);
      desc.set = undefined;
    }
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

  // 把初始Copy加上特殊变量后，生成一份新Copy
  mySandbox = Object.create(Object.getPrototypeOf(sharedInitCopy), ownDescs);

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
  const cWindow = context.window;

  // @grant window.close
  if (cWindow?.close) {
    mySandbox.close = cWindow.close;
  }

  // @grant window.focus
  if (cWindow?.focus) {
    mySandbox.focus = cWindow.focus;
  }

  // @grant window.onurlchange
  if (cWindow?.onurlchange === null) {
    // 目前 TM 只支援 null. ScriptCat不需要grant预设启用？
    mySandbox.onurlchange = null;
  }

  return mySandbox;
};

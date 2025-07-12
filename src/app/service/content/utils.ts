import type { ScriptRunResource } from "@App/app/repo/scripts";

import type { ScriptFunc } from "./types";
import { protect } from "./gm_context";

const noEval = false;

// 构建脚本运行代码
/**
 * @see {@link ExecScript}
 * @param scriptRes 
 * @param scriptCode 
 * @returns 
 */
export function compileScriptCode(scriptRes: ScriptRunResource, scriptCode?: string): string {
  scriptCode = scriptCode ?? scriptRes.code;
  let requireCode = "";
  if (Array.isArray(scriptRes.metadata.require)) {
    requireCode += scriptRes.metadata.require
      .map((val) => {
        const res = scriptRes.resource[val];
        if (res) {
          return res.content;
        }
      })
      .join("\n");
  }
  const sourceURL = `//# sourceURL=${chrome.runtime.getURL(`/${encodeURI(scriptRes.name)}.user.js`)}`;
  const preCode = [requireCode].join("\n"); // 不需要 async 封装
  const code = [scriptCode, sourceURL].join("\n"); // 需要 async 封装, 可top-level await
  // context 和 name 以unnamed arguments方式导入。避免代码能直接以变量名存取
  // this = context: globalThis
  // arguments = [named: Object, scriptName: string]
  // 使用sandboxContext时，arguments[0]为undefined, this.$则为一次性Proxy变量，用於全域拦截context
  // 非沙盒环境时，先读取 arguments[0]，因此不会读取页面环境的 this.$
  // 在userScript API中，由於执行不是在物件导向裡呼叫，使用arrow function的话会把this改变。须使用 .call(this) [ 或 .bind(this)() ]
  return `try {
  with(arguments[0]||this.$){
${preCode}
    return (async function(){
${code}
    }).call(this);
  }
} catch (e) {
  if (e.message && e.stack) {
      console.error("ERROR: Execution of script '" + arguments[1] + "' failed! " + e.message);
      console.log(e.stack);
  } else {
      console.error(e);
  }
}`;
}

// 通过脚本代码编译脚本函数
export function compileScript(code: string): ScriptFunc {
  return <ScriptFunc>new Function(code);
}
/**
 * 将脚本函数编译为注入脚本代码
 * @param script
 * @param scriptCode
 * @param [autoDeleteMountFunction=false] 是否自动删除挂载的函数
 */
export function compileInjectScript(
  script: ScriptRunResource,
  scriptCode: string,
  autoDeleteMountFunction: boolean = false
): string {
  const autoDeleteMountCode = autoDeleteMountFunction ? `try{delete window['${script.flag}']}catch(e){}` : "";
  return `window['${script.flag}'] = function(){${autoDeleteMountCode}${scriptCode}}`;
}

const shouldFnBind = (f: any) => {
  if (typeof f !== 'function') return false;
  if ('prototype' in f) return false; // 避免getter, 使用 in operator
  // window中的函式，大写开头不用於直接呼叫 （例如NodeFilter) 
  const { name } = f;
  if (!name) return false;
  const e = name.charCodeAt(0);
  return (e >= 97 && e <= 122);
}

type ForEachCallback<T> = (value: T, index: number, array: T[]) => void;

// 取物件本身及所有父类(不包含Object)的PropertyDescriptor
const getAllPropertyDescriptors = (
  obj: any,
  callback: ForEachCallback<[string | symbol, TypedPropertyDescriptor<any> & PropertyDescriptor]>
) => {
  while (obj && obj !== Object) {
    const descs = Object.getOwnPropertyDescriptors(obj);
    Object.entries(descs).forEach(callback);
    obj = Object.getPrototypeOf(obj);
  }
};

// 需要用到全局的
// myCopy 不进行with变量拦截
export const unscopables: { [key: string]: boolean } = {
  // NodeFilter: true,
  // RegExp: true,
  "this": true,
  "arguments": true,
  // "await": true,
  // "define": true,
  // "module": true,
  // "exports": true
};

// 在 CacheSet 加入的propKeys将会在myCopy实装阶段时设置
const descsCache: Set<string | symbol> = new Set(["eval", "window", "self", "globalThis", "top", "parent"]);

// 用 eventHandling 机制模拟 onxxxxxxx 事件设置
const createEventProp = (eventName: string) => {
  // 赋值变量
  let registered: EventListenerOrEventListenerObject | null = null;
  return {
    get() {
      return registered;
    },
    set(newVal: EventListenerOrEventListenerObject | any) {
      if (newVal !== registered) {
        if (isEventListenerFunc(registered)) {
          // 停止当前事件监听
          global.removeEventListener(eventName, registered!);
        }
        if (isPrimitive(newVal)) {
          // 按照实际操作，primitive types (number, string, boolean, ...) 会被转换成 null
          newVal = null;
        } else if (isEventListenerFunc(newVal)) {
          // 非primitive types 的话，只考虑 function type
          // Symbol, Object (包括 EventListenerObject ) 等只会保存而不进行事件监听
          global.addEventListener(eventName, newVal);
        }
        registered = newVal;
      }
    }
  }
}

const ownDescs = Object.getOwnPropertyDescriptors(global);

// overridedDescs将以物件OwnPropertyDescriptor方式进行物件属性修改 
// 覆盖原有的 OwnPropertyDescriptor定义 或 父类的PropertyDescriptor定义
const overridedDescs: ({
  [x: string]: TypedPropertyDescriptor<any>;
} & {
  [x: string]: PropertyDescriptor;
}) = {};

// 包含物件本身及所有父类(不包含Object)的PropertyDescriptor
// 主要是找出哪些 function值， setter/getter 需要替换 global window
getAllPropertyDescriptors(global, ([key, desc]) => {
  if (!desc || descsCache.has(key) || typeof key !== 'string') return;
  descsCache.add(key);

  if (desc.writable) {
    // 属性 value

    const value = desc.value;

    // 替换 function 的 this 为 实际的 global window
    // 例：父类的 addEventListener
    if (shouldFnBind(value)) {
      const boundValue = value.bind(global);
      overridedDescs[key] = {
        ...desc,
        value: boundValue
      }
    }

  } else {
    if (desc.configurable && desc.get && desc.set && desc.enumerable && key.startsWith('on')) {
      // 替换 onxxxxx 事件赋值操作
      // 例：(window.)onload, (window.)onerror
      const eventName = (<string>key).slice(2);
      const eventSetterGetter = createEventProp(eventName);
      overridedDescs[key] = {
        ...desc,
        ...eventSetterGetter
      };
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

// initCopy: 完全继承Window.prototype 及 自定义 OwnPropertyDescriptor
// OwnPropertyDescriptor定义 为 原OwnPropertyDescriptor定义 (DragEvent, MouseEvent, RegExp, EventTarget, JSON等)
//  + 覆盖定义 (document, location, setTimeout, setInterval, addEventListener 等)
export const initCopy = Object.create(Object.getPrototypeOf(global), {
  ...ownDescs,
  ...overridedDescs
});

type GMWorldContext = ((typeof globalThis) & ({
  [key: string | number | symbol]: any;
  window: any;
  self: any;
  globalThis: any;
}) | ({
  [key: string | number | symbol]: any;
  window: any;
  self: any;
  globalThis: any;
}));

const isEventListenerFunc = (x: any) => typeof x === 'function';
const isPrimitive = (x: any) => x !== Object(x);

// 拦截上下文
export function createProxyContext<const Context extends GMWorldContext>(global: Context, context: any): Context {

  // let withContext: Context | undefined | { [key: string]: any } = undefined;
  // 为避免做成混乱。 ScriptCat脚本中 self, globalThis, parent 为固定值不能修改

  const ownDescs = Object.getOwnPropertyDescriptors(initCopy);

  let myCopy: typeof initCopy | undefined = undefined;

  const createFuncWrapper = (f: () => any) => {
    return function (this: any) {
      const ret = f.call(global);
      if (ret === global) return myCopy;
      return ret;
    }
  }

  for (const key of ["window", "self", "globalThis", "top", "parent"]) {
    const desc = ownDescs[key];
    if (desc?.value === global) {
      // globalThis
      // 避免 self referencing, 改以 getter 形式
      desc.get = function () { return myCopy };
      desc.set = undefined;
      // 为了 value 转 getter/setter，必须删除 writable 和 value
      delete desc.writable;
      delete desc.value;
    } else if (desc?.get) {
      // 为避免做成混乱。 ScriptCat脚本中 self, globalThis, parent 为固定值不能修改
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

  // 一次性 get, 用於 with(this.$) 设计
  ownDescs.$ = {
    enumerable: false,
    configurable: true,
    get() {
      delete (<any>this).$;
      return myCopy;

      // return new Proxy(<Context>myCopy, {
      //   get(target, prop, receiver) {
      //     // 由於Context全拦截，我们没有方法判断这个get是 typeof xxx 还是 xxx
      //     // (不拦截的话会触发全域变量存取读写)
      //     // 因此总是传回 undefined 而不报错
      //     if(Reflect.has(target, prop)){
      //       return Reflect.get(target, prop, receiver);
      //     }
      //     // throw new ReferenceError(`${String(prop)} is not defined.`);
      //     return undefined;
      //   },
      //   has(_target, _key) {
      //     // 全拦截，避免 userscript 改变 global window 变量 （包括删除及生成）
      //     // 强制针对所有"属性"为[[HasProperty]]，即 `* in $` 总是 true
      //     return true;
      //   },
      //   set(target, key, value, receiver) {
      //     // if (Reflect.has(target, key)) {
      //       // Allow updating existing properties in the context
      //       return Reflect.set(target, key, value, receiver);
      //     // }
      //     // Prevent creating new properties
      //     // throw new ReferenceError(`Cannot create variable ${String(key)} in sandbox`);
      //   },
      //   deleteProperty(target, key) {
      //     if (Reflect.has(target, key)) {
      //       return Reflect.deleteProperty(target, key);
      //     }
      //     return false;
      //   }
      // });
    }
  }

  // 把初始Copy加上特殊变量后，生成一份新Copy
  myCopy = Object.create(Object.getPrototypeOf(initCopy), ownDescs);

  // 用於避开myCopy的with拦截
  myCopy[Symbol.unscopables] = {
    ...(myCopy[Symbol.unscopables] || {}),
    ...unscopables
  };

  // 脚本window设置
  const exposedWindow = myCopy;
  // 把 GM Api (或其他全域API) 复製到 脚本window
  // 请手动检查避开key与window的属性setter有衝突
  for (const key of Object.keys(context)) {
    if (key in protect || key === 'window') continue;
    exposedWindow[key] = context[key]; // window以外
  }

  if (context.window?.close) {
    exposedWindow.close = context.window.close;
  }

  if (context.window?.focus) {
    exposedWindow.focus = context.window.focus;
  }

  if (context.window?.onurlchange === null) {
    // 目前 TM 只支援 null. ScriptCat预设null？
    exposedWindow.onurlchange = null;
  }

  return exposedWindow;
}

export function addStyle(css: string): HTMLElement {
  const dom = document.createElement("style");
  dom.textContent = css;
  if (document.head) {
    return document.head.appendChild(dom);
  }
  return document.documentElement.appendChild(dom);
}

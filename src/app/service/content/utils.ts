import { ScriptRunResouce } from "@App/app/repo/scripts";
import { v4 as uuidv4 } from "uuid";
import GMApi, { ApiValue, GMContext } from "./gm_api";
import { has } from "@App/pkg/utils/lodash";
import { Message } from "@Packages/message/server";
import EventEmitter from "eventemitter3";

// 构建脚本运行代码
export function compileScriptCode(scriptRes: ScriptRunResouce): string {
  let require = "";
  if (scriptRes.metadata.require) {
    scriptRes.metadata.require.forEach((val) => {
      const res = scriptRes.resource[val];
      if (res) {
        require = `${require}\n${res.content}`;
      }
    });
  }
  const code = require + scriptRes.code;
  return `with (context) return (async ()=>{\n${code}\n//# sourceURL=${chrome.runtime.getURL(
    `/${encodeURI(scriptRes.name)}.user.js`
  )}\n})()`;
}

export type ScriptFunc = (context: any, GM_info: any) => any;

// 通过脚本代码编译脚本函数
export function compileScript(code: string): ScriptFunc {
  return <ScriptFunc>new Function("context", "GM_info", code);
}

export function compileInjectScript(script: ScriptRunResouce): string {
  return `window['${script.flag}']=function(context,GM_info){\n${script.code}\n}`;
}

// 设置api依赖
function setDepend(context: { [key: string]: any }, apiVal: ApiValue) {
  if (apiVal.param.depend) {
    for (let i = 0; i < apiVal.param.depend.length; i += 1) {
      const value = apiVal.param.depend[i];
      const dependApi = GMContext.apis.get(value);
      if (!dependApi) {
        return;
      }
      if (value.startsWith("GM.")) {
        const [, t] = value.split(".");
        (<{ [key: string]: any }>context.GM)[t] = dependApi.api.bind(context);
      } else {
        context[value] = dependApi.api.bind(context);
      }
      setDepend(context, dependApi);
    }
  }
}

// 构建沙盒上下文
export function createContext(scriptRes: ScriptRunResouce, GMInfo: any, envPrefix: string, message: Message): GMApi {
  // 按照GMApi构建
  const context: { [key: string]: any } = {
    prefix: envPrefix,
    message: message,
    scriptRes,
    valueChangeListener: new Map<number, { name: string; listener: GMTypes.ValueChangeListener }>(),
    sendMessage: GMApi.prototype.sendMessage,
    connect: GMApi.prototype.connect,
    runFlag: uuidv4(),
    eventId: 10000,
    valueUpdate: GMApi.prototype.valueUpdate,
    emitEvent: GMApi.prototype.emitEvent,
    EE: new EventEmitter(),
    GM: { Info: GMInfo },
    GM_info: GMInfo,
  };
  if (scriptRes.metadata.grant) {
    scriptRes.metadata.grant.forEach((val) => {
      const api = GMContext.apis.get(val);
      if (!api) {
        return;
      }
      if (val.startsWith("GM.")) {
        const [, t] = val.split(".");
        (<{ [key: string]: any }>context.GM)[t] = api.api.bind(context);
      } else if (val === "GM_cookie") {
        // 特殊处理GM_cookie.list之类
        context[val] = api.api.bind(context);

        const GM_cookie = function (action: string) {
          return (
            details: GMTypes.CookieDetails,
            done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
          ) => {
            return context[val](action, details, done);
          };
        };
        context[val].list = GM_cookie("list");
        context[val].delete = GM_cookie("delete");
        context[val].set = GM_cookie("set");
      } else {
        context[val] = api.api.bind(context);
      }
      setDepend(context, api);
    });
  }
  context.unsafeWindow = window;
  return <GMApi>context;
}

export const writables: { [key: string]: any } = {
  addEventListener: global.addEventListener.bind(global),
  removeEventListener: global.removeEventListener.bind(global),
  dispatchEvent: global.dispatchEvent.bind(global),
};

// 记录初始的window字段
export const init = new Map<string, boolean>();

// 需要用到全局的
export const unscopables: { [key: string]: boolean } = {
  NodeFilter: true,
  RegExp: true,
};

// 复制原有的,防止被前端网页复写
const descs = Object.getOwnPropertyDescriptors(global);
Object.keys(descs).forEach((key) => {
  const desc = descs[key];
  // 可写但不在特殊配置writables中
  if (desc && desc.writable && !writables[key]) {
    if (typeof desc.value === "function") {
      // 判断是否需要bind，例如Object、Function这些就不需要bind
      if (desc.value.prototype) {
        writables[key] = desc.value;
      } else {
        writables[key] = desc.value.bind(global);
      }
    } else {
      writables[key] = desc.value;
    }
  } else {
    init.set(key, true);
  }
});

export function warpObject(thisContext: object, ...context: object[]) {
  // 处理Object上的方法
  thisContext.hasOwnProperty = (name: PropertyKey) => {
    return (
      Object.hasOwnProperty.call(thisContext, name) || context.some((val) => Object.hasOwnProperty.call(val, name))
    );
  };
  thisContext.isPrototypeOf = (name: object) => {
    return Object.isPrototypeOf.call(thisContext, name) || context.some((val) => Object.isPrototypeOf.call(val, name));
  };
  thisContext.propertyIsEnumerable = (name: PropertyKey) => {
    return (
      Object.propertyIsEnumerable.call(thisContext, name) ||
      context.some((val) => Object.propertyIsEnumerable.call(val, name))
    );
  };
}

// 拦截上下文
export function proxyContext(global: any, context: any, thisContext?: { [key: string]: any }) {
  const special = Object.assign(writables);
  // 处理某些特殊的属性
  // 后台脚本要不要考虑不能使用eval?
  if (!thisContext) {
    thisContext = {};
  }
  thisContext.eval = global.eval;
  thisContext.define = undefined;
  warpObject(thisContext, special, global, context);
  // keyword是与createContext时同步的,避免访问到context的内部变量
  const contextKeyword: { [key: string]: any } = {
    message: 1,
    valueChangeListener: 1,
    connect: 1,
    runFlag: 1,
    valueUpdate: 1,
    sendMessage: 1,
    scriptRes: 1,
  };
  // @ts-ignore
  const proxy = new Proxy(context, {
    defineProperty(_, name, desc) {
      if (Object.defineProperty(thisContext, name, desc)) {
        return true;
      }
      return false;
    },
    get(_, name): any {
      switch (name) {
        case "window":
        case "self":
        case "globalThis":
          return proxy;
        case "top":
        case "parent":
          if (global[name] === global.self) {
            return special.global || proxy;
          }
          return global.top;
        default:
          break;
      }
      if (name !== "undefined") {
        if (has(thisContext, name)) {
          // @ts-ignore
          return thisContext[name];
        }
        if (typeof name === "string") {
          if (has(context, name)) {
            if (has(contextKeyword, name)) {
              return undefined;
            }
            return context[name];
          }
          if (has(special, name)) {
            if (typeof special[name] === "function" && !(<{ prototype: any }>special[name]).prototype) {
              return (<{ bind: any }>special[name]).bind(global);
            }
            return special[name];
          }
          if (has(global, name)) {
            // 特殊处理onxxxx的事件
            if (name.startsWith("on")) {
              if (typeof global[name] === "function" && !(<{ prototype: any }>global[name]).prototype) {
                return (<{ bind: any }>global[name]).bind(global);
              }
              return global[name];
            }
          }
          if (init.has(name)) {
            const val = global[name];
            if (typeof val === "function" && !(<{ prototype: any }>val).prototype) {
              return (<{ bind: any }>val).bind(global);
            }
            return val;
          }
        } else if (name === Symbol.unscopables) {
          return unscopables;
        }
      }
      return undefined;
    },
    has(_, name) {
      switch (name) {
        case "window":
        case "self":
        case "globalThis":
          return true;
        case "top":
        case "parent":
          if (global[name] === global.self) {
            return true;
          }
          return true;
        default:
          break;
      }
      if (name !== "undefined") {
        if (typeof name === "string") {
          if (has(unscopables, name)) {
            return false;
          }
          if (has(thisContext, name)) {
            return true;
          }
          if (has(context, name)) {
            if (has(contextKeyword, name)) {
              return false;
            }
            return true;
          }
          if (has(special, name)) {
            return true;
          }
          // 只处理onxxxx的事件
          if (has(global[name], name)) {
            if (name.startsWith("on")) {
              return true;
            }
          }
        } else if (typeof name === "symbol") {
          return has(thisContext, name);
        }
      }
      return false;
    },
    set(_, name: string, val) {
      switch (name) {
        case "window":
        case "self":
        case "globalThis":
          return false;
        default:
      }
      if (has(special, name)) {
        special[name] = val;
        return true;
      }
      if (init.has(name)) {
        const des = Object.getOwnPropertyDescriptor(global, name);
        // 只读的return
        if (des && des.get && !des.set && des.configurable) {
          return true;
        }
        // 只处理onxxxx的事件
        if (has(global, name) && name.startsWith("on")) {
          if (val === undefined) {
            global.removeEventListener(name.slice(2), thisContext[name]);
          } else {
            if (thisContext[name]) {
              global.removeEventListener(name.slice(2), thisContext[name]);
            }
            global.addEventListener(name.slice(2), val);
          }
          thisContext[name] = val;
          return true;
        }
      }
      // @ts-ignore
      thisContext[name] = val;
      return true;
    },
    getOwnPropertyDescriptor(_, name) {
      try {
        let ret = Object.getOwnPropertyDescriptor(thisContext, name);
        if (ret) {
          return ret;
        }
        ret = Object.getOwnPropertyDescriptor(context, name);
        if (ret) {
          return ret;
        }
        ret = Object.getOwnPropertyDescriptor(global, name);
        return ret;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        return undefined;
      }
    },
  });
  proxy[Symbol.toStringTag] = "Window";
  return proxy;
}

export function addStyle(css: string): HTMLElement {
  const dom = document.createElement("style");
  dom.innerHTML = css;
  if (document.head) {
    return document.head.appendChild(dom);
  }
  return document.documentElement.appendChild(dom);
}

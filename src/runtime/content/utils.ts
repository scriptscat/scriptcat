import { MessageManager } from "@App/app/message/message";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import { v4 as uuidv4 } from "uuid";
import { has } from "lodash";
import GMApi, { ApiValue, GMContext } from "./gm_api";

// 构建脚本运行代码
export function compileScriptCode(scriptRes: ScriptRunResouce): string {
  let { code } = scriptRes;
  let require = "";
  if (scriptRes.metadata.require) {
    scriptRes.metadata.require.forEach((val) => {
      const res = scriptRes.resource[val];
      if (res) {
        require = `${require}\n${res.content}`;
      }
    });
  }
  code = require + code;
  return `with (context) return (()=>{\n${code}\n//# sourceURL=${chrome.runtime.getURL(
    `/${encodeURI(scriptRes.name)}.user.js`
  )}\n})()`;
}

// eslint-disable-next-line camelcase
export type ScriptFunc = (context: any, GM_info: any) => any;
// 通过脚本代码编译脚本函数
export function compileScript(code: string): ScriptFunc {
  // eslint-disable-next-line no-new-func
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
export function createContext(
  scriptRes: ScriptRunResouce,
  GMInfo: any,
  message: MessageManager
): GMApi {
  // 按照GMApi构建
  const context: { [key: string]: any } = {
    scriptRes,
    message,
    valueChangeListener: new Map<
      number,
      { name: string; listener: GMTypes.ValueChangeListener }
    >(),
    sendMessage: GMApi.prototype.sendMessage,
    connect: GMApi.prototype.connect,
    runFlag: uuidv4(),
    valueUpdate: GMApi.prototype.valueUpdate,
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
        // eslint-disable-next-line func-names, camelcase
        const GM_cookie = function (action: string) {
          return (
            details: GMTypes.CookieDetails,
            done: (
              cookie: GMTypes.Cookie[] | any,
              error: any | undefined
            ) => void
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

// 记录初始的
export const init = new Map<string, boolean>();

// 需要用到全局的
export const unscopables: { [key: string]: boolean } = {
  RegExp: true,
};

// 复制原有的,防止被前端网页复写
const descs = Object.getOwnPropertyDescriptors(global);
Object.keys(descs).forEach((key) => {
  const desc = descs[key];
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

// 拦截上下文
export function proxyContext(
  global: any,
  context: any,
  thisContext?: { [key: string]: any }
) {
  const special = Object.assign(writables);
  // 处理某些特殊的属性
  // 后台脚本要不要考虑不能使用eval?
  if (!thisContext) {
    thisContext = {};
  }
  thisContext.eval = global.eval;
  thisContext.define = undefined;
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return special.global || proxy;
        case "top":
        case "parent":
          if (global[name] === global.self) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return special.global || proxy;
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return global.top;
        default:
          break;
      }
      if (typeof name === "string" && name !== "undefined") {
        if (has(thisContext, name)) {
          // @ts-ignore
          return thisContext[name];
        }
        if (context[name]) {
          if (contextKeyword[name]) {
            return undefined;
          }
          return context[name];
        }
        if (special[name] !== undefined) {
          if (
            typeof special[name] === "function" &&
            !(<{ prototype: any }>special[name]).prototype
          ) {
            return (<{ bind: any }>special[name]).bind(global);
          }
          return special[name];
        }
        if (global[name] !== undefined) {
          if (
            typeof global[name] === "function" &&
            !(<{ prototype: any }>global[name]).prototype
          ) {
            return (<{ bind: any }>global[name]).bind(global);
          }
          return global[name];
        }
      } else if (name === Symbol.unscopables) {
        return unscopables;
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
      if (typeof name === "string" && name !== "undefined") {
        if (unscopables[name]) {
          return false;
        }
        if (has(thisContext, name)) {
          return true;
        }
        if (context[name]) {
          if (contextKeyword[name]) {
            return false;
          }
          return true;
        }
        if (special[name] !== undefined) {
          return true;
        }
        if (global[name] !== undefined) {
          return true;
        }
      }
      return false;
    },
    set(_, name: string, val) {
      switch (name) {
        case "window":
        case "self":
        case "globalThis":
          special.global = val;
          return true;
        default:
      }
      if (special[name]) {
        special[name] = val;
        return true;
      }
      if (init.has(name)) {
        const des = Object.getOwnPropertyDescriptor(global, name);
        // 只读的return
        if (des && des.get && !des.set && des.configurable) {
          return true;
        }
        global[name] = val;
        return true;
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
      } catch (e) {
        return undefined;
      }
    },
  });
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

import { MessageManager } from "@App/app/message/message";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import { v4 as uuidv4 } from "uuid";
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
  return `with (context) return ((context, fapply, CDATA, uneval, define, module, exports)=>{\n${code}\n//# sourceURL=${chrome.runtime.getURL(
    `/${encodeURI(scriptRes.name)}.user.js`
  )}\n})(context)`;
}

export type ScriptFunc = (context: any) => any;
// 通过脚本代码编译脚本函数
export function compileScript(code: string): ScriptFunc {
  // eslint-disable-next-line no-new-func
  return <ScriptFunc>new Function("context", code);
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
      } else {
        context[val] = api.api.bind(context);
      }
      setDepend(context, api);
    });
  }
  return <GMApi>context;
}

const writables: { [key: string]: any } = {
  addEventListener: global.addEventListener,
  removeEventListener: global.removeEventListener,
  dispatchEvent: global.dispatchEvent,
};

// 记录初始的
const init = new Map<string, boolean>();

// 复制原有的,防止被前端网页复写
const descs = Object.getOwnPropertyDescriptors(global);
Object.keys(descs).forEach((key) => {
  const desc = descs[key];
  if (desc && desc.writable && !writables[key]) {
    writables[key] = desc.value;
  } else {
    init.set(key, true);
  }
});

// 拦截上下文
export function proxyContext(global: any, context: any) {
  const special = Object.assign(writables);
  // 后台脚本要不要考虑不能使用eval?
  const thisContext: { [key: string]: any } = { eval: global.eval };
  // @ts-ignore
  const proxy = new Proxy(context, {
    defineProperty(_, name, desc) {
      if (Object.defineProperty(context, name, desc)) {
        return true;
      }
      return false;
    },
    get(_, name) {
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
        if (context[name]) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return context[name];
        }
        if (thisContext[name]) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return thisContext[name];
        }
        if (special[name] !== undefined) {
          if (
            typeof special[name] === "function" &&
            !(<{ prototype: any }>special[name]).prototype
          ) {
            return (<{ bind: any }>special[name]).bind(global);
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return special[name];
        }
        if (global[name] !== undefined) {
          if (
            typeof global[name] === "function" &&
            !(<{ prototype: any }>global[name]).prototype
          ) {
            return (<{ bind: any }>global[name]).bind(global);
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return global[name];
        }
      }
      return undefined;
    },
    has() {
      return true;
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
      context[name] = val;
      return true;
    },
    getOwnPropertyDescriptor(_, name) {
      try {
        let ret = Object.getOwnPropertyDescriptor(context, name);
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

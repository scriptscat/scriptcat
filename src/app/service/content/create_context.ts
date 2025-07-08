import { type ScriptRunResource } from "@App/app/repo/scripts";
import { v4 as uuidv4 } from "uuid";
import type { ApiValue } from "./types";
import type { Message } from "@Packages/message/types";
import EventEmitter from "eventemitter3";
import { GMContextApiGet } from "./gm_context";
import { GM_Base } from "./gm_base";

// 设置api依赖
function setDepend(context: { [key: string]: any }, apiVal: ApiValue) {
  if (apiVal.param.depend) {
    for (let i = 0; i < apiVal.param.depend.length; i += 1) {
      const value = apiVal.param.depend[i];
      const dependApi = GMContextApiGet(value);
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
export function createContext(scriptRes: ScriptRunResource, GMInfo: any, envPrefix: string, message: Message): GM_Base {
  // 按照GMApi构建
  const valueChangeListener = new Map<number, { name: string; listener: GMTypes.ValueChangeListener }>();
  const EE: EventEmitter = new EventEmitter();
  const context: GM_Base & { [key: string]: any } = new GM_Base(envPrefix, message, scriptRes, valueChangeListener, EE);
  Object.assign(context, {
    runFlag: uuidv4(),
    eventId: 10000,
    GM: { info: GMInfo },
    GM_info: GMInfo,
    window: {
      onurlchange: null,
    },
  });
  if (scriptRes.metadata.grant) {
    const GM_cookie = function (action: string) {
      return (
        details: GMTypes.CookieDetails,
        done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
      ) => {
        return context["GM_cookie"](action, details, done);
      };
    };
    // 处理GM.与GM_，将GM_与GM.都复制一份
    const grant: string[] = [];
    scriptRes.metadata.grant.forEach((val) => {
      if (val.startsWith("GM_")) {
        const t = val.slice(3);
        grant.push(`GM.${t}`);
      } else if (val.startsWith("GM.")) {
        grant.push(val);
      }
      grant.push(val);
    });
    // 去重
    const uniqueGrant = new Set(grant);
    uniqueGrant.forEach((val) => {
      const api = GMContextApiGet(val);
      if (!api) {
        return;
      }
      if (/^(GM|window)\./.test(val)) {
        const [n, t] = val.split(".");
        if (t === "cookie") {
          const createGMCookePromise = (action: string) => {
            return (details: GMTypes.CookieDetails = {}) => {
              return new Promise((resolve, reject) => {
                let fn = GM_cookie(action);
                fn(details, function (cookie, error) {
                  if (error) {
                    reject(error);
                  } else {
                    resolve(cookie);
                  }
                });
              });
            };
          };
          context[n][t] = {
            list: createGMCookePromise("list"),
            delete: createGMCookePromise("delete"),
            set: createGMCookePromise("set"),
          };
          context["GM_cookie"] = api.api.bind(context);
        } else {
          (<{ [key: string]: any }>context[n])[t] = api.api.bind(context);
        }
      } else if (val === "GM_cookie") {
        // 特殊处理GM_cookie.list之类
        context[val] = api.api.bind(context);

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
  return <GM_Base>context;
}
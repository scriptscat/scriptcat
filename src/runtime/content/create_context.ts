/* eslint-disable camelcase */
import { v4 as uuidv4 } from "uuid";
import { type ScriptRunResource } from "@App/app/repo/scripts";
import type GMApi from "./gm_api";
import { type ApiValue, GMContext } from "./gm_api";
import { type MessageManager } from "@App/app/message/message";
import { GM_Base } from "./gm_api";

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
  scriptRes: ScriptRunResource,
  GMInfo: any,
  message: MessageManager
): GMApi {
  // 按照GMApi构建
  const context: GM_Base & { [key: string]: any } = new GM_Base();
  Object.assign(context, {
    scriptRes,
    message,
    valueChangeListener: new Map<
      number,
      { name: string; listener: GMTypes.ValueChangeListener }
    >(),
    runFlag: uuidv4(),
    GM: { Info: GMInfo },
    GM_info: GMInfo,
  });
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
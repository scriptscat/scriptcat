import { type ScriptRunResource } from "@App/app/repo/scripts";
import { v4 as uuidv4 } from "uuid";
import type { Message } from "@Packages/message/types";
import EventEmitter from "eventemitter3";
import { GMContextApiGet } from "./gm_context";
import { createGMBase } from "./gm_api";

// 构建沙盒上下文
export function createContext(
  scriptRes: ScriptRunResource,
  GMInfo: any,
  envPrefix: string,
  message: Message,
  scriptGrants: Set<string>
) {
  // 按照GMApi构建
  const valueChangeListener = new Map<number, { name: string; listener: GMTypes.ValueChangeListener }>();
  const EE: EventEmitter = new EventEmitter();
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
      onurlchange: null,
    },
    grantSet: new Set(),
  });
  // 兼容GM.Cookie.* ，外部無法查阅 API 的实作
  const createStubCallable = () => function (this: { [key: string]: any }, ...args: any) {
    const key = this.defaultFn;
    if (!key) throw new Error("this stub is not callable.");
    return context[`.fn::${key}`](...args);
  }
  const __methodInject__ = (grant: string): boolean => {
    const grantSet: Set<string> = context.grantSet;
    const s = GMContextApiGet(grant);
    if (!s) return false; // @grant 的定义未实作，略过 (返回 false 表示 @grant 不存在)
    if (grantSet.has(grant)) return true; // 重覆的@grant，略过 (返回 true 表示 @grant 存在)
    grantSet.add(grant);
    for (const {fnKey, api, param} of s) {
      context[`.fn::${fnKey}`] = api;
      const fnKeyArray = fnKey.split(".");
      const m = fnKeyArray.length;
      let g = context;
      for (let i = 0; i < m; i++) {
        const part = fnKeyArray[i];
        g = g[part] || (g[part] = createStubCallable()); // 建立占位函数物件
      }
      g.defaultFn = fnKey; // 定义占位函数物件的实作行为
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
  context.unsafeWindow = window;
  return context;
}

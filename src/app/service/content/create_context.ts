import { type ScriptRunResource } from "@App/app/repo/scripts";
import { v4 as uuidv4 } from "uuid";
import type { Message } from "@Packages/message/types";
import EventEmitter from "eventemitter3";
import { GMContextApiGet } from "./gm_context";
import { GM_Base } from "./gm_api";

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
  const context = GM_Base.create({
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
  const __methodInject__ = (grant: string): boolean => {
    const grantSet: Set<string> = context.grantSet;
    const s = GMContextApiGet(grant);
    if (!s) return false; // @grant 的定义未实作，略过 (返回 false 表示 @grant 不存在)
    if (grantSet.has(grant)) return true; // 重覆的@grant，略过 (返回 true 表示 @grant 存在)
    grantSet.add(grant);
    for (const t of s) {
      const fnKeyArray = t.fnKey.split(".");
      const m = fnKeyArray.length - 1;
      let g = context;
      for (let i = 0; i < m; i++) {
        const part = fnKeyArray[i];
        g = g[part] || (g[part] = {});
      }
      const finalPart = fnKeyArray[m];
      if (g[finalPart]) {
        // 如果已存在且当前要设置的是一个函数，需要特殊处理
        // 保持现有的属性，同时让对象可调用
        if (typeof t.api === 'function' && typeof g[finalPart] === 'object') {
          const existingObj = g[finalPart];
          const boundApi = t.api.bind(context);
          // 创建一个可调用的对象，保留现有属性
          const callableObj = function(...args: any[]) {
            return boundApi(...args);
          };
          // 复制现有属性到新的可调用对象
          Object.assign(callableObj, existingObj);
          g[finalPart] = callableObj;
        }
        continue;
      }
      g[finalPart] = t.api.bind(context);
      const depend = t?.param?.depend;
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

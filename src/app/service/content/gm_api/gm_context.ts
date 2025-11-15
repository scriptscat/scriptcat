import type { ApiParam, ApiValue } from "../types";

const apis: Map<string, ApiValue[]> = new Map();

export function GMContextApiGet(name: string): ApiValue[] | undefined {
  // 回传 Api 列表
  return apis.get(name);
}

function GMContextApiSet(grant: string, fnKey: string, api: any, param: ApiParam): void {
  // 一个 @grant 可以扩充多个 API 函数
  let m: ApiValue[] | undefined = apis.get(grant);
  if (!m) apis.set(grant, (m = []));
  m.push({ fnKey, api, param });
}

export const protect: { [key: string]: any } = {};

export default class GMContext {
  public static protected(value: any = undefined) {
    return (target: any, propertyName: string) => {
      // keyword是与createContext时同步的,避免访问到context的内部变量
      // 暂时只用於禁止存取（value = undefined)。日后有需要可扩展成假值
      protect[propertyName] = value;
    };
  }

  public static API(param: ApiParam = {}) {
    return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
      const key = propertyName;
      let { follow } = param;
      const { alias } = param;
      if (!follow) {
        follow = key; // follow 是实际 @grant 的权限；使用follow时，不要使用alias以避免混乱
      }
      GMContextApiSet(follow, key, descriptor.value, param);
      if (alias) {
        // 追加别名呼叫（参数和回传完全一致，为 GM_xxx 与 GM.xxx 等问题设计）
        GMContextApiSet(alias, alias, descriptor.value, param);
      }
    };
  }
}

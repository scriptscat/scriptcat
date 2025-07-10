import type { ApiParam, ApiValue } from "./types";

const apis: Map<string, ApiValue[]> = new Map();

export function GMContextApiGet(name: string): ApiValue[] | undefined {
  // 回傳 Api 列表
  return apis.get(name);
}

export function GMContextApiSet(grant: string, fnKey: string, api: any, param: ApiParam): void {
  // 一个 @grant 可以扩充多个 API 函数
  let m: ApiValue[] | undefined = apis.get(grant);
  if (!m) apis.set(grant, m = []);
  m.push({ fnKey, api, param });
  
  // 如果有别名，也在别名下注册 API
  if (param.alias) {
    let aliasM: ApiValue[] | undefined = apis.get(param.alias);
    if (!aliasM) apis.set(param.alias, aliasM = []);
    aliasM.push({ fnKey, api, param });
  }
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
      if (!follow) follow = key; // follow 是实际 @grant 的权限
      GMContextApiSet(follow, key, descriptor.value, param);
    };
  }
}
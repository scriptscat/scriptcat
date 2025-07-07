import type { ApiParam, ApiValue } from "./types";

const apis: Map<string, ApiValue> = new Map();

export function GMContextApiGet(name: string): ApiValue | undefined {
  return apis.get(name);
}

export function GMContextApiSet(name: string, api: any, param: ApiParam): void {
  apis.set(name, {api, param});
}

export default class GMContext {

  public static API(param: ApiParam = {}) {
    return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
      const key = propertyName;
      if (/^(GM|window)Dot/.test(key)) {
        const key = propertyName.replace(/^(GM|window)Dot(.)/, (_, a, b) => `${a}.${b.toLowerCase()}`);
        GMContextApiSet(key, descriptor.value, param);
        return;
      }
      GMContextApiSet(key, descriptor.value, param);
      // 兼容GM.*
      let dot = key.replace("_", ".");
      if (dot !== key) {
        // 特殊处理GM.*一些大小写不一致的情况
        switch (dot) {
          case "GM.xmlhttpRequest":
            dot = "GM.xmlHttpRequest";
            break;
        }
        GMContextApiSet(dot, descriptor.value, param);
      }
    };
  }
}
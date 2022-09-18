// gm api 权限验证

import { PermissionDAO } from "@App/app/repo/permission";
import { Script } from "@App/app/repo/scripts";
import { Api, Request } from "./gm_api";

export interface ApiParam {
  // 默认提供的函数
  default?: boolean;
  // 是否只有后台环境中才能执行
  background?: boolean;
  // 是否需要弹出页面让用户进行确认
  confirm?: (request: Request, script: Script) => Promise<boolean>;
  // 监听方法
  listener?: () => void;
  // 别名
  alias?: string[];
}

export interface ApiValue {
  api: Api;
  param: ApiParam;
}

export default class PermissionVerify {
  static apis: Map<string, ApiValue> = new Map();

  public static API(param: ApiParam = {}) {
    return (
      target: any,
      propertyName: string,
      descriptor: PropertyDescriptor
    ) => {
      const key = propertyName;
      if (param.listener) {
        param.listener();
      }
      PermissionVerify.apis.set(key, {
        api: descriptor.value,
        param,
      });
      // 兼容GM.*
      let dot = key.replace("_", ".");
      if (dot !== key) {
        // 特殊处理GM.xmlHttpRequest
        if (dot === "GM.xmlhttpRequest") {
          dot = "GM.xmlHttpRequest";
        }
        PermissionVerify.apis.set(dot, {
          api: descriptor.value,
          param,
        });
      }
    };
  }

  permissionDAO: PermissionDAO;

  constructor() {
    this.permissionDAO = new PermissionDAO();
  }

  // 验证是否有权限
  verify(request: Request, script: Script, api: ApiValue): Promise<boolean> {
    if (api.param.default) {
      return Promise.resolve(true);
    }
    if (api.param.confirm) {
      // 需要弹出页面确认
      this.permissionDAO.find();
    } else {
      // 没有其它条件,从metadata.grant中判断
      const { grant } = script.metadata;
      if (!grant) {
        return Promise.reject(new Error(""));
      }
      for (let i = 0; i < grant.length; i += 1) {
        if (grant[i] === request.api) {
          return Promise.resolve(true);
        }
      }
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }
}

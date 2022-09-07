/* eslint-disable camelcase */
/* eslint-disable max-classes-per-file */
import Cache from "@App/app/cache";
import MessageCenter from "@App/app/message/center";
import { Connect } from "@App/app/message/message";
import { ScriptDAO } from "@App/app/repo/scripts";
import { keyScript } from "@App/utils/cache_key";
import PermissionVerify from "./permission_verify";

// GMApi,处理脚本的GM API调用请求

export type MessageRequest = {
  scriptId: number; // 脚本id
  api: string;
  params: any[];
};

export type Request = MessageRequest & {
  name: string; // 脚本名
  tabId?: number;
  iframeId?: number;
  sandbox?: boolean;
};

export type Api = (request: Request, connect?: Connect) => Promise<any>;

export default class GMApi {
  message: MessageCenter;

  script: ScriptDAO;

  permissionVerify: PermissionVerify;

  constructor() {
    this.message = MessageCenter.getInstance();
    this.script = new ScriptDAO();
    this.permissionVerify = new PermissionVerify();
  }

  start() {
    this.message.setHandler(
      "gm_api",
      async (action: string, data: MessageRequest) => {
        const api = PermissionVerify.apis.get(data.api);
        if (!api) {
          return Promise.resolve(false);
        }
        const script = await Cache.getInstance().getOrSet(
          keyScript(data.scriptId),
          () => {
            return this.script.findById(data.scriptId);
          }
        );
        if (!script) {
          return Promise.resolve(false);
        }
        const req: Request = <Request>data;
        req.name = script.name;
        // 做一些权限判断
        if (await this.permissionVerify.verify(script, api)) {
          return api.api(req);
        }
        return Promise.reject(new Error("Permission denied"));
      }
    );
    this.message.setHandlerWithConnect(
      "gm_api",
      (connect: Connect, action: string, data: MessageRequest) => {
        console.log(action, data);
      }
    );
  }

  @PermissionVerify.API()
  GM_setValue(request: Request): Promise<any> {
    console.log(request);
    return Promise.resolve(true);
  }
}

/* eslint-disable camelcase */
import Cache from "@App/app/cache";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import MessageCenter from "@App/app/message/center";
import { Channel } from "@App/app/message/channel";
import { v4 as uuidv4 } from "uuid";
import { MessageSender } from "@App/app/message/message";
import { Script, ScriptDAO } from "@App/app/repo/scripts";
import ValueManager from "@App/app/service/value/manager";
import CacheKey from "@App/utils/cache_key";
import { base64ToBlob } from "@App/utils/script";
import PermissionVerify, { ConfirmParam } from "./permission_verify";
import { dealXhr, listenerWebRequest, setXhrUnsafeHeader } from "./utils";

// GMApi,处理脚本的GM API调用请求

export type MessageRequest = {
  scriptId: number; // 脚本id
  api: string;
  runFlag: string;
  params: any[];
};

export type Request = MessageRequest & {
  script: Script;
  sender: MessageSender;
};

export type Api = (request: Request, connect?: Channel) => Promise<any>;

export default class GMApi {
  message: MessageCenter;

  script: ScriptDAO;

  permissionVerify: PermissionVerify;

  logger: Logger = LoggerCore.getLogger({ component: "GMApi" });

  headerFlag: string;

  constructor() {
    this.message = MessageCenter.getInstance();
    this.script = new ScriptDAO();
    this.permissionVerify = new PermissionVerify();
    this.headerFlag = `x-cat-${uuidv4()}`;
  }

  start() {
    this.message.setHandler(
      "gmApi",
      async (_action: string, data: MessageRequest, sender: MessageSender) => {
        const api = PermissionVerify.apis.get(data.api);
        if (!api) {
          return Promise.reject(new Error("api is not found"));
        }
        const req = await this.parseRequest(data, sender);
        try {
          await this.permissionVerify.verify(req, api);
        } catch (e) {
          this.logger.error("verify error", Logger.E(e));
          return Promise.reject(e);
        }
        return api.api.call(this, req);
      }
    );
    this.message.setHandlerWithConnect(
      "gmApiChannel",
      async (
        connect: Channel,
        _action: string,
        data: MessageRequest,
        sender: MessageSender
      ) => {
        const api = PermissionVerify.apis.get(data.api);
        if (!api) {
          return connect.throw("api is not found");
        }
        const req = await this.parseRequest(data, sender);
        try {
          await this.permissionVerify.verify(req, api);
        } catch (e: any) {
          this.logger.error("verify error", Logger.E(e));
          return connect.throw(e.message);
        }
        return api.api.call(this, req, connect);
      }
    );
    // 监听web请求
    listenerWebRequest(this.headerFlag);
  }

  // 解析请求
  async parseRequest(
    data: MessageRequest,
    sender: MessageSender
  ): Promise<Request> {
    const script = await Cache.getInstance().getOrSet(
      CacheKey.script(data.scriptId),
      () => {
        return this.script.findById(data.scriptId);
      }
    );
    if (!script) {
      return Promise.reject(new Error("script is not found"));
    }
    const req: Request = <Request>data;
    req.script = script;
    req.sender = sender;
    return Promise.resolve(req);
  }

  @PermissionVerify.API()
  GM_setValue(request: Request): Promise<any> {
    if (!request.params || request.params.length !== 2) {
      return Promise.reject(new Error("param is failed"));
    }
    const [key, value] = request.params;
    const sender = <MessageSender & { runFlag: string }>request.sender;
    sender.runFlag = request.runFlag;
    return ValueManager.getInstance().setValue(
      request.script,
      key,
      value,
      sender
    );
  }

  @PermissionVerify.API({
    confirm: (request: Request) => {
      const config = <GMSend.XHRDetails>request.params[0];
      const url = new URL(config.url);
      if (request.script.metadata.connect) {
        const { connect } = request.script.metadata;
        for (let i = 0; i < connect.length; i += 1) {
          if (url.hostname.endsWith(connect[i])) {
            return Promise.resolve(true);
          }
        }
      }
      return Promise.resolve({
        permission: "cors",
        permissionValue: url.hostname,
        title: "脚本正在试图访问跨域资源",
        metadata: {
          脚本名称: request.script.name,
          请求域名: url.hostname,
          请求地址: config.url,
        },
        describe:
          "请您确认是否允许脚本进行此操作,脚本也可增加@connect标签跳过此选项",
        wildcard: true,
        permissionContent: "域名",
      } as ConfirmParam);
    },
    alias: ["GM.xmlHttpRequest"],
  })
  async GM_xmlhttpRequest(request: Request, channel: Channel): Promise<any> {
    if (request.params.length <= 0) {
      // 错误
      return channel.throw("param is failed");
    }
    const config = <GMSend.XHRDetails>request.params[0];

    const xhr = new XMLHttpRequest();
    xhr.open(
      config.method || "GET",
      config.url,
      true,
      config.user || "",
      config.password || ""
    );
    if (config.overrideMimeType) {
      xhr.overrideMimeType(config.overrideMimeType);
    }
    if (config.responseType !== "json") {
      xhr.responseType = config.responseType || "";
    }

    const deal = async (event: string, data?: any) => {
      const response: any = await dealXhr(this.headerFlag, config, xhr);
      if (data) {
        Object.keys(data).forEach((key) => {
          response[key] = data[key];
        });
      }
      channel.send({ event, data: response });
    };
    xhr.onload = () => {
      deal("onload");
    };
    xhr.onloadstart = () => {
      deal("onloadstart");
    };
    xhr.onloadend = () => {
      deal("onloadstart");
    };
    xhr.onabort = () => {
      deal("onabort");
    };
    xhr.onerror = () => {
      deal("onerror");
    };
    xhr.onprogress = (event) => {
      const respond: GMTypes.XHRProgress = {
        done: xhr.DONE,
        lengthComputable: event.lengthComputable,
        loaded: event.loaded,
        total: event.total,
        totalSize: event.total,
      };
      deal("onprogress", respond);
    };
    xhr.onreadystatechange = () => {
      deal("onreadystatechange");
    };
    xhr.ontimeout = () => {
      channel.send({ event: "ontimeout" });
    };
    setXhrUnsafeHeader(this.headerFlag, config, xhr);

    if (config.timeout) {
      xhr.timeout = config.timeout;
    }

    if (config.overrideMimeType) {
      xhr.overrideMimeType(config.overrideMimeType);
    }

    channel.disChannelHandler = () => {
      xhr.abort();
    };

    if (config.dataType === "FormData") {
      const data = new FormData();
      if (config.data && config.data instanceof Array) {
        config.data.forEach((val: GMSend.XHRFormData) => {
          if (val.type === "file") {
            data.append(val.key, base64ToBlob(val.val), val.filename);
          } else {
            data.append(val.key, val.val);
          }
        });
        xhr.send(data);
      }
    } else if (config.dataType === "Blob") {
      if (!config.data) {
        return channel.throw("data is null");
      }
      const resp = await (await fetch(<string>config.data)).blob();
      xhr.send(resp);
    } else {
      xhr.send(<string>config.data);
    }
    return Promise.resolve();
  }
}

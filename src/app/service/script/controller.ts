import {
  Script,
  ScriptDAO,
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import { SubscribeDAO } from "@App/app/repo/subscribe";
import { v4 as uuidv4 } from "uuid";
import { parseMetadata, parseUserConfig, ScriptInfo } from "@App/utils/script";
import { nextTime } from "@App/utils/utils";
import ConnectInternal from "../../connect/internal";
import { ScriptEvent } from "./event";

// 脚本控制器,主要负责与manager交互,控制器发送消息给manager,manager进行处理
export default class ScriptController {
  static instance: ScriptController;

  static getInstance() {
    return ScriptController.instance;
  }

  scriptDAO: ScriptDAO = new ScriptDAO();

  subscribeDAO: SubscribeDAO = new SubscribeDAO();

  internal: ConnectInternal;

  constructor(internal: ConnectInternal) {
    this.internal = internal;
    if (!ScriptController.instance) {
      ScriptController.instance = this;
    }
  }

  public dispatchEvent(event: ScriptEvent, data: any): Promise<any> {
    return new Promise((resolve) => {
      this.internal.sendSingleStream(`script-${event}`, data, (resp) => {
        resolve(resp);
      });
    });
  }

  public install() {
    return this.dispatchEvent("install", {});
  }

  public fetch(uuid: string): Promise<ScriptInfo> {
    return this.dispatchEvent("fetch", uuid);
  }

  // 通过代码解析出脚本信息
  public prepareScriptByCode(
    code: string,
    u?: string,
    uuid?: string
  ): Promise<Script> {
    const url = u || "";
    return new Promise((resolve) => {
      const metadata = parseMetadata(code);
      if (metadata == null) {
        throw new Error("MetaData信息错误");
      }
      if (metadata.name === undefined) {
        throw new Error("脚本名不能为空");
      }
      let type = SCRIPT_TYPE_NORMAL;
      if (metadata.crontab !== undefined) {
        type = SCRIPT_TYPE_CRONTAB;
        if (nextTime(metadata.crontab[0]) === "错误的定时表达式") {
          throw new Error("错误的定时表达式");
        }
      } else if (metadata.background !== undefined) {
        type = SCRIPT_TYPE_BACKGROUND;
      }
      let urlSplit: string[];
      let domain = "";
      let checkUpdateUrl = "";
      let downloadUrl = url;
      if (metadata.updateurl && metadata.downloadurl) {
        [checkUpdateUrl] = metadata.updateurl;
        [downloadUrl] = metadata.downloadurl;
      } else {
        checkUpdateUrl = url.replace("user.js", "meta.js");
      }
      if (url.indexOf("/") !== -1) {
        urlSplit = url.split("/");
        if (urlSplit[2]) {
          [, domain] = urlSplit;
        }
      }
      this.scriptDAO.findByUUIDAndSubscribeUrl("123", "123");
      const script: Script = {
        id: 0,
        uuid: uuid || uuidv4(),
        name: metadata.name[0],
        code,
        author: metadata.author && metadata.author[0],
        namespace: metadata.namespace && metadata.namespace[0],
        originDomain: domain,
        origin: url,
        checkUpdateUrl,
        downloadUrl,
        config: parseUserConfig(code),
        metadata,
        selfMetadata: {},
        sort: -1,
        type,
        status: SCRIPT_STATUS_DISABLE,
        runStatus: SCRIPT_RUN_STATUS_COMPLETE,
        createtime: new Date().getTime(),
        updatetime: new Date().getTime(),
        checktime: 0,
      };
      resolve(script);
    });
  }
}

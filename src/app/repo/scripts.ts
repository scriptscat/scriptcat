import { Repo } from "./repo";
import { Resource } from "./resource";

// 脚本模型
export type SCRIPT_TYPE = 1 | 2 | 3;

export const SCRIPT_TYPE_NORMAL: SCRIPT_TYPE = 1;
export const SCRIPT_TYPE_CRONTAB: SCRIPT_TYPE = 2;
export const SCRIPT_TYPE_BACKGROUND: SCRIPT_TYPE = 3;

export type SCRIPT_STATUS = 1 | 2;

export const SCRIPT_STATUS_ENABLE: SCRIPT_STATUS = 1;
export const SCRIPT_STATUS_DISABLE: SCRIPT_STATUS = 2;

export type SCRIPT_RUN_STATUS = "running" | "complete" | "error";
export const SCRIPT_RUN_STATUS_RUNNING: SCRIPT_RUN_STATUS = "running";
export const SCRIPT_RUN_STATUS_COMPLETE: SCRIPT_RUN_STATUS = "complete";
export const SCRIPT_RUN_STATUS_ERROR: SCRIPT_RUN_STATUS = "error";

export type Metadata = { [key: string]: string[] | undefined };

export type ConfigType = "text" | "checkbox" | "select" | "mult-select" | "number" | "textarea" | "time";

export interface Config {
  [key: string]: any;
  title: string;
  description: string;
  default?: any;
  type?: ConfigType;
  bind?: string;
  values?: any[];
  password?: boolean;
  // 文本类型时是字符串长度,数字类型时是最大值
  max?: number;
  min?: number;
  rows?: number; // textarea行数
}

export type UserConfig = { [key: string]: { [key: string]: Config } };

export interface Script {
  uuid: string; // 脚本uuid,通过脚本uuid识别唯一脚本
  name: string; // 脚本名称
  namespace: string; // 脚本命名空间
  author?: string; // 脚本作者
  originDomain?: string; // 脚本来源域名
  origin?: string; // 脚本来源
  checkUpdateUrl?: string; // 检查更新URL
  downloadUrl?: string; // 脚本下载URL
  metadata: Metadata; // 脚本的元数据
  selfMetadata?: Metadata; // 自定义脚本元数据
  subscribeUrl?: string; // 如果是通过订阅脚本安装的话,会有订阅地址
  config?: UserConfig; // 通过UserConfig定义的用户配置
  type: SCRIPT_TYPE; // 脚本类型 1:普通脚本 2:定时脚本 3:后台脚本
  status: SCRIPT_STATUS; // 脚本状态 1:启用 2:禁用 3:错误 4:初始化
  sort: number; // 脚本顺序位置
  runStatus: SCRIPT_RUN_STATUS; // 脚本运行状态,后台脚本才会有此状态 running:运行中 complete:完成 error:错误 retry:重试
  error?: { error: string } | string; // 运行错误信息
  createtime: number; // 脚本创建时间戳
  updatetime?: number; // 脚本更新时间戳
  checktime: number; // 脚本检查更新时间戳
  lastruntime?: number; // 脚本最后一次运行时间戳
  nextruntime?: number; // 脚本下一次运行时间戳
}

// 分开存储脚本代码
export interface ScriptCode {
  uuid: string;
  code: string; // 脚本执行代码
}

export type ScriptAndCode = Script & ScriptCode;

// 脚本运行时的资源,包含已经编译好的脚本与脚本需要的资源
export interface ScriptRunResouce extends Script {
  code: string;
  value: { [key: string]: any };
  flag: string;
  resource: { [key: string]: Resource };
}

export class ScriptDAO extends Repo<Script> {
  scriptCodeDAO: ScriptCodeDAO = new ScriptCodeDAO();

  constructor() {
    super("script");
  }

  public save(val: Script) {
    return super._save(val.uuid, val);
  }

  findByUUID(uuid: string) {
    return this.get(uuid);
  }

  getAndCode(uuid: string): Promise<ScriptAndCode | undefined> {
    return Promise.all([this.get(uuid), this.scriptCodeDAO.get(uuid)]).then(([script, code]) => {
      if (!script || !code) {
        return undefined;
      }
      return Object.assign(script, code);
    });
  }

  public findByName(name: string) {
    return this.findOne((key, value) => {
      return value.name === name;
    });
  }

  public findByNameAndNamespace(name: string, namespace?: string) {
    return this.findOne((key, value) => {
      return value.name === name && (!namespace || value.namespace === namespace);
    });
  }

  public findByUUIDAndSubscribeUrl(uuid: string, suburl: string) {
    return this.findOne((key, value) => {
      return value.uuid === uuid && value.subscribeUrl === suburl;
    });
  }

  public findByOriginAndSubscribeUrl(origin: string, suburl: string) {
    return this.findOne((key, value) => {
      return value.origin === origin && value.subscribeUrl === suburl;
    });
  }
}

// 为了防止脚本代码数据量过大,单独存储脚本代码
export class ScriptCodeDAO extends Repo<ScriptCode> {
  constructor() {
    super("scriptCode");
  }

  findByUUID(uuid: string) {
    return this.get(uuid);
  }

  public save(val: ScriptCode) {
    return super._save(val.uuid, val);
  }
}

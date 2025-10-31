import { Repo } from "./repo";
import type { Resource } from "./resource";
import type { SCMetadata } from "./metadata";

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

export { SCMetadata };

export type ConfigType = "text" | "checkbox" | "select" | "mult-select" | "number" | "textarea" | "switch";

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
  index: number; // 配置项排序位置
}

export interface ConfigGroup {
  [key: string]: Config;
}

export type UserConfig = Partial<
  Record<string, ConfigGroup> & {
    "#options": { sort: string[] };
  }
>;

// 排除掉 #options
export type UserConfigWithoutOptions = Omit<{ [key: string]: ConfigGroup }, "#options">;

export interface Script {
  uuid: string; // 脚本uuid,通过脚本uuid识别唯一脚本
  name: string; // 脚本名称
  namespace: string; // 脚本命名空间
  author?: string; // 脚本作者
  originDomain?: string; // 脚本来源域名
  origin?: string; // 脚本来源
  checkUpdate?: boolean; // 是否检查更新
  checkUpdateUrl?: string; // 检查更新URL
  downloadUrl?: string; // 脚本下载URL
  metadata: SCMetadata; // 脚本的元数据
  selfMetadata?: SCMetadata; // 自定义脚本元数据
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
  ignoreVersion?: string; // 忽略單一版本的更新檢查
}

// 分开存储脚本代码
export interface ScriptCode {
  uuid: string;
  code: string; // 脚本执行代码
}

export interface ScriptSite {
  [uuid: string]: string[] | undefined;
}

export type ScriptAndCode = Script & ScriptCode;

// 脚本运行时的资源,包含已经编译好的脚本与脚本需要的资源
export interface ScriptRunResource extends Script {
  code: string; // 原始代码
  value: { [key: string]: any };
  flag: string;
  resource: { [key: string]: { base64?: string } & Omit<Resource, "base64"> }; // 资源列表,包含脚本需要的资源
  metadata: SCMetadata; // 经自定义覆盖的 Metadata
  originalMetadata: SCMetadata; // 原本的 Metadata （目前只需要 match, include, exclude）
}

export class ScriptDAO extends Repo<Script> {
  scriptCodeDAO: ScriptCodeDAO = new ScriptCodeDAO();

  constructor() {
    super("script");
  }

  enableCache(): void {
    super.enableCache();
    this.scriptCodeDAO.enableCache();
  }

  public save(val: Script) {
    return super._save(val.uuid, val);
  }

  findByUUID(uuid: string) {
    return this.get(uuid);
  }

  async getAndCode(uuid: string): Promise<ScriptAndCode | undefined> {
    const [script, code] = await Promise.all([this.get(uuid), this.scriptCodeDAO.get(uuid)]);
    if (!script || !code) {
      return undefined;
    }
    return Object.assign(script, code);
  }

  public findByName(name: string) {
    return this.findOne((key, value) => {
      return value.name === name;
    });
  }

  public findByNameAndNamespace(name: string, namespace: string) {
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

  public async searchExistingScript(targetScript: Script, toCheckScriptInfoEqual: boolean = true): Promise<Script[]> {
    const removeScriptNameFromURL = (url: string) => {
      // https://scriptcat.org/scripts/code/{id}/{scriptname}.user.js (单匹配)
      if (url.startsWith("https://scriptcat.org/scripts/code/") && url.endsWith(".js")) {
        const idx1 = url.indexOf("/", "https://scriptcat.org/scripts/code/".length);
        const idx2 = url.indexOf("/", idx1 + 1);
        if (idx1 > 0 && idx2 < 0) {
          const idx3 = url.indexOf(".", idx1 + 1);
          return url.substring(0, idx1 + 1) + "*" + url.substring(idx3);
        }
      }
      // https://update.greasyfork.org/scripts/{id}/{scriptname}.user.js (单匹配)
      if (url.startsWith("https://update.greasyfork.org/scripts/") && url.endsWith(".js")) {
        const idx1 = url.indexOf("/", "https://update.greasyfork.org/scripts/".length);
        const idx2 = url.indexOf("/", idx1 + 1);
        if (idx1 > 0 && idx2 < 0) {
          const idx3 = url.indexOf(".", idx1 + 1);
          return url.substring(0, idx1 + 1) + "*" + url.substring(idx3);
        }
      }
      // https://openuserjs.org/install/{username}/{scriptname}.user.js (复数匹配)
      if (url.startsWith("https://openuserjs.org/install/") && url.endsWith(".js")) {
        const idx1 = url.indexOf("/", "https://openuserjs.org/install/".length);
        const idx2 = url.indexOf("/", idx1 + 1);
        if (idx1 > 0 && idx2 < 0) {
          const idx3 = url.indexOf(".", idx1 + 1);
          return url.substring(0, idx1 + 1) + "*" + url.substring(idx3);
        }
      }
      return url;
    };
    const valEqual = (val1: any, val2: any) => {
      if (val1 && val2 && Array.isArray(val1) && Array.isArray(val2)) {
        if (val1.length !== val2.length) return false;
        if (val1.length < 2) {
          return val1[0] === val2[0];
        }
        // 無視次序
        const s = new Set([...val1, ...val2]);
        if (s.size !== val1.length) return false;
        return true;
      }
      return val1 === val2;
    };
    const isScriptInfoEqual = (script1: Script, script2: Script) => {
      // @author, @copyright, @license 應該不會改
      if (!valEqual(script1.metadata.author, script2.metadata.author)) return false;
      if (!valEqual(script1.metadata.copyright, script2.metadata.copyright)) return false;
      if (!valEqual(script1.metadata.license, script2.metadata.license)) return false;
      // @grant, @connect 應該不會改
      if (!valEqual(script1.metadata.grant, script2.metadata.grant)) return false;
      if (!valEqual(script1.metadata.connect, script2.metadata.connect)) return false;
      // @match @include 應該不會改
      if (!valEqual(script1.metadata.match, script2.metadata.match)) return false;
      if (!valEqual(script1.metadata.include, script2.metadata.include)) return false;
      return true;
    };

    const { metadata, origin } = targetScript;

    if (origin && !metadata?.updateurl?.[0] && !metadata?.downloadurl?.[0]) {
      // scriptcat
      const targetOrigin = removeScriptNameFromURL(origin);
      return this.find((key, entry) => {
        if (!entry.origin) return false;
        const entryOrigin = removeScriptNameFromURL(entry.origin);
        if (targetOrigin !== entryOrigin) return false;
        if (toCheckScriptInfoEqual && !isScriptInfoEqual(targetScript, entry)) return false;
        return true;
      });
    } else if (origin && (metadata?.updateurl?.[0] || metadata?.downloadurl?.[0])) {
      // greasyfork

      const targetOrigin = removeScriptNameFromURL(origin);
      const targetUpdateURL = removeScriptNameFromURL(metadata?.updateurl?.[0] || "");
      const targetDownloadURL = removeScriptNameFromURL(metadata?.downloadurl?.[0] || "");
      return this.find((key, entry) => {
        if (!entry.origin) return false;
        const entryOrigin = removeScriptNameFromURL(entry.origin);
        if (targetOrigin !== entryOrigin) return false;

        const entryUpdateURL = removeScriptNameFromURL(entry.metadata?.updateurl?.[0] || "");
        const entryDownloadURL = removeScriptNameFromURL(entry.metadata?.downloadurl?.[0] || "");

        if (targetUpdateURL !== entryUpdateURL || targetDownloadURL !== entryDownloadURL) return false;
        if (toCheckScriptInfoEqual && !isScriptInfoEqual(targetScript, entry)) return false;
        return true;
      });
    } else {
      return [];
    }
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

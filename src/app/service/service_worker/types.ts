import type { Script, ScriptRunResource, SCRIPT_RUN_STATUS, SCMetadata, UserConfig } from "@App/app/repo/scripts";
import { type URLRuleEntry } from "@App/pkg/utils/url_matcher";
import { type IGetSender } from "@Packages/message/server";

export type InstallSource = "user" | "system" | "sync" | "subscribe" | "vscode";
export type SearchType = "auto" | "name" | "script_code";

export interface ScriptMatchInfo extends ScriptRunResource {
  scriptUrlPatterns: URLRuleEntry[]; // 已被自定义覆盖的 UrlPatterns
  originalUrlPatterns: URLRuleEntry[]; // 脚本原本的 UrlPatterns
}

export interface ScriptLoadInfo extends ScriptRunResource {
  metadataStr: string; // 脚本元数据字符串
  userConfigStr: string; // 用户配置字符串
  userConfig?: UserConfig;
}

// 为了优化性能，存储到缓存时删除了code、value与resource
export type TScriptMatchInfoEntry = {
  code: "";
  value: Record<string, never>;
  resource: Record<string, never>;
  sort?: number;
} & Omit<ScriptMatchInfo, "code" | "value" | "resource">;

export interface EmitEventRequest {
  uuid: string;
  event: string;
  eventId: string;
  data?: any;
}

// GMApi,处理脚本的GM API调用请求

export type MessageRequest = {
  uuid: string; // 脚本id
  api: string;
  runFlag: string;
  params: any[];
};

export type Request = MessageRequest & {
  script: Script;
};

export type NotificationMessageOption = {
  event: "click" | "buttonClick" | "close";
  params: {
    /**
     * event为buttonClick时存在该值
     *
     * buttonClick的index
     */
    index?: number;
    /**
     * 是否是用户点击
     */
    byUser?: boolean;
  };
};

export type Api = (request: Request, con: IGetSender) => Promise<any>;

// popup

export type ScriptMenuItemOption = {
  id?: number;
  autoClose?: boolean;
  title?: string;
  accessKey?: string;
  // 可选输入框
  inputType?: "text" | "number" | "boolean";
  inputLabel?: string;
  inputDefaultValue?: string | number | boolean;
  inputPlaceholder?: string;
};

/**
 * 脚本菜单命令的「原始 ID」型别。
 *
 * 来源：
 * - 根据 Tampermonkey (TM) 定义，GM_registerMenuCommand 会回传一个「累计数字 ID」，由系统自动生成。
 * - 若透过 options.id 传入自订的 ID，则可能是 string 或 number。
 *
 * 使用方式：
 * - 内部首先会读取 options.id，若不存在则由内部计数器 menuIdCounter 累加生成新的数字 ID。
 * - 取得后，统一先转成字符串以利后续处理：
 *   - 原始设计：数字 ID → `n{ID}`，字串 ID → `t{ID}`
 *   - 目前实现：无论数字或字串，统一转成 `t{ID}`。
 *     （日后如有需要，可再恢复区分）
 *
 * 注意：
 * - 此 ID 只是注册时取得的原始识别符。
 * - 不保证在不同 frame (mainframe / subframe) 间唯一。
 * - 因此这个 ID 仅供「脚本执行环境内部使用」，不是最终的唯一键。
 */
export type TScriptMenuItemID = number | string;

// 为了语意清楚：用于 menu item 显示名称的型别
// 显示在右键选单上的「文字名称」。
// 例如「开启设定」、「清除快取」。
export type TScriptMenuItemName = string;

/**
 * 菜单命令的「最终唯一键」型别。
 *
 * 来源：
 * - 由 TScriptMenuItemID 转换而来，并附加上环境识别符 (contentEnvKey)。
 * - 生成规则：`{contentEnvKey}.t{ID}`
 *   - 例如：`main.t1`、`sub.t5`。
 *
 * 特点：
 * - menuKey 必须在整个执行环境中唯一。
 * - 即使命令名称相同，只要 key 不同，就能区分为不同的命令。
 * - 这个唯一键是脚本内部判定「是否同一个 menu item」的依据。
 */
export type TScriptMenuItemKey = string;

// 单一的选单项目结构。
// - groupKey：用来把「相同性质」的项目合并（例如 mainframe / subframe 都注册相同命令）。
// - key：唯一键，对应 GM_registerMenuCommand 信息传递的第一个参数。
// - name：显示文字。
// - options：选单的额外设定，例如是否是输入框、是否自动关闭等。
// - tabId：表示来自哪个分页，-1 表示背景脚本。
// - frameId / documentId：用于区分 iframe 或特定文件。
export type ScriptMenuItem = {
  groupKey: string;
  key: TScriptMenuItemKey;
  name: TScriptMenuItemName;
  options?: ScriptMenuItemOption;
  tabId: number; //-1表示后台脚本
  frameId?: number;
  documentId?: string;
};

// 一组选单项目，对应到一个脚本 (uuid)。
// - uuid：脚本唯一 ID。
// - groupKey：分组键，确保 UI 显示时不重复。
// - menus：此脚本在当前分页的所有选单项目。
export type GroupScriptMenuItem = {
  uuid: string;
  groupKey: string;
  menus: ScriptMenuItem[];
};

// GM_registerMenuCommand 信息传递的呼叫参数型别：
// [唯一键, 显示名称, options(不包含 id 属性)]
// 使用范例：GM_registerMenuCommand信息传递("myKey", "开启设定", { autoClose: true });
export type GMRegisterMenuCommandParam = [TScriptMenuItemKey, TScriptMenuItemName, Omit<ScriptMenuItemOption, "id">];

// GM_unregisterMenuCommand 信息传递的呼叫参数型别：
// [唯一键]
// 使用范例：GM_unregisterMenuCommand信息传递("myKey");
export type GMUnRegisterMenuCommandParam = [TScriptMenuItemKey];

export type ScriptMenu = {
  uuid: string; // 脚本uuid
  name: string; // 脚本名称
  storageName: string; // 脚本存储名称
  enable: boolean; // 脚本是否启用
  updatetime: number; // 脚本更新时间
  hasUserConfig: boolean; // 是否有用户配置
  metadata: SCMetadata; // 脚本元数据
  runStatus?: SCRIPT_RUN_STATUS; // 脚本运行状态
  runNum: number; // 脚本运行次数
  runNumByIframe: number; // iframe运行次数
  menus: ScriptMenuItem[]; // 脚本菜单
  isEffective: boolean | null; // 是否在当前网址启动
};

export type TBatchUpdateRecord =
  | {
      uuid: string;
      checkUpdate: false;
      oldCode?: undefined;
      newCode?: undefined;
      newMeta?: undefined;
      script?: undefined;
      codeSimilarity?: undefined;
      sites?: undefined;
      withNewConnect?: undefined;
    }
  | {
      uuid: string;
      checkUpdate: true;
      oldCode: any;
      newCode: any;
      newMeta: {
        version: string[];
        connect: string[];
      };
      script: Script;
      codeSimilarity: number;
      sites: string[];
      withNewConnect: boolean;
    };

export type TBatchUpdateRecordObject = {
  checktime?: number;
  list?: TBatchUpdateRecord[];
};

export const enum UpdateStatusCode {
  CHECKING_UPDATE = 1,
  CHECKED_BEFORE = 2,
}

export const enum BatchUpdateListActionCode {
  UPDATE = 1,
  IGNORE = 2,
}

export type TBatchUpdateListAction =
  | {
      actionCode: BatchUpdateListActionCode.UPDATE;
      actionPayload: {
        uuid: string;
      }[];
    }
  | {
      actionCode: BatchUpdateListActionCode.IGNORE;
      actionPayload: {
        uuid: string;
        ignoreVersion: string;
      }[];
    };

export type TPopupScript = { tabId: number; uuid: string };

import type { Script, SCRIPT_RUN_STATUS, ScriptLoadInfo } from "@App/app/repo/scripts";
import { type URLRuleEntry } from "@App/pkg/utils/url_matcher";
import { type IGetSender } from "@Packages/message/server";

/** 脚本安装来源 */
export type InstallSource = "user" | "system" | "sync" | "subscribe" | "vscode";

/** 搜索类型 */
export type SearchType = "auto" | "name" | "script_code";

/**
 * 脚本匹配信息。
 * 扩展自 ScriptRunResource。
 */
export interface ScriptMatchInfo extends Script {
  /** 已被自定义覆盖的 UrlPatterns */
  scriptUrlPatterns: URLRuleEntry[];
  /** 脚本原本的 UrlPatterns */
  originalUrlPatterns: URLRuleEntry[];
}

export { ScriptLoadInfo };

/**
 * 用于缓存的脚本匹配信息。
 * 为了优化性能，存储时删除了 code、value 与 resource。
 */
export type TScriptMatchInfoEntry = {
  code: "";
  value: Record<string, never>;
  resource: Record<string, never>;
  sort?: number;
} & Omit<ScriptMatchInfo, "code" | "value" | "resource">;

/** 事件触发请求 */
export interface EmitEventRequest {
  uuid: string;
  event: string;
  eventId: string;
  data?: any;
}

/** GMApi，处理脚本的 GM API 调用请求 */
export type MessageRequest<T = any[]> = {
  uuid: string; // 脚本id
  api: string;
  runFlag: string;
  params: T;
};

export type GMApiRequest<T = any> = MessageRequest<T> & {
  script: Script;
  extraCode?: number; // 用于 confirm 传额外资讯
};

export type NotificationMessageOption = {
  event: "click" | "buttonClick" | "close";
  params: {
    /** 当 event 为 buttonClick 时存在，表示按钮索引 */
    index?: number;
    /** 是否为用户点击触发 */
    byUser?: boolean;
  };
};

export type Api = (request: GMApiRequest, con: IGetSender) => Promise<any>;

/** 脚本菜单选项 */
// GM_registerMenuCommand optionsOrAccessKey
export type ScriptMenuItemOption = {
  id?: number | string; // 用于菜单修改及删除 (GM API)
  accessKey?: string; // 菜单快捷键
  autoClose?: boolean; // 默认为 true，false 时点击后不关闭弹出菜单页面
  nested?: boolean; // SC特有配置，默认为 true，false 的话浏览器右键菜单项目由三级菜单升至二级菜单
  individual?: boolean; // SC特有配置，默认为 false，true 表示当多iframe时，相同的菜单项不自动合并
  /** 可选输入框类型 */
  inputType?: "text" | "number" | "boolean";
  title?: string; // title 只适用于输入框类型
  inputLabel?: string;
  inputDefaultValue?: string | number | boolean;
  inputPlaceholder?: string;
};

/** 脚本菜单选项 */
// Service_Worker 接收到的
export type SWScriptMenuItemOption = {
  accessKey?: string; // 菜单快捷键
  autoClose?: boolean; // 默认为 true，false 时点击后不关闭弹出菜单页面
  nested?: boolean; // SC特有配置，默认为 true，false 的话浏览器右键菜单项目由三级菜单升至二级菜单
  mIndividualKey?: number; // 内部用。用于单独项提供稳定 GroupKey，当多iframe时，相同的菜单项不自动合并
  mSeparator?: boolean; // 内部用。true 为分隔线
  /** 可选输入框类型 */
  inputType?: "text" | "number" | "boolean";
  title?: string; // title 只适用于输入框类型
  inputLabel?: string;
  inputDefaultValue?: string | number | boolean;
  inputPlaceholder?: string;
};

/**
 * 脚本菜单命令的「原始 ID」型别。
 *
 * 来源：
 * - 根据 Tampermonkey (TM) 定义，GM_registerMenuCommand 会回传一个「累计数字 ID」。
 * - 若透过 options.id 传入自订的 ID，则可能是 string 或 number。
 *
 * 使用方式：
 * - 若未指定，内部计数器自动生成数字 ID。
 * - 原始设计：数字 ID → `n{ID}`，字串 ID → `t{ID}`。
 * - 目前实现：统一转成 `t{ID}`。
 *
 * 注意：
 * - ID 仅为注册时的原始识别符，不保证跨 frame 唯一。
 * - 用于内部处理，不直接显示。
 */
export type TScriptMenuItemID = number | string;

/**
 * 用于 menu item 的显示名称。
 * 显示在右键菜单上的「文字名称」。
 * 例如：「开启设定」、「清除快取」。
 */
export type TScriptMenuItemName = string;

/**
 * 菜单命令的「最终唯一键」型别。
 *
 * 来源：
 * - 由 TScriptMenuItemID 转换而来，并加上环境识别符 (contentEnvKey)。
 * - 规则：`{contentEnvKey}.t{ID}`，如 `main.t1`、`sub.t5`。
 *
 * 特点：
 * - 在整个执行环境中必须唯一。
 * - 即使命令名称相同，只要 key 不同，就能区分。
 */
export type TScriptMenuItemKey = string;

/**
 * 单一的选单项目结构。
 * - groupKey：用来把「相同性质」的项目合并（例如 mainframe / subframe 都注册相同命令）。
 * - key：唯一键，对应 GM_registerMenuCommand 信息传递的第一个参数。
 * - name：显示文字。
 * - options：选单的额外设定，例如是否是输入框、是否自动关闭等。
 * - tabId：表示来自哪个分页，-1 表示背景脚本。
 * - frameId / documentId：用于区分 iframe 或特定文件。
 */
export type ScriptMenuItem = {
  groupKey: string;
  key: TScriptMenuItemKey;
  name: TScriptMenuItemName;
  options?: SWScriptMenuItemOption;
  tabId: number; //-1表示后台脚本
  frameId?: number;
  documentId?: string;
};

/**
 * 一组选单项目，对应到一个脚本 (uuid)。
 * - uuid：脚本唯一 ID。
 * - groupKey：分组键，确保 UI 显示时不重复。
 * - menus：此脚本在当前分页的所有选单项目。
 */
export type GroupScriptMenuItem = {
  uuid: string;
  groupKey: string;
  menus: ScriptMenuItem[];
};

/**
 * GM_registerMenuCommand 信息传递的呼叫参数型别：
 * [唯一键, 显示名称, options(不包含 id 属性)]
 *
 * 使用范例：
 * GM_registerMenuCommand信息传递("myKey", "开启设定", { autoClose: true });
 */
export type GMRegisterMenuCommandParam = [TScriptMenuItemKey, TScriptMenuItemName, SWScriptMenuItemOption];

/**
 * GM_unregisterMenuCommand 信息传递的呼叫参数型别：
 * [唯一键]
 *
 * 使用范例：
 * GM_unregisterMenuCommand信息传递("myKey");
 */
export type GMUnRegisterMenuCommandParam = [TScriptMenuItemKey];

/** 脚本菜单的完整信息 */
export type ScriptMenu = {
  uuid: string; // 脚本uuid
  name: string; // 脚本名称
  storageName: string; // 脚本存储名称
  enable: boolean; // 脚本是否启用
  updatetime: number; // 脚本更新时间
  hasUserConfig: boolean; // 是否有用户配置
  // 不需要完整 metadata。目前在 Popup 未使用 metadata。
  // 有需要时请把 metadata 里需要的部份抽出 (例如 @match @include @exclude)，避免 chrome.storage.session 储存量过大
  // metadata: SCMetadata; // 脚本元数据
  runStatus?: SCRIPT_RUN_STATUS; // 脚本运行状态
  runNum: number; // 脚本运行次数
  runNumByIframe: number; // iframe运行次数
  menus: ScriptMenuItem[]; // 脚本菜单
  isEffective: boolean | null; // 是否在当前网址启动
};

/** 批量更新记录 */
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

/** 批量更新记录对象 */
export type TBatchUpdateRecordObject = {
  checktime?: number;
  list?: TBatchUpdateRecord[];
};

/** 更新状态码 */
export const enum UpdateStatusCode {
  CHECKING_UPDATE = 1,
  CHECKED_BEFORE = 2,
}

/** 批量更新动作码 */
export const enum BatchUpdateListActionCode {
  UPDATE = 1,
  IGNORE = 2,
}

/** 批量更新动作 */
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

export type TPopupScript = { tabId: number; uuids: string[] };

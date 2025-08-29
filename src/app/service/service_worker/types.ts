import type { Script, ScriptRunResource, SCRIPT_RUN_STATUS, SCMetadata, UserConfig } from "@App/app/repo/scripts";
import { type URLRuleEntry } from "@App/pkg/utils/url_matcher";
import { type GetSender } from "@Packages/message/server";

export type InstallSource = "user" | "system" | "sync" | "subscribe" | "vscode";

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

export type Api = (request: Request, con: GetSender) => Promise<any>;

// popup

export type ScriptMenuItem = {
  id: number;
  name: string;
  options?: {
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
  tabId: number; //-1表示后台脚本
  frameId?: number;
  documentId?: string;
};

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
  isEffective: boolean | null; // 是否在当前网址啟动
};

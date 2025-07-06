import {
  ScriptRunResouce,
} from "@App/app/repo/scripts";

// 为了优化性能，存储到缓存时删除了code、value与resource
export interface ScriptMatchInfo extends ScriptRunResouce {
  matches: string[];
  excludeMatches: string[];
  customizeExcludeMatches: string[];
}

export interface ScriptLoadInfo extends ScriptMatchInfo {
  metadataStr: string; // 脚本元数据字符串
  userConfigStr: string; // 用户配置字符串
}

export interface EmitEventRequest {
  uuid: string;
  event: string;
  eventId: string;
  data?: any;
}

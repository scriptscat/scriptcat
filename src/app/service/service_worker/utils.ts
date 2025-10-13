export const BrowserNoSupport = new Error("browserNoSupport");
import type { SCMetadata, Script, ScriptRunResource } from "@App/app/repo/scripts";
import { getMetadataStr, getUserConfigStr } from "@App/pkg/utils/utils";
import type { ScriptLoadInfo, ScriptMatchInfo } from "./types";
import {
  compileInjectScript,
  compilePreInjectScript,
  getScriptFlag,
  isEarlyStartScript,
  isInjectIntoContent,
} from "../content/utils";
import {
  extractUrlPatterns,
  getApiMatchesAndGlobs,
  RuleType,
  toUniquePatternStrings,
  type URLRuleEntry,
} from "@App/pkg/utils/url_matcher";

export function getRunAt(runAts: string[]): chrome.extensionTypes.RunAt {
  // 没有 run-at 时为 undefined. Fallback 至 document_idle
  const runAt = runAts[0] as string | undefined;
  if (runAt === "document-start") {
    return "document_start";
  } else if (runAt === "document-end") {
    return "document_end";
  }
  return "document_idle";
}

// 检查是不是base64编码
export function isBase64(str: string): boolean {
  if (typeof str !== "string" || str.length === 0) {
    return false;
  }

  // Base64字符串长度必须是4的倍数。不会出现没有填充的情况（Base64定义）
  const lengthMod4 = str.length % 4;
  if (lengthMod4 !== 0) {
    // 长度除以4余数为非0的字符串不可能是有效的Base64
    return false;
  }

  // Base64字符串必须只包含有效的Base64字符
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!base64Regex.test(str)) {
    return false;
  }

  // 避免将纯十六进制字符串误判为Base64
  for (let i = 0, l = str.length; i < l; i++) {
    const c = str.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      // 0-9
    } else if (c >= 97 && c <= 102) {
      // a-f
    } else if (c >= 65 && c <= 70) {
      // A-F
    } else {
      // 包括非0-9a-fA-F时接受为 Base64
      return true;
    }
  }
  // 纯十六进制字符串
  return false;
}

// 解析URL SRI
export function parseUrlSRI(url: string): {
  url: string;
  hash?: { [key: string]: string };
} {
  const urls = url.split("#");
  if (urls.length < 2) {
    return { url: urls[0], hash: undefined };
  }
  const hashs = urls[1].split(/[,;]/);
  const hash: { [key: string]: string } = {};
  for (const val of hashs) {
    // 接受以下格式
    // sha256-abc123== 格式
    // sha256=abc123== 格式
    const match = val.match(/^([a-zA-Z0-9]+)[-=](.+)$/);
    if (match) {
      const [, key, value] = match;
      hash[key] = value;
    }
  }

  // 即使没有解析到任何哈希值，也只会返回空对象而不是 undefined
  return { url: urls[0], hash };
}

export type TMsgResponse<T> =
  | {
      ok: true;
      res: T;
    }
  | {
      ok: false;
      err: {
        name?: string;
        message?: string;
        errType?: number;
        [key: string]: any;
      };
    };

export function msgResponse<T>(errType: number, t: Error | any, params?: T): TMsgResponse<T> {
  if (!errType) return { ok: true, res: t };
  const { name, message } = t;
  return { ok: false, err: { name, message, errType, ...t, ...params } };
}

export async function notificationsUpdate(
  notificationId: string,
  options: chrome.notifications.NotificationOptions
): Promise<
  | {
      ok: true;
      res: boolean | null;
    }
  | ({
      ok: false;
    } & {
      browserNoSupport?: true;
      apiError?: Error;
    })
> {
  // No Support in Firefox
  if (typeof chrome.notifications?.update !== "function") {
    return { ok: false, apiError: BrowserNoSupport };
  }
  try {
    // chrome > 116 return Promise<boolean>
    const wasUpdated: any = await chrome.notifications.update(notificationId, options);
    return { ok: true, res: typeof wasUpdated === "boolean" ? wasUpdated : null };
  } catch (e: any) {
    return { ok: false, apiError: e as Error };
  }
}

export function getCombinedMeta(metaBase: SCMetadata, metaCustom: SCMetadata): SCMetadata {
  const metaRet = { ...metaBase };
  if (!metaCustom) {
    return metaRet;
  }
  for (const key of Object.keys(metaCustom)) {
    const v = metaCustom[key];
    metaRet[key] = v ? [...v] : undefined;
  }
  return metaRet;
}

export function selfMetadataUpdate(script: Script, key: string, valueSet: Set<string>) {
  // 更新 selfMetadata 时建立浅拷贝
  const selfMetadata = { ...(script.selfMetadata || {}) };
  script = { ...script, selfMetadata };
  const value = [...valueSet].filter((item) => typeof item === "string");
  if (value.length > 0) {
    selfMetadata[key] = value;
  } else {
    delete selfMetadata[key];
    if (Object.keys(selfMetadata).length === 0) {
      script.selfMetadata = undefined; // delete script.selfMetadata;
    }
  }
  return script;
}

export function parseScriptLoadInfo(script: ScriptRunResource): ScriptLoadInfo {
  const metadataStr = getMetadataStr(script.code) || "";
  const userConfigStr = getUserConfigStr(script.code) || "";
  return {
    ...script,
    metadataStr,
    userConfigStr,
  };
}

export function compileInjectionCode(scriptRes: ScriptRunResource, scriptCode: string) {
  const preDocumentStartScript = isEarlyStartScript(scriptRes.metadata);
  let scriptInjectCode;
  if (preDocumentStartScript) {
    scriptInjectCode = compilePreInjectScript(parseScriptLoadInfo(scriptRes), scriptCode, true);
  } else {
    scriptInjectCode = compileInjectScript(scriptRes, scriptCode, true);
  }
  return scriptInjectCode;
}

// 构建userScript注册信息（忽略代碼部份）
export function getUserScriptRegister(scriptMatchInfo: ScriptMatchInfo) {
  const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptMatchInfo.scriptUrlPatterns);

  const excludeMatches = toUniquePatternStrings(
    scriptMatchInfo.scriptUrlPatterns.filter((e) => e.ruleType === RuleType.MATCH_EXCLUDE)
  );
  const excludeGlobs = toUniquePatternStrings(
    scriptMatchInfo.scriptUrlPatterns.filter((e) => e.ruleType === RuleType.GLOB_EXCLUDE)
  );

  const registerScript: chrome.userScripts.RegisteredUserScript = {
    id: scriptMatchInfo.uuid,
    js: [{ code: "" }],
    matches: matches, // primary
    includeGlobs: includeGlobs, // includeGlobs applied after matches
    excludeMatches: excludeMatches,
    excludeGlobs: excludeGlobs,
    allFrames: !scriptMatchInfo.metadata["noframes"],
    world: "MAIN",
  };

  if (isInjectIntoContent(scriptMatchInfo.metadata)) {
    // 需要注入到content script的脚本
    registerScript.world = "USER_SCRIPT";
  }

  if (scriptMatchInfo.metadata["run-at"]) {
    registerScript.runAt = getRunAt(scriptMatchInfo.metadata["run-at"]);
  }

  return {
    registerScript,
  };
}

export function buildScriptRunResourceBasic(script: Script): ScriptRunResource {
  const ret: ScriptRunResource = { ...script } as ScriptRunResource;
  // 自定义配置
  const { match, include, exclude } = ret.metadata;
  ret.originalMetadata = { match, include, exclude }; // 目前只需要 match, include, exclude
  if (ret.selfMetadata) {
    ret.metadata = getCombinedMeta(ret.metadata, ret.selfMetadata);
  }
  ret.flag = getScriptFlag(script.uuid);
  // 只用来生成 matchInfo 的话不需要 value, resource, code
  ret.value = {};
  ret.resource = {};
  ret.code = "";
  return ret;
}

export function scriptURLPatternResults(scriptRes: {
  metadata: SCMetadata;
  originalMetadata: SCMetadata;
  selfMetadata?: SCMetadata;
}): {
  scriptUrlPatterns: URLRuleEntry[];
  originalUrlPatterns: URLRuleEntry[];
} | null {
  const { metadata, originalMetadata } = scriptRes;
  const metaMatch = metadata.match;
  const metaInclude = metadata.include;
  const metaExclude = metadata.exclude;
  if ((metaMatch?.length ?? 0) + (metaInclude?.length ?? 0) === 0) {
    return null;
  }

  // 黑名单排除 統一在腳本注冊時添加
  const scriptUrlPatterns = extractUrlPatterns([
    ...(metaMatch || []).map((e) => `@match ${e}`),
    ...(metaInclude || []).map((e) => `@include ${e}`),
    ...(metaExclude || []).map((e) => `@exclude ${e}`),
  ]);

  // 如果使用了自定义排除，无法在脚本原有的网域看到匹配情况
  // 所有统一把原本的pattern都解析一下

  const selfMetadata = scriptRes.selfMetadata;
  const originalUrlPatterns: URLRuleEntry[] | null =
    selfMetadata?.match || selfMetadata?.include || selfMetadata?.exclude
      ? extractUrlPatterns([
          ...(originalMetadata.match || []).map((e) => `@match ${e}`),
          ...(originalMetadata.include || []).map((e) => `@include ${e}`),
          ...(originalMetadata.exclude || []).map((e) => `@exclude ${e}`),
        ])
      : scriptUrlPatterns;

  return { scriptUrlPatterns, originalUrlPatterns };
}

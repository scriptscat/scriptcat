import type { SCMetadata, Script } from "@App/app/repo/scripts";

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

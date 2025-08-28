import type { SCMetadata, Script } from "@App/app/repo/scripts";

export function getRunAt(runAts: string[]): chrome.extensionTypes.RunAt {
  if (runAts.length === 0) {
    return "document_idle";
  }
  const runAt = runAts[0];
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

  // Base64字符串必须只包含有效的Base64字符
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(str)) {
    return false;
  }

  // Base64字符串长度必须是4的倍数（如果有填充），或者没有填充的情况下可以是其他长度
  // 但要确保它不是纯数字或纯字母（避免误判十六进制字符串）
  const lengthMod4 = str.length % 4;
  if (lengthMod4 === 1) {
    // 长度除以4余数为1的字符串不可能是有效的Base64
    return false;
  }

  // 检查是否包含Base64特有的字符（+ 或 /），或者有正确的填充
  // 这样可以避免将纯十六进制字符串误判为Base64
  if (str.includes("+") || str.includes("/") || str.endsWith("=")) {
    return true;
  }

  // 如果没有特殊字符，检查是否可能是有效的Base64（但要排除明显的十六进制）
  // 十六进制字符串只包含0-9和a-f（或A-F），而Base64还包含其他字母
  const hexOnlyRegex = /^[0-9a-fA-F]+$/;
  if (hexOnlyRegex.test(str)) {
    // 这很可能是十六进制字符串，不是Base64
    return false;
  }

  return true;
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
  hashs.forEach((val) => {
    // 首先检查是否是 sha256-abc123== 格式
    const dashMatch = val.match(/^([a-zA-Z0-9]+)-(.+)$/);
    if (dashMatch) {
      const [, key, value] = dashMatch;
      hash[key] = value;
      return;
    }

    // 然后检查是否是 sha256=abc123== 格式
    const equalIndex = val.indexOf("=");
    if (equalIndex !== -1) {
      const key = val.substring(0, equalIndex);
      const value = val.substring(equalIndex + 1);
      if (key) {
        // 确保 key 不为空
        hash[key] = value;
      }
      return;
    }
  });

  // 如果没有解析到任何哈希值，返回空对象而不是 undefined
  if (Object.keys(hash).length === 0) {
    return { url: urls[0], hash: {} };
  }

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

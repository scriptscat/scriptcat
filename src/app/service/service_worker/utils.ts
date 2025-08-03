export function isExtensionRequest(
  details: chrome.webRequest.OnBeforeRequestDetails & { originUrl?: string }
): boolean {
  return !!(
    (details.initiator && chrome.runtime.getURL("").startsWith(details.initiator)) ||
    (details.originUrl && details.originUrl.startsWith(chrome.runtime.getURL("")))
  );
}

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

export function mapToObject(map: Map<string, any>): { [key: string]: any } {
  const obj: { [key: string]: any } = {};
  map.forEach((value, key) => {
    if (value instanceof Map) {
      obj[key] = mapToObject(value);
    } else if (obj[key] instanceof Array) {
      obj[key].push(value);
    } else {
      obj[key] = value;
    }
  });
  return obj;
}

export function objectToMap(obj: { [key: string]: any }): Map<string, any> {
  const map = new Map<string, any>();
  Object.keys(obj).forEach((key) => {
    if (obj[key] instanceof Map) {
      map.set(key, objectToMap(obj[key]));
    } else if (obj[key] instanceof Array) {
      map.set(key, obj[key]);
    } else {
      map.set(key, obj[key]);
    }
  });
  return map;
}

export function arrayToObject(arr: Array<any>): any[] {
  const obj: any[] = [];
  arr.forEach((item) => {
    if (item instanceof Map) {
      obj.push(mapToObject(item));
    } else if (item instanceof Array) {
      obj.push(arrayToObject(item));
    } else {
      obj.push(item);
    }
  });
  return obj;
}

// 检查是不是base64编码
export function isBase64(str: string): boolean {
  if (typeof str !== "string") {
    return false;
  }
  // 检查字符串是否符合base64的格式
  return /^[A-Za-z0-9+/]+={0,2}$/.test(str) && (str.length % 4 === 0 || str.length % 4 === 2);
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

export function isExtensionRequest(details: chrome.webRequest.ResourceRequest & { originUrl?: string }): boolean {
  return !!(
    (details.initiator && chrome.runtime.getURL("").startsWith(details.initiator)) ||
    (details.originUrl && details.originUrl.startsWith(chrome.runtime.getURL("")))
  );
}

export function getRunAt(runAts: string[]): chrome.userScripts.RunAt {
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

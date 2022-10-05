import { v5 as uuidv5 } from "uuid";
import { Metadata, Script, UserConfig } from "@App/app/repo/scripts";
import YAML from "yaml";
import { Subscribe } from "@App/app/repo/subscribe";
import Logger from "@App/app/logger/logger";
import LoggerCore from "@App/app/logger/core";

export function parseMetadata(code: string): Metadata | null {
  let issub = false;
  let regex = /\/\/\s*==UserScript==([\s\S]+?)\/\/\s*==\/UserScript==/m;
  let header = regex.exec(code);
  if (!header) {
    regex = /\/\/\s*==UserSubscribe==([\s\S]+?)\/\/\s*==\/UserSubscribe==/m;
    header = regex.exec(code);
    if (!header) {
      return null;
    }
    issub = true;
  }
  regex = /\/\/\s*@([\S]+)((.+?)$|$)/gm;
  const ret: Metadata = {};
  let meta: RegExpExecArray | null = regex.exec(header[1]);
  while (meta !== null) {
    const [key, val] = [meta[1].toLowerCase().trim(), meta[2].trim()];
    let values = ret[key];
    if (values == null) {
      values = [];
    }
    values.push(val);
    ret[key] = values;
    meta = regex.exec(header[1]);
  }
  if (ret.name === undefined) {
    return null;
  }
  if (issub) {
    ret.usersubscribe = [];
  }
  return ret;
}

export function parseUserConfig(code: string): UserConfig | undefined {
  const regex = /\/\*\s*==UserConfig==([\s\S]+?)\s*==\/UserConfig==\s*\*\//m;
  const config = regex.exec(code);
  if (!config) {
    return undefined;
  }
  const configs = config[1].trim().split(/[-]{3,}/);
  const ret: UserConfig = {};
  configs.forEach((val) => {
    const obj: UserConfig = YAML.parse(val);
    Object.keys(obj).forEach((key) => {
      ret[key] = obj[key];
    });
  });
  return ret;
}

export type ScriptInfo = {
  url: string;
  code: string;
  uuid: string;
  issub: boolean;
  source: "user" | "system";
};

export async function fetchScriptInfo(
  url: string,
  source: "user" | "system"
): Promise<ScriptInfo> {
  const resp = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
    },
  });
  if (resp.status !== 200) {
    throw new Error("fetch script info failed");
  }
  const body = await resp.text();
  const ok = parseMetadata(body);
  if (!ok) {
    throw new Error("parse script info failed");
  }
  const uuid = uuidv5(url, uuidv5.URL);
  const ret: ScriptInfo = {
    url,
    code: body,
    uuid,
    issub: false,
    source,
  };
  if (ok.usersubscribe) {
    ret.issub = true;
  }
  return ret;
}

export function copyScript(script: Script, old: Script): Script {
  const ret = script;
  ret.id = old.id;
  ret.uuid = old.uuid;
  ret.createtime = old.createtime;
  ret.checktime = old.checktime;
  ret.lastruntime = old.lastruntime;
  // ret.delayruntime = old.delayruntime;
  ret.error = old.error;
  ret.sort = old.sort;
  if (!ret.selfMetadata) {
    ret.selfMetadata = old.selfMetadata || {};
  }
  ret.subscribeUrl = old.subscribeUrl;
  ret.status = old.status;
  return ret;
}

export function copySubscribe(sub: Subscribe, old: Subscribe): Subscribe {
  const ret = sub;
  ret.id = old.id;
  ret.createtime = old.createtime;
  ret.status = old.status;
  ret.checktime = old.checktime;
  ret.error = old.error;
  return ret;
}

export function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(<string | null>reader.result);
    reader.readAsDataURL(blob);
  });
}

export function blobToText(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(<string | null>reader.result);
    reader.readAsText(blob);
  });
}

export function base64ToBlob(dataURI: string) {
  const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
  const byteString = atob(dataURI.split(",")[1]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const intArray = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i += 1) {
    intArray[i] = byteString.charCodeAt(i);
  }
  return new Blob([intArray], { type: mimeString });
}

export function base64ToStr(base64: string): string {
  try {
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => {
          return `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`;
        })
        .join("")
    );
  } catch (e) {
    LoggerCore.getInstance()
      .logger({ utils: "base64ToStr" })
      .debug("base64 to string failed", Logger.E(e));
  }
  return "";
}

export function strToBase64(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1: string) => {
      return String.fromCharCode(parseInt(`0x${p1}`, 16));
    })
  );
}

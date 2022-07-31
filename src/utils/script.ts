import { v5 as uuidv5 } from "uuid";
import { Metadata, UserConfig } from "@App/app/repo/scripts";
import YAML from "yaml";

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

export function validMetadata(metadata: Metadata | null): Metadata | null {
  if (metadata == null) {
    return null;
  }

  return metadata;
}

export type ScriptInfo = {
  url: string;
  code: string;
  uuid: string;
  issub: boolean;
};

export async function fetchScriptInfo(url: string): Promise<ScriptInfo> {
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
  };
  if (ok.usersubscribe) {
    ret.issub = true;
  }
  return ret;
}

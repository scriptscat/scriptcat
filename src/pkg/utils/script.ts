import { v4 as uuidv4 } from "uuid";
import type { Metadata, Script, ScriptCode, UserConfig } from "@App/app/repo/scripts";
import {
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
  ScriptCodeDAO,
  ScriptDAO,
} from "@App/app/repo/scripts";
import type { Subscribe, Metadata as SubMetadata } from "@App/app/repo/subscribe";
import { SUBSCRIBE_STATUS_ENABLE, SubscribeDAO } from "@App/app/repo/subscribe";
import { nextTime } from "./cron";
import type { InstallSource } from "@App/app/service/service_worker/types";
import { parseUserConfig } from "./yaml";

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
  if (Object.keys(ret).length < 3) {
    return null;
  }
  if (!ret.namespace) {
    ret.namespace = [""];
  }
  if (issub) {
    ret.usersubscribe = [];
  }
  return ret;
}

export type ScriptInfo = {
  url: string;
  code: string;
  uuid: string;
  userSubscribe: boolean;
  metadata: Metadata;
  source: InstallSource;
};

export async function fetchScriptInfo(url: string, source: InstallSource, uuid: string): Promise<ScriptInfo> {
  const resp = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
    },
  });
  if (resp.status !== 200) {
    throw new Error("fetch script info failed");
  }
  if (resp.headers.get("content-type")?.includes("text/html")) {
    throw new Error("url is html");
  }

  const body = await resp.text();
  return scriptInfoByCode(body, url, source, uuid);
}

// 通过脚本代码处理成脚本info
export function scriptInfoByCode(code: string, url: string, source: InstallSource, uuid: string): ScriptInfo {
  const parse = parseMetadata(code);
  if (!parse) {
    throw new Error("parse script info failed");
  }
  const ret: ScriptInfo = {
    url,
    code,
    source,
    uuid,
    userSubscribe: parse.usersubscribe !== undefined,
    metadata: parse,
  };
  return ret;
}

export function copyScript(script: Script, old: Script): Script {
  const ret = script;
  ret.uuid = old.uuid;
  ret.createtime = old.createtime;
  ret.lastruntime = old.lastruntime;
  // ret.delayruntime = old.delayruntime;
  ret.error = old.error;
  ret.sort = old.sort;
  ret.selfMetadata = old.selfMetadata || {};
  ret.subscribeUrl = old.subscribeUrl;
  ret.checkUpdate = old.checkUpdate;
  ret.status = old.status;
  return ret;
}

export function copySubscribe(sub: Subscribe, old: Subscribe): Subscribe {
  const ret = sub;
  ret.url = old.url;
  ret.scripts = old.scripts;
  ret.createtime = old.createtime;
  ret.status = old.status;
  return ret;
}

// 通过代码解析出脚本信息
export async function prepareScriptByCode(
  code: string,
  origin: string,
  uuid?: string,
  override: boolean = false,
  dao: ScriptDAO = new ScriptDAO()
): Promise<{ script: Script; oldScript?: Script; oldScriptCode?: string }> {
  const metadata: Metadata | null = parseMetadata(code);
  const config: UserConfig | undefined = parseUserConfig(code);
  if (metadata == null) {
    throw new Error("MetaData信息错误");
  }
  if (metadata.name === undefined) {
    throw new Error("脚本名不能为空");
  }
  if (metadata.version === undefined) {
    throw new Error("脚本@version版本不能为空");
  }
  if (metadata.namespace === undefined) {
    throw new Error("脚本@namespace命名空间不能为空");
  }
  let type = SCRIPT_TYPE_NORMAL;
  if (metadata.crontab !== undefined) {
    type = SCRIPT_TYPE_CRONTAB;
    try {
      nextTime(metadata.crontab[0]);
    } catch {
      throw new Error(`错误的定时表达式,请检查: ${metadata.crontab[0]}`);
    }
  } else if (metadata.background !== undefined) {
    type = SCRIPT_TYPE_BACKGROUND;
  }
  let urlSplit: string[];
  let domain = "";
  let checkUpdateUrl = "";
  let downloadUrl = origin;
  if (metadata.updateurl && metadata.downloadurl) {
    [checkUpdateUrl] = metadata.updateurl;
    [downloadUrl] = metadata.downloadurl;
  } else {
    checkUpdateUrl = origin.replace("user.js", "meta.js");
  }
  if (origin.includes("/")) {
    urlSplit = origin.split("/");
    if (urlSplit[2]) {
      [, domain] = urlSplit;
    }
  }
  let newUUID = "";
  if (uuid) {
    newUUID = uuid;
  } else {
    newUUID = uuidv4();
  }

  let script: Script = {
    uuid: newUUID,
    name: metadata.name[0],
    author: metadata.author && metadata.author[0],
    namespace: metadata.namespace && metadata.namespace[0],
    originDomain: domain,
    origin,
    checkUpdate: true,
    checkUpdateUrl,
    downloadUrl,
    config,
    metadata,
    selfMetadata: {},
    sort: -1,
    type,
    status: SCRIPT_STATUS_DISABLE,
    runStatus: SCRIPT_RUN_STATUS_COMPLETE,
    createtime: Date.now(),
    updatetime: Date.now(),
    checktime: Date.now(),
  };
  let old: Script | undefined;
  let oldCode: ScriptCode | undefined;
  if (uuid) {
    old = await dao.get(uuid);
    if (!old && override) {
      old = await dao.findByNameAndNamespace(script.name, script.namespace);
    }
  } else {
    old = await dao.findByNameAndNamespace(script.name, script.namespace);
  }
  if (old) {
    if (
      (old.type === SCRIPT_TYPE_NORMAL && script.type !== SCRIPT_TYPE_NORMAL) ||
      (script.type === SCRIPT_TYPE_NORMAL && old.type !== SCRIPT_TYPE_NORMAL)
    ) {
      throw new Error("脚本类型不匹配,普通脚本与后台脚本不能互相转变");
    }
    const scriptCode = await new ScriptCodeDAO().get(old.uuid);
    if (!scriptCode) {
      throw new Error("旧的脚本代码不存在");
    }
    oldCode = scriptCode;
    script = copyScript(script, old);
  } else {
    // 前台脚本默认开启
    if (script.type === SCRIPT_TYPE_NORMAL) {
      script.status = SCRIPT_STATUS_ENABLE;
    }
    script.checktime = new Date().getTime();
  }
  return { script, oldScript: old, oldScriptCode: oldCode?.code };
}

export async function prepareSubscribeByCode(
  code: string,
  url: string
): Promise<{ subscribe: Subscribe; oldSubscribe?: Subscribe }> {
  const dao = new SubscribeDAO();
  const metadata = parseMetadata(code) as SubMetadata;
  if (!metadata) {
    throw new Error("MetaData信息错误");
  }
  if (metadata.name === undefined) {
    throw new Error("订阅名不能为空");
  }
  let subscribe: Subscribe = {
    url,
    name: metadata.name[0],
    code,
    author: (metadata.author && metadata.author[0]) || "",
    scripts: {},
    metadata: metadata,
    status: SUBSCRIBE_STATUS_ENABLE,
    createtime: Date.now(),
    updatetime: Date.now(),
    checktime: Date.now(),
  };
  const old = await dao.findByUrl(url);
  if (old) {
    subscribe = copySubscribe(subscribe, old);
  }
  return { subscribe, oldSubscribe: old };
}

import { v4 as uuidv4 } from "uuid";
import {
  SCMetadata,
  Script,
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
  ScriptDAO
} from "@App/app/repo/scripts";
import {
  Subscribe,
  SUBSCRIBE_STATUS_ENABLE,
  SubscribeDAO,
} from "@App/app/repo/subscribe";
import { type InstallSource } from "@App/app/service/script/manager";
import { nextTime } from "./cron";
import { parseUserConfig } from "./yaml";

// 从脚本代码抽出Metadata
export function parseMetadata(code: string): SCMetadata | null {
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
  const ret = {} as SCMetadata;
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
  isSubscribe: boolean;
  isUpdate: boolean;
  metadata: SCMetadata;
  source: InstallSource;
};

// 从网址取得脚本代码
export async function fetchScriptBody(url: string): Promise<string> {
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
  return body;
}

export async function fetchScriptInfo(
  url: string,
  source: InstallSource,
  isUpdate: boolean,
  uuid: string
): Promise<ScriptInfo> {

  const body = await fetchScriptBody(url);
  const ok = parseMetadata(body);
  if (!ok) {
    throw new Error("parse script info failed");
  }
  const ret: ScriptInfo = {
    url,
    code: body,
    uuid,
    isSubscribe: false,
    isUpdate,
    metadata: ok,
    source,
  };
  if (ok.usersubscribe) {
    ret.isSubscribe = true;
  }
  return ret;
}

// 通过代码解析出脚本信息 (Script)
export async function prepareScriptByCode(
  code: string,
  url: string,
  uuid?: string,
  override?: boolean
): Promise<{ script: Script; oldScript?: Script }> {
  const dao = new ScriptDAO();
  const metadata = parseMetadata(code);
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
    } catch (e) {
      throw new Error(`错误的定时表达式,请检查: ${metadata.crontab[0]}`);
    }
  } else if (metadata.background !== undefined) {
    type = SCRIPT_TYPE_BACKGROUND;
  }
  let urlSplit: string[];
  let domain = "";
  let checkUpdateUrl = "";
  let downloadUrl = url;
  if (metadata.updateurl && metadata.downloadurl) {
    [checkUpdateUrl] = metadata.updateurl;
    [downloadUrl] = metadata.downloadurl;
  } else {
    checkUpdateUrl = url.replace("user.js", "meta.js");
  }
  if (url.includes("/")) {
    urlSplit = url.split("/");
    if (urlSplit[2]) {
      [, domain] = urlSplit;
    }
  }
  const newUUID = uuid || uuidv4();
  const config: UserConfig | undefined = parseUserConfig(code);
  let script: Script = {
    id: 0,
    uuid: newUUID,
    name: metadata.name[0],
    code,
    author: metadata.author && metadata.author[0],
    namespace: metadata.namespace && metadata.namespace[0],
    originDomain: domain,
    origin: url,
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
  if (uuid) {
    old = await dao.findByUUID(uuid);
  }
  if (!old && (!uuid || override)) {
    old = await dao.findByNameAndNamespace(script.name, script.namespace);
  }
  if (old) {
    if (
      (old.type === SCRIPT_TYPE_NORMAL &&
        script.type !== SCRIPT_TYPE_NORMAL) ||
      (script.type === SCRIPT_TYPE_NORMAL &&
        old.type !== SCRIPT_TYPE_NORMAL)
    ) {
      throw new Error("脚本类型不匹配,普通脚本与后台脚本不能互相转变");
    }
    const { id, uuid, createtime, lastruntime, error, sort, selfMetadata, subscribeUrl, status } = old;
    Object.assign(script, {
      id,
      uuid,
      createtime,
      lastruntime,
      error,
      sort,
      selfMetadata: selfMetadata || {},
      subscribeUrl,
      status
    });
  } else {
    // 前台脚本默认开启
    if (script.type === SCRIPT_TYPE_NORMAL) {
      script.status = SCRIPT_STATUS_ENABLE;
    }
    script.checktime = Date.now();
  }
  return { script, oldScript: old };

}

// 通过代码解析出脚本信息 (Subscribe)
export async function prepareSubscribeByCode(
  code: string,
  url: string
): Promise<{ subscribe: Subscribe; oldSubscribe?: Subscribe }> {
  const dao = new SubscribeDAO();
  const metadata = parseMetadata(code);
  if (!metadata) {
    throw new Error("MetaData信息错误");
  }
  if (metadata.name === undefined) {
    throw new Error("订阅名不能为空");
  }
  const subscribe: Subscribe = {
    id: 0,
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
    const { id, scripts, createtime, status } = old;
    Object.assign(subscribe, { id, scripts, createtime, status });
  }
  return { subscribe, oldSubscribe: old };
}

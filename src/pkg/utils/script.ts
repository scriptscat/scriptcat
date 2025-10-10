import { v4 as uuidv4 } from "uuid";
import type { SCMetadata, Script, ScriptCode, UserConfig } from "@App/app/repo/scripts";
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
import type { Subscribe } from "@App/app/repo/subscribe";
import { SUBSCRIBE_STATUS_ENABLE, SubscribeDAO } from "@App/app/repo/subscribe";
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

// 通过代码解析出脚本信息 (Script)
export async function prepareScriptByCode(
  code: string,
  origin: string,
  uuid?: string,
  override: boolean = false,
  dao?: ScriptDAO
): Promise<{ script: Script; oldScript?: Script; oldScriptCode?: string }> {
  dao = dao ?? new ScriptDAO();
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
      domain = urlSplit[2];
    }
  }
  const newUUID = uuid || uuidv4();
  const config: UserConfig | undefined = parseUserConfig(code);
  const now = Date.now();
  const script: Script = {
    uuid: newUUID,
    name: metadata.name[0],
    author: metadata.author && metadata.author[0],
    namespace: metadata.namespace[0], // 上面的代码已检查 meta.namespace, 不会为undefined
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
    createtime: now,
    updatetime: now,
    checktime: now,
  };
  let old: Script | undefined;
  let oldCode: ScriptCode | undefined;
  if (uuid) {
    old = await dao.get(uuid);
  }
  if (!old && (!uuid || override)) {
    old = await dao.findByNameAndNamespace(script.name, script.namespace);
  }
  const checkUrl = script.checkUpdateUrl || script.downloadUrl;
  if (!old && checkUrl && script.name && script.namespace) {
    // GreasyFork的脚本会自动添加 @updateURL 和 @downloadURL
    // 即使脚本更新时改变了名字和namespace, 网址还是指向同一个脚本
    old = await findByUpdateURL(dao, script.name, script.namespace, checkUrl);
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
    const { uuid, createtime, lastruntime, error, sort, selfMetadata, subscribeUrl, checkUpdate, status } = old;
    Object.assign(script, {
      uuid,
      createtime,
      lastruntime,
      error,
      sort,
      selfMetadata: selfMetadata || {},
      subscribeUrl,
      checkUpdate,
      status,
    });
  } else {
    // 前台脚本默认开启
    if (script.type === SCRIPT_TYPE_NORMAL) {
      script.status = SCRIPT_STATUS_ENABLE;
    }
    script.checktime = now;
  }
  return { script, oldScript: old, oldScriptCode: oldCode?.code };
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
  const now = Date.now();
  const subscribe: Subscribe = {
    url,
    name: metadata.name[0],
    code,
    author: (metadata.author && metadata.author[0]) || "",
    scripts: {},
    metadata: metadata,
    status: SUBSCRIBE_STATUS_ENABLE,
    createtime: now,
    updatetime: now,
    checktime: now,
  };
  const old = await dao.findByUrl(url);
  if (old) {
    const { url, scripts, createtime, status } = old;
    Object.assign(subscribe, { url, scripts, createtime, status });
  }
  return { subscribe, oldSubscribe: old };
}

const findByUpdateURL = async (dao: ScriptDAO, name: string, namespace: string, checkUrl: string) => {
  const search = checkUrl.split("/");
  let count = 0;
  let ret_: Script | null = null;
  await dao.findOne((key, value) => {
    const currentCheckUrl = value.checkUpdateUrl || value.downloadUrl;
    const current = currentCheckUrl?.split("/");
    if (!current) return false;
    let c = 0;
    // 根据 checkUpdateUrl 网址对比找出最有可能的脚本
    // GreasyFork 的话，脚本名字改变了后，path也会改变，但ID不变
    for (let l = Math.min(search.length, current.length); c < l; c++) {
      if (current[c] !== search[c]) break;
    }
    if (c > count) {
      count = c;
      ret_ = value;
    }
    return false;
  });
  const ret = ret_ as Script | null;
  const retCheckUrl = ret?.checkUpdateUrl || ret?.downloadUrl;
  if (!retCheckUrl) return undefined;
  // 尝试下载该脚本的url, 检查是否指向要求脚本
  let metadata;
  try {
    const code = await fetchScriptBody(retCheckUrl);
    metadata = code ? parseMetadata(code) : null;
  } catch {
    return undefined;
  }
  if (metadata && metadata.name![0] === name && (metadata.namespace?.[0] || "") === namespace) {
    return ret;
  }
  return undefined;
};

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
  ScriptDAO,
  type UserConfig,
} from "@App/app/repo/scripts";
import {
  Subscribe,
  SUBSCRIBE_STATUS_ENABLE,
  SubscribeDAO,
} from "@App/app/repo/subscribe";
import { type InstallSource } from "@App/app/service/script/manager";
import { nextTime } from "./cron";
import { parseUserConfig } from "./yaml";
// eslint-disable-next-line camelcase
import { t as i18n_t } from "@App/locales/locales";

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
  override?: boolean,
  dao?: ScriptDAO,
  options?: {
    byEditor?: boolean; // 是否通过编辑器导入
  }
): Promise<{ script: Script; oldScript?: Script }> {
  dao = dao ?? new ScriptDAO();
  const metadata = parseMetadata(code);
  if (!metadata) {
    throw new Error(i18n_t("error_metadata_invalid"));
  }
  if (metadata.name === undefined) {
    throw new Error(i18n_t("error_script_name_required"));
  }
  if (metadata.version === undefined) {
    throw new Error(i18n_t("error_script_version_required"));
  }
  if (metadata.namespace === undefined) {
    throw new Error(i18n_t("error_script_namespace_required"));
  }
  let type = SCRIPT_TYPE_NORMAL;
  if (metadata.crontab !== undefined) {
    type = SCRIPT_TYPE_CRONTAB;
    try {
      nextTime(metadata.crontab[0]);
    } catch (e) {
      throw new Error(i18n_t("error_cron_invalid", { expr: metadata.crontab[0] }));
    }
  } else if (metadata.background !== undefined) {
    type = SCRIPT_TYPE_BACKGROUND;
  }
  let domain = "";
  let checkUpdateUrl = "";
  let downloadUrl = url;
  if (metadata.updateurl && metadata.downloadurl) {
    [checkUpdateUrl] = metadata.updateurl;
    [downloadUrl] = metadata.downloadurl;
  } else {
    checkUpdateUrl = url.replace("user.js", "meta.js");
  }
  if (origin.startsWith("http://") || origin.startsWith("https://")) {
    const u = new URL(origin);
    domain = u.hostname;
  }
  const newUUID = uuid || uuidv4();
  const config: UserConfig | undefined = parseUserConfig(code);
  const now = Date.now();
  const script: Script = {
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
    createtime: now,
    updatetime: now,
    checktime: now,
  };
  let old: Script | undefined;
  if (uuid) {
    old = await dao.findByUUID(uuid);
  }
  if (!old && (!uuid || override)) {
    old = await dao.findByNameAndNamespace(script.name, script.namespace);
  }
  const hasGrantConflict = (metadata: SCMetadata | undefined | null) =>
    metadata?.grant?.includes("none") && metadata?.grant?.some((s: string) => s.startsWith("GM"));
  const hasDuplicatedMetaline = (metadata: SCMetadata | undefined | null) => {
    if (metadata) {
      for (const list of Object.values(metadata)) {
        if (list && new Set(list).size !== list.length) return true;
      }
    }
  };
  if (options?.byEditor && hasGrantConflict(script.metadata) && (!old || !hasGrantConflict(old.metadata))) {
    throw new Error(i18n_t("error_grant_conflict"));
  }
  if (options?.byEditor && hasDuplicatedMetaline(script.metadata) && (!old || !hasDuplicatedMetaline(old.metadata))) {
    throw new Error(i18n_t("error_metadata_line_duplicated"));
  }
  if (old) {
    if (
      (old.type === SCRIPT_TYPE_NORMAL && script.type !== SCRIPT_TYPE_NORMAL) ||
      (script.type === SCRIPT_TYPE_NORMAL && old.type !== SCRIPT_TYPE_NORMAL)
    ) {
      throw new Error(i18n_t("error_script_type_mismatch"));
    }
    const {
      id,
      uuid: oldUUID,
      createtime,
      lastruntime,
      error,
      sort,
      selfMetadata,
      subscribeUrl,
      status,
    } = old;
    Object.assign(script, {
      id,
      oldUUID,
      createtime,
      lastruntime,
      error,
      sort,
      selfMetadata: selfMetadata || {},
      subscribeUrl,
      status,
    });
  } else {
    // 前台脚本默认开启
    if (script.type === SCRIPT_TYPE_NORMAL) {
      script.status = SCRIPT_STATUS_ENABLE;
    }
    script.checktime = now;
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
    throw new Error(i18n_t("error_metadata_invalid"));
  }
  if (metadata.name === undefined) {
    throw new Error(i18n_t("error_subscribe_name_required"));
  }
  const now = Date.now();
  const subscribe: Subscribe = {
    id: 0,
    url,
    name: metadata.name[0],
    code,
    author: (metadata.author && metadata.author[0]) || "",
    scripts: {},
    metadata,
    status: SUBSCRIBE_STATUS_ENABLE,
    createtime: now,
    updatetime: now,
    checktime: now,
  };
  const old = await dao.findByUrl(url);
  if (old) {
    const { id, scripts, createtime, status } = old;
    Object.assign(subscribe, { id, scripts, createtime, status });
  }
  return { subscribe, oldSubscribe: old };
}

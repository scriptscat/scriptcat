import { v4 as uuidv4 } from "uuid";
import {
  Metadata,
  Script,
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
  ScriptDAO,
  UserConfig,
} from "@App/app/repo/scripts";
import YAML from "yaml";
import {
  Subscribe,
  SUBSCRIBE_STATUS_ENABLE,
  SubscribeDAO,
} from "@App/app/repo/subscribe";
import Logger from "@App/app/logger/logger";
import LoggerCore from "@App/app/logger/core";
import { InstallSource } from "@App/app/service/script/manager";
import { nextTime } from "./utils";

export function getMetadataStr(code: string): string | null {
  const start = code.indexOf("==UserScript==");
  const end = code.indexOf("==/UserScript==");
  if (start === -1 || end === -1) {
    return null;
  }
  return `// ${code.substring(start, end + 14)}`;
}

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
  isSubscribe: boolean;
  isUpdate: boolean;
  metadata: Metadata;
  source: InstallSource;
};

export async function fetchScriptInfo(
  url: string,
  source: InstallSource,
  isUpdate: boolean,
  uuid: string
): Promise<ScriptInfo> {
  const resp = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
    },
  });
  if (resp.status !== 200) {
    throw new Error("fetch script info failed");
  }
  if (resp.headers.get("content-type")?.indexOf("text/html") !== -1) {
    throw new Error("url is html");
  }

  const body = await resp.text();
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

export function copyScript(script: Script, old: Script): Script {
  const ret = script;
  ret.id = old.id;
  ret.uuid = old.uuid;
  ret.createtime = old.createtime;
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
  return ret;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(<string>reader.result);
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

// 通过代码解析出脚本信息
export function prepareScriptByCode(
  code: string,
  url: string,
  uuid?: string
): Promise<Script & { oldScript?: Script }> {
  const dao = new ScriptDAO();
  return new Promise((resolve, reject) => {
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
    if (url.indexOf("/") !== -1) {
      urlSplit = url.split("/");
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
    let script: Script & { oldScript?: Script } = {
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
      config: parseUserConfig(code),
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
    const handler = async () => {
      let old: Script | undefined;
      if (uuid) {
        old = await dao.findByUUID(uuid);
        if (!old && url) {
          old = await dao.findByNameAndNamespace(script.name, script.namespace);
        }
      } else {
        old = await dao.findByNameAndNamespace(script.name, script.namespace);
        if (!old) {
          old = await dao.findByUUID(script.uuid);
        }
      }
      if (old) {
        if (
          (old.type === SCRIPT_TYPE_NORMAL &&
            script.type !== SCRIPT_TYPE_NORMAL) ||
          (script.type === SCRIPT_TYPE_NORMAL &&
            old.type !== SCRIPT_TYPE_NORMAL)
        ) {
          reject(new Error("脚本类型不匹配,普通脚本与后台脚本不能互相转变"));
          return;
        }
        script.oldScript = old;
        script = copyScript(script, old);
      } else {
        // 前台脚本默认开启
        if (script.type === SCRIPT_TYPE_NORMAL) {
          script.status = SCRIPT_STATUS_ENABLE;
        }
        script.checktime = new Date().getTime();
      }
      resolve(script);
    };
    handler();
  });
}

export async function prepareSubscribeByCode(
  code: string,
  url: string
): Promise<Subscribe & { oldSubscribe?: Subscribe }> {
  const dao = new SubscribeDAO();
  const metadata = parseMetadata(code);
  if (metadata == null) {
    throw new Error("MetaData信息错误");
  }
  if (metadata.name === undefined) {
    throw new Error("订阅名不能为空");
  }
  let subscribe: Subscribe & { oldSubscribe?: Subscribe } = {
    id: 0,
    url,
    name: metadata.name[0],
    code,
    author: metadata.author && metadata.author[0],
    scripts: {},
    metadata,
    status: SUBSCRIBE_STATUS_ENABLE,
    createtime: Date.now(),
    updatetime: Date.now(),
    checktime: Date.now(),
  };
  const old = await dao.findByUrl(url);
  if (old) {
    subscribe.oldSubscribe = old;
    subscribe = copySubscribe(subscribe, old);
  }
  return Promise.resolve(subscribe);
}

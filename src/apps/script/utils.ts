import { v5 as uuidv5 } from "uuid";
import YAML from 'yaml';
import { Script, UserConfig, Metadata } from "@App/model/do/script";
import axios from "axios";
import { ScriptUrlInfo } from "../msg-center/structs";
import { Subscribe } from "@App/model/do/subscribe";

export function parseMetadata(code: string): Metadata | null {
    let issub = false;
    let regex = /\/\/\s*==UserScript==([\s\S]+?)\/\/\s*==\/UserScript==/m;
    let header = regex.exec(code)
    if (!header) {
        regex = /\/\/\s*==UserSubscribe==([\s\S]+?)\/\/\s*==\/UserSubscribe==/m;
        header = regex.exec(code)
        if (!header) {
            return null;
        }
        issub = true
    }
    regex = /\/\/\s*@([\S]+)((.+?)$|$)/gm;
    let ret: Metadata = {};
    let meta: RegExpExecArray | null;
    while (meta = regex.exec(header[1])) {
        let [key, val] = [meta[1].toLowerCase().trim(), meta[2].trim()];
        let values = ret[key]
        if (values == null) {
            values = [];
        }
        values.push(val);
        ret[key] = values;
    }
    if (ret['name'] == undefined) {
        return null;
    }
    if (issub) {
        ret['usersubscribe'] = [];
    }
    return ret;
}

export function parseUserConfig(code: string): UserConfig | undefined {
    let regex = /\/\*\s*==UserConfig==([\s\S]+?)\s*==\/UserConfig==\s*\*\//m;
    let config = regex.exec(code)
    if (!config) {
        return undefined;
    }
    let configs = config[1].trim().split(/[-]{3,}/);
    let ret: UserConfig = {};
    configs.forEach(val => {
        let obj = YAML.parse(val);
        for (const key in obj) {
            ret[key] = obj[key];
        }
    });
    return ret;
}

export function validMetadata(metadata: Metadata | null): Metadata | null {
    if (metadata == null) {
        return null;
    }

    return metadata;
}

export function loadScriptByUrl(url: string): Promise<ScriptUrlInfo | undefined> {
    return new Promise(resolve => {
        axios.get(url, {
            headers: {
                'Cache-Control': 'no-cache'
            }
        }).then((response): ScriptUrlInfo | undefined => {
            if (response.status != 200) {
                return undefined;
            }
            let ok = parseMetadata(response.data);
            if (!ok) {
                return undefined;
            }
            let uuid = uuidv5(url, uuidv5.URL);
            let ret = {
                url: url,
                code: response.data,
                uuid: uuid,
                issub: false,
            };
            if (ok["usersubscribe"]) {
                ret.issub = true;
            }
            resolve(ret);
        }).catch((e) => {
            resolve(undefined);
        });
    });
}

export function copyScript(script: Script, old: Script) {
    script.id = old.id;
    script.uuid = old.uuid;
    script.createtime = old.createtime;
    script.checktime = old.checktime;
    script.lastruntime = old.lastruntime;
    script.delayruntime = old.delayruntime;
    script.error = old.error;
    script.sort = old.sort;
    script.selfMetadata = old.selfMetadata || {};
    for (let key in script.selfMetadata) {
        script.metadata[key] = script.metadata[key];
    }
    script.subscribeUrl = old.subscribeUrl;
    script.status = old.status;
}

export function copySubscribe(sub: Subscribe, old: Subscribe) {
    sub.id = old.id;
    sub.createtime = old.createtime;
    sub.status = old.status;
    sub.checktime = old.checktime;
    sub.error = old.error;
}
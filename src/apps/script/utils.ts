import { v5 as uuidv5 } from "uuid";
import YAML from 'yaml';
import { Script, UserConfig, Metadata } from "@App/model/do/script";
import axios from "axios";
import { ScriptUrlInfo } from "../msg-center/structs";
import { App } from "../app";

export function parseMetadata(code: string): Metadata | null {
    let regex = /\/\/\s*==UserScript==([\s\S]+?)\/\/\s*==\/UserScript==/m;
    let header = regex.exec(code)
    if (!header) {
        return null;
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
            };
            return ret;
        }).then((val) => {
            resolve(val);
        }).catch((e) => {
            resolve(undefined);
        });
    });
}

export function copyTime(script: Script, old: Script) {
    script.id = old.id;
    script.createtime = old.createtime;
    script.status = old.status;
    script.checktime = old.checktime;
    script.lastruntime = old.lastruntime;
    script.delayruntime = old.delayruntime;
    script.error = old.error;
    script.sort = old.sort;
}

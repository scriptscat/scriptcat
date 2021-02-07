import { Metadata, Script, ScriptModel, SCRIPT_STATUS_PREPARE, SCRIPT_TYPE_CRONTAB, SCRIPT_TYPE_NORMAL } from "@App/model/script";
import { Crontab } from "@App/apps/script/crontab";
import { v5 as uuidv5 } from "uuid";
import axios from "axios";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptCache } from "@App/apps/msg-center/event";
import { ScriptUrlInfo } from "@App/apps/msg-center/structs";

export interface IScript {
    enableScript(script: Script): void;

    disableScript(id: number): Promise<void>;
}

export class Scripts {

    protected script = new ScriptModel();
    protected crontab = new Crontab();

    protected cache = new Map<string, ScriptUrlInfo>();

    public listenMsg() {
        MsgCenter.listener(ScriptCache, (msg) => {
            return this.cache.get(msg);
        });
    }

    protected parseMetadata(code: string): Metadata | null {
        let regex = /\/\/\s*==UserScript==([\s\S]+?)\/\/\s*==\/UserScript==/m;
        let header = regex.exec(code)
        if (!header) {
            return null;
        }
        regex = /\/\/\s*@(.*?)\s+(.*?)$/gm;
        let ret: Metadata = {};
        let meta: RegExpExecArray | null;
        while (meta = regex.exec(header[1])) {
            let [key, val] = [meta[1].toLowerCase(), meta[2]];
            let values = ret[key]
            if (values == null) {
                values = [];
            }
            values.push(val);
            ret[key] = values;
        }
        return ret;
    }

    protected validMetadata(metadata: Metadata | null): Metadata | null {
        if (metadata == null) {
            return null;
        }

        return metadata;
    }

    public loadScriptByUrl(url: string): Promise<ScriptUrlInfo | undefined> {
        return new Promise(resolve => {
            axios.get(url).then((response): ScriptUrlInfo | undefined => {
                if (response.status != 200) {
                    return undefined;
                }
                let uuid = uuidv5(url, uuidv5.URL);
                let ret = {
                    url: url,
                    code: response.data,
                    uuid: uuid
                };
                this.cache.set(uuid, ret);
                return ret;
            }).then((val) => {
                resolve(val);
            }).catch((e) => {
                resolve(undefined);
            });
        });
    }

    public async prepareScriptByCode(code: string, url: string): Promise<[Script | undefined, Script | undefined]> {
        return new Promise(async resolve => {
            let metadata = this.parseMetadata(code);
            if (metadata == null) {
                return resolve([undefined, undefined]);
            }
            if (metadata["name"] == undefined) {
                return resolve([undefined, undefined]);
            }
            let type = SCRIPT_TYPE_NORMAL;
            if (metadata["corntab"] != undefined && this.crontab.validCrontab(metadata["crontab"][0])) {
                type = SCRIPT_TYPE_CRONTAB;
            }
            let script: Script = {
                id: 0,
                uuid: uuidv5(url, uuidv5.URL),
                name: metadata["name"][0],
                code: code,
                origin: url,
                checkupdate_url: url.replace("user.js", "meta.js"),
                metadata: metadata,
                type: type,
                status: SCRIPT_STATUS_PREPARE,
            };
            if (!script) {
                return resolve([undefined, undefined]);
            }
            let old = await this.script.findByName(script.name);
            return resolve([script, old]);
        });
    }

    public async installScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            let ok = await this.script.save(script);
            if (!ok) {
                return resolve(false);
            }
            //TODO:安装成功开启脚本
            return resolve(true);
        });
    }

    public updateScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            let old = this.script.findById(script.id);
            let ok = await this.script.save(script);
            if (!ok) {
                return resolve(false);
            }
            //TODO:更新成功按照脚本原状态开启或者关闭
            return resolve(true);
        });
    }

    public uninstallScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            await this.script.delete(script.id).catch(e => {
                resolve(false);
                throw e;
            });
            //TODO:删除后关闭脚本等操作
            return resolve(true);
        });
    }

}
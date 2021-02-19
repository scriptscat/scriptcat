import { Metadata, Script, ScriptModel, SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_STATUS_ERROR, SCRIPT_STATUS_PREPARE, SCRIPT_TYPE_CRONTAB, SCRIPT_TYPE_NORMAL } from "@App/model/script";
import { Crontab } from "@App/apps/script/crontab";
import { v5 as uuidv5 } from "uuid";
import axios from "axios";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptCache, ScriptUpdate } from "@App/apps/msg-center/event";
import { ScriptUrlInfo } from "@App/apps/msg-center/structs";
import { Page } from "@App/pkg/utils";

export class Scripts {

    protected script = new ScriptModel();
    protected crontab = new Crontab();

    protected cache = new Map<string, ScriptUrlInfo>();

    public listenMsg() {
        MsgCenter.listener(ScriptCache, (msg) => {
            return this.cache.get(msg);
        });
    }

    public listenScriptUpdate() {
        MsgCenter.listener(ScriptUpdate, async (msg) => {
            let script = <Script>msg;
            if (script.status == SCRIPT_STATUS_ENABLE) {
                await this.enableScript(script);
            } else if (script.status == SCRIPT_STATUS_DISABLE) {
                this.disableScript(script);
            }
            return script;
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
            if (metadata["crontab"] != undefined && this.crontab.validCrontab(metadata["crontab"][0])) {
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
            let old = await this.script.findByName(script.name);
            if (old) {
                script.id = old.id;
                script.createtime = old.createtime;
                script.status = old.status;
            }
            return resolve([script, old]);
        });
    }

    public async installScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            script.createtime = new Date().getTime();
            return resolve(await this.updateScript(script));
        });
    }

    public updateScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            script.updatetime = new Date().getTime();
            let ok = await this.script.save(script);
            if (!ok) {
                return resolve(false);
            }
            MsgCenter.connect(ScriptUpdate, script).addListener(async msg => {
                let s = <Script>msg;
                script.status = s.status;
                script.error = s.error;
            });
            return resolve(true);
        });
    }

    public enableScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            script.status = SCRIPT_STATUS_ENABLE;
            if (script.type == SCRIPT_TYPE_CRONTAB) {
                let ret = await this.crontab.enableScript(script);
                if (ret) {
                    script.error = ret;
                    script.status == SCRIPT_STATUS_ERROR;
                }
            }
            script.updatetime = new Date().getTime();
            let ok = await this.script.save(script);
            if (!ok) {
                return resolve(false);
            }
            return resolve(true);
        });
    }

    public disableScript(script: Script): Promise<void> {
        return new Promise(async resolve => {
            script.status = SCRIPT_STATUS_DISABLE;
            if (script.type == SCRIPT_TYPE_CRONTAB) {
                await this.crontab.disableScript(script);
            }
            script.updatetime = new Date().getTime();
            await this.script.save(script);
            resolve();
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

    public scriptList(equalityCriterias: { [key: string]: any } | undefined): Promise<Array<Script>> {
        return new Promise(async resolve => {
            let page = new Page(1, 20);
            if (equalityCriterias == undefined) {
                equalityCriterias = {};
                resolve(await this.script.list(this.script.table, page));
            } else {
                resolve(await this.script.list(this.script.table.where(equalityCriterias), page));
            }
        });
    }

    public getScript(id: number): Promise<Script | undefined> {
        return new Promise(async resolve => {
            resolve(await this.script.findById(id));
        });
    }
}
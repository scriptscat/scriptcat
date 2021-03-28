import { Metadata, Script, ScriptCache, ScriptModel, SCRIPT_RUN_STATUS_COMPLETE, SCRIPT_RUN_STATUS_ERROR, SCRIPT_RUN_STATUS_RETRY, SCRIPT_RUN_STATUS_RUNNING, SCRIPT_STATUS, SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_STATUS_ERROR, SCRIPT_STATUS_PREPARE, SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB, SCRIPT_TYPE_NORMAL } from "@App/model/script";
import { v5 as uuidv5 } from "uuid";
import axios from "axios";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptCacheEvent, ScriptExec, ScriptRunStatusChange, ScriptStop, ScriptUninstall, ScriptUpdate } from "@App/apps/msg-center/event";
import { ScriptUrlInfo } from "@App/apps/msg-center/structs";
import { AllPage, Page } from "@App/pkg/utils";
import { IScript } from "@App/apps/script/interface";
import { App } from "../app";
import { UrlMatch } from "@App/pkg/match";
import { Value, ValueModel } from "@App/model/value";

export class ScriptManager {

    protected scriptModel = new ScriptModel();
    protected background!: IScript;

    protected match = new UrlMatch<ScriptCache>();

    protected infoCache = new Map<string, ScriptUrlInfo>();
    // 脚本缓存 会在listen更新
    protected scriptCache = new Map<number, Script>();

    protected valueModel = new ValueModel();


    constructor(background: IScript | undefined) {
        if (background) {
            this.background = background;
        }
    }

    public listenMsg() {
        MsgCenter.listener(ScriptCacheEvent, (msg) => {
            return this.infoCache.get(msg);
        });
    }

    public listenScript() {
        // 监听脚本更新 处理脚本重新执行操作
        MsgCenter.listener(ScriptUpdate, async (msg): Promise<any> => {
            return new Promise(async resolve => {
                let script = <Script>msg[0];
                let oldScript = <Script>msg[1];
                if (script.status == SCRIPT_STATUS_ENABLE) {
                    if (oldScript && oldScript.status == SCRIPT_STATUS_ENABLE) {
                        await this.disableScript(script);
                    }
                    await this.enableScript(script);
                } else if (script.status == SCRIPT_STATUS_DISABLE) {
                    this.disableScript(script);
                    script.runStatus = 'complete';
                }
                this.scriptCache.set(script.id, script);
                return resolve(script);
            });
        });
        // 监听脚本卸载 关闭脚本
        MsgCenter.listener(ScriptUninstall, async (msg): Promise<any> => {
            return new Promise(async resolve => {
                let script = <Script>msg[0];
                if (script.status == SCRIPT_STATUS_ENABLE) {
                    await this.disableScript(script);
                }
                this.scriptCache.delete(script.id);
                await this.scriptModel.delete(script.id).catch(() => {
                    resolve(false);
                });
                resolve(true);
            });
        });
        MsgCenter.listener(ScriptExec, async (msg): Promise<any> => {
            return new Promise(async resolve => {
                let script = <Script>msg[0];
                if (script.type == SCRIPT_TYPE_CRONTAB || script.type == SCRIPT_TYPE_BACKGROUND) {
                    await this.background.execScript(script, await this.getScriptValue(script), msg[1]);
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
        MsgCenter.listener(ScriptStop, async (msg): Promise<any> => {
            return new Promise(async resolve => {
                let script = <Script>msg[0];
                if (script.type == SCRIPT_TYPE_CRONTAB || script.type == SCRIPT_TYPE_BACKGROUND) {
                    await this.background.stopScript(script, msg[1]);
                    if (script.runStatus == SCRIPT_RUN_STATUS_RUNNING) {
                        this.scriptModel.update(script.id, { runStatus: SCRIPT_RUN_STATUS_COMPLETE });
                    }
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
    }

    public async getScriptValue(script: Script): Promise<Value[]> {
        return new Promise(async resolve => {
            let list: Value[];
            if (script.namespace) {
                list = await this.valueModel.list((table) => {
                    return table.where({ namespace: script.namespace });
                }, new AllPage());
            } else {
                list = await this.valueModel.list((table) => {
                    return table.where({ scriptId: script.id });
                }, new AllPage());
            }
            resolve(list);
        });
    }

    public listenScriptMath() {
        this.scriptList({ type: SCRIPT_TYPE_NORMAL, status: SCRIPT_STATUS_ENABLE }).then(items => {
            items.forEach(script => {
                let match = script.metadata['match'];
                if (match) {
                    match.forEach(async val => {
                        this.match.add(val, await this.buildScriptCache(script));
                    });
                }
            });
        });
        chrome.runtime.onMessage.addListener((msg, detail, send) => {
            if (msg !== 'runScript') {
                return;
            }
            if (!detail.url) {
                return;
            }
            let scripts = this.match.match(detail.url);
            let filter: ScriptCache[] = [];
            scripts.forEach(script => {
                if (script.metadata['@noframes']) {
                    if (detail.frameId != 0) {
                        return;
                    }
                }
                filter.push(script);
            });
            send({ scripts: filter });
        });
    }

    public buildScriptCache(script: Script): Promise<ScriptCache> {
        return new Promise(async resolve => {
            let ret: ScriptCache = <ScriptCache>script;

            let valMap = new Map();
            let list = await this.getScriptValue(script);
            list.forEach(val => {
                valMap.set(val.key, val);
            });
            ret.value = valMap;

            resolve(ret);
        });
    }

    protected parseMetadata(code: string): Metadata | null {
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
                let ok = this.parseMetadata(response.data);
                if (!ok) {
                    return undefined;
                }
                let uuid = uuidv5(url, uuidv5.URL);
                let ret = {
                    url: url,
                    code: response.data,
                    uuid: uuid
                };
                this.infoCache.set(uuid, ret);
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
            if (metadata["crontab"] != undefined) {
                type = SCRIPT_TYPE_CRONTAB;
            } else if (metadata["background"] != undefined) {
                type = SCRIPT_TYPE_BACKGROUND;
            }
            let urlSplit: string[];
            let domain = '';
            let checkupdate_url = '';
            if (url.indexOf('/') !== -1) {
                urlSplit = url.split('/');
                if (urlSplit[2]) {
                    domain = urlSplit[2];
                }
                checkupdate_url = url.replace("user.js", "meta.js");
            }
            let script: Script = {
                id: 0,
                uuid: uuidv5(url, uuidv5.URL),
                name: metadata["name"][0],
                code: code,
                author: metadata['author'] && metadata['author'][0],
                namespace: metadata['namespace'] && metadata['namespace'][0],
                origin_domain: domain,
                origin: url,
                checkupdate_url: checkupdate_url,
                metadata: metadata,
                type: type,
                status: SCRIPT_STATUS_PREPARE,
                runStatus: SCRIPT_RUN_STATUS_COMPLETE,
                checktime: 0,
            };
            let old = await this.scriptModel.findByUUID(script.uuid);
            if (old) {
                this.copyTime(script, old);
            } else {
                script.checktime = new Date().getTime();
            }
            return resolve([script, old]);
        });
    }

    protected copyTime(script: Script, old: Script) {
        script.id = old.id;
        script.createtime = old.createtime;
        script.status = old.status;
        script.checktime = old.checktime;
        script.lastruntime = old.lastruntime;
        script.delayruntime = old.delayruntime;
        script.error = old.error;
    }

    public installScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            script.createtime = new Date().getTime();
            return resolve(await this.updateScript(script));
        });
    }

    public updateScript(script: Script, old?: Script): Promise<boolean> {
        return new Promise(async resolve => {
            if (script.id && !old) {
                old = await this.scriptModel.findById(script.id);
                if (old) {
                    this.copyTime(script, old);
                }
            }
            script.updatetime = new Date().getTime();
            let ok = await this.scriptModel.save(script);
            if (!ok) {
                return resolve(false);
            }
            MsgCenter.connect(ScriptUpdate, [script, old]).addListener(msg => {
                let s = <Script>msg;
                script.status = s.status
                script.error = s.error;
                resolve(true);
            });
        });
    }

    public execScript(script: Script, isdebug: boolean): Promise<boolean> {
        return new Promise(async resolve => {
            MsgCenter.connect(ScriptExec, [script, isdebug]).addListener(msg => {
                resolve(true);
            });
        });
    }

    public stopScript(script: Script, isdebug: boolean): Promise<boolean> {
        return new Promise(async resolve => {
            MsgCenter.connect(ScriptStop, [script, isdebug]).addListener(msg => {
                resolve(true);
            });
        });
    }

    public updateScriptStatus(id: number, status: SCRIPT_STATUS): Promise<boolean> {
        return new Promise(async resolve => {
            let old = await this.scriptModel.findById(id);
            if (!old) {
                return resolve(true);
            }
            let script: Script = Object.assign({}, old);
            script.status = status;
            let ok = await this.scriptModel.save(script);
            if (!ok) {
                return resolve(false);
            }
            MsgCenter.connect(ScriptUpdate, [script, old]).addListener(msg => {
                resolve(true);
            });
        });
    }

    public enableScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            if (script.type == SCRIPT_TYPE_CRONTAB || script.type == SCRIPT_TYPE_BACKGROUND) {
                let ret = await this.background.enableScript(script, await this.getScriptValue(script));
                if (ret) {
                    script.error = ret;
                    script.status == SCRIPT_STATUS_ERROR;
                } else {
                    script.status = SCRIPT_STATUS_ENABLE;
                }
            } else {
                script.status = SCRIPT_STATUS_ENABLE;
            }
            let ok = await this.scriptModel.save(script);
            if (!ok) {
                return resolve(false);
            }
            return resolve(true);
        });
    }

    public disableScript(script: Script): Promise<void> {
        return new Promise(async resolve => {
            script.status = SCRIPT_STATUS_DISABLE;
            if (script.type == SCRIPT_TYPE_CRONTAB || script.type == SCRIPT_TYPE_BACKGROUND) {
                await this.background.disableScript(script);
            }
            await this.scriptModel.save(script);
            resolve();
        });
    }

    public uninstallScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            MsgCenter.connect(ScriptUninstall, [script]).addListener(msg => {
                resolve(msg);
            });
        });
    }

    public scriptList(equalityCriterias: { [key: string]: any } | ((where: Dexie.Table) => Dexie.Collection) | undefined, page: Page | undefined = undefined): Promise<Array<Script>> {
        return new Promise(async resolve => {
            page = page || new Page(1, 20);
            if (equalityCriterias == undefined) {
                resolve(await this.scriptModel.list(page));
            } else if (typeof equalityCriterias == 'function') {
                let ret = (await this.scriptModel.list(equalityCriterias(this.scriptModel.table), page));
                resolve(ret);
            } else {
                resolve(await this.scriptModel.list(this.scriptModel.table.where(equalityCriterias), page));
            }
        });
    }

    public getScript(id: number): Promise<Script | undefined> {
        return new Promise(async resolve => {
            let ret = this.scriptCache.get(id);
            if (ret) {
                return resolve(ret);
            }
            ret = await this.scriptModel.findById(id);
            if (ret) {
                this.scriptCache.set(id, ret);
            }
            return resolve(ret);
        });
    }

    public setLastRuntime(id: number, time: number): Promise<boolean> {
        return new Promise(async resolve => {
            this.scriptModel.table.update(id, {
                lastruntime: time, runStatus: SCRIPT_RUN_STATUS_RUNNING
            })
            MsgCenter.connect(ScriptRunStatusChange, [id, SCRIPT_RUN_STATUS_RUNNING]);
            resolve(true);
        });
    }

    public setRunError(id: number, error: string, time: number): Promise<boolean> {
        return new Promise(async resolve => {
            if (error !== '' && time !== 0) {
                this.scriptModel.table.update(id, { error: error, delayruntime: time, runStatus: SCRIPT_RUN_STATUS_RETRY })
                MsgCenter.connect(ScriptRunStatusChange, [id, SCRIPT_RUN_STATUS_RETRY]);
            } else {
                this.scriptModel.table.update(id, { error: error, delayruntime: time, runStatus: SCRIPT_RUN_STATUS_ERROR })
                if (error) {
                    MsgCenter.connect(ScriptRunStatusChange, [id, SCRIPT_RUN_STATUS_ERROR]);
                }
            }
            resolve(true);
        });
    }

    public setRunComplete(id: number): Promise<boolean> {
        return new Promise(async resolve => {
            this.scriptModel.table.update(id, { error: "", runStatus: SCRIPT_RUN_STATUS_COMPLETE })
            MsgCenter.connect(ScriptRunStatusChange, [id, SCRIPT_RUN_STATUS_COMPLETE]);
            resolve(true);
        });
    }

    // 检查脚本更新
    public scriptCheckupdate(script: Script): Promise<void> {
        return new Promise(resolve => {
            if (script.checkupdate_url == undefined) {
                return resolve();
            }
            this.scriptModel.table.update(script.id, { checktime: new Date().getTime() });
            axios.get(script.checkupdate_url).then((response): boolean => {
                if (response.status != 200) {
                    App.Log.Warn("check update", "script:" + script.id + " error: respond:" + response.statusText, script.name);
                    return false;
                }
                let meta = this.parseMetadata(response.data);
                if (!meta) {
                    App.Log.Warn("check update", "script:" + script.id + " error: metadata format", script.name);
                    return false;
                }
                if (script.metadata['version'] == undefined) {
                    script.metadata['version'] = ["v0.0.0"];
                }
                if (meta['version'] == undefined) {
                    return false;
                }
                var regexp = /[0-9]*/g
                var oldVersion = script.metadata['version'][0].match(regexp);
                if (!oldVersion) {
                    oldVersion = ["0", "0", "0"];
                }
                var Version = meta['version'][0].match(regexp);
                if (!Version) {
                    App.Log.Warn("check update", "script:" + script.id + " error: version format", script.name);
                    return false;
                }
                for (let i = 0; i < Version.length; i++) {
                    if (oldVersion[i] == undefined) {
                        return true;
                    }
                    if (Version[i] > oldVersion[i]) {
                        return true;
                    }
                }
                return false;
            }).then(async (val) => {
                if (val) {
                    let info = await this.loadScriptByUrl(script.origin);
                    if (info != undefined) {
                        chrome.tabs.create({
                            url: 'install.html?uuid=' + info.uuid
                        });
                    }
                }
                resolve(undefined);
            }).catch((e) => {
                App.Log.Warn("check update", "script:" + script.id + " error: " + e, script.name);
                resolve(undefined);
            });

        })
    }
}
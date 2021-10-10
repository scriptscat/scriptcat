import { v5 as uuidv5 } from 'uuid';
import { SCRIPT_STATUS_ENABLE, SCRIPT_STATUS_DISABLE, Script, SCRIPT_RUN_STATUS_COMPLETE, SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB, SCRIPT_TYPE_NORMAL, SCRIPT_ORIGIN_LOCAL, ScriptCache } from "@App/model/do/script";
import { ScriptModel } from "@App/model/script";
import { AllPage, get, Page, randomString } from "@App/pkg/utils";
import { ScriptExec, ScriptStatusChange, ScriptStop, ScriptUninstall, ScriptReinstall, ScriptInstall, RequestInstallInfo, ScriptCheckUpdate, RequestConfirmInfo, SubscribeUpdate, Unsubscribe, SubscribeCheckUpdate, ImportFile, OpenImportFileWindow } from "../msg-center/event";
import { MsgCenter } from "../msg-center/msg-center";
import { parseMetadata, parseUserConfig, copyScript, copySubscribe } from "./utils";
import { ScriptUrlInfo } from '../msg-center/structs';
import { ConfirmParam } from '../grant/interface';
import { LoggerModel } from '@App/model/logger';
import { Log } from '@App/model/do/logger';
import { nextTime } from '@App/views/pages/utils';
import { Value } from '@App/model/do/value';
import { ValueModel } from '@App/model/value';
import { App } from '../app';
import { Resource } from '@App/model/do/resource';
import { ResourceManager } from '../resource';
import { compileScriptCode } from '@App/pkg/sandbox';
import { SubscribeModel } from '@App/model/subscribe';
import { Subscribe, SUBSCRIBE_STATUS_DISABLE, SUBSCRIBE_STATUS_ENABLE } from '@App/model/do/subscribe';
import { File } from '@App/model/do/back';

// 脚本控制器,发送或者接收来自管理器的消息,并不对脚本数据做实际的处理
export class ScriptController {

    protected scriptModel = new ScriptModel();
    protected subscribeModel = new SubscribeModel();
    protected logModel = new LoggerModel();
    protected valueModel = new ValueModel();

    protected resource = new ResourceManager();

    public update(script: Script): Promise<number> {
        return new Promise(resolve => {
            if (script.id) {
                MsgCenter.sendMessage(ScriptReinstall, script, resp => {
                    resolve(script.id);
                });
            } else {
                MsgCenter.sendMessage(ScriptInstall, script, resp => {
                    script.id = resp;
                    resolve(script.id);
                });
            }
        });
    }

    public uninstall(scriptId: number): Promise<boolean> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(ScriptUninstall, scriptId, resp => {
                resolve(true);
            });
        });
    }

    public enable(scriptId: number): Promise<boolean> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(ScriptStatusChange, { scriptId: scriptId, status: SCRIPT_STATUS_ENABLE }, resp => {
                resolve(true);
            });
        });
    }

    public disable(scriptId: number): Promise<boolean> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(ScriptStatusChange, { scriptId: scriptId, status: SCRIPT_STATUS_DISABLE }, resp => {
                resolve(true);
            });
        });
    }

    public exec(scriptId: number, isdebug: boolean): Promise<boolean> {
        return new Promise(async resolve => {
            MsgCenter.sendMessage(ScriptExec, { scriptId: scriptId, isdebug: isdebug }, resp => {
                resolve(true);
            });
        });
    }

    public stop(scriptId: number, isdebug: boolean): Promise<boolean> {
        return new Promise(async resolve => {
            MsgCenter.sendMessage(ScriptStop, { scriptId: scriptId, isdebug: isdebug }, resp => {
                resolve(true);
            });
        });
    }

    // 检查更新
    public check(scriptId: number): Promise<boolean> {
        return new Promise(async resolve => {
            MsgCenter.sendMessage(ScriptCheckUpdate, scriptId, resp => {
                resolve(resp);
            });
        });
    }

    public subscribeList(equalityCriterias: { [key: string]: any } | ((where: Dexie.Table) => Dexie.Collection) | undefined, page: Page | undefined = undefined): Promise<Array<Subscribe>> {
        return new Promise(async resolve => {
            page = page || new Page(1, 20);
            if (equalityCriterias == undefined) {
                resolve(await this.subscribeModel.list(page));
            } else if (typeof equalityCriterias == 'function') {
                let ret = (await this.subscribeModel.list(equalityCriterias(this.subscribeModel.table), page));
                resolve(ret);
            } else {
                resolve(await this.subscribeModel.list(this.subscribeModel.table.where(equalityCriterias), page));
            }
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

    public getScript(id: number): Promise<Script | any> {
        return this.scriptModel.findById(id);
    }

    public getInstallInfo(uuid: string): Promise<ScriptUrlInfo> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(RequestInstallInfo, uuid, resp => {
                resolve(resp);
            });
        });
    }

    public getConfirmInfo(uuid: string): Promise<ConfirmParam> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(RequestConfirmInfo, uuid, resp => {
                resolve(resp);
            });
        });
    }

    public prepareSubscribeByCode(code: string, url: string): Promise<[Subscribe | undefined, Subscribe | string | undefined]> {
        return new Promise(async resolve => {
            let metadata = parseMetadata(code);
            if (metadata == null) {
                return resolve([undefined, 'MetaData信息错误']);
            }
            if (metadata["name"] == undefined) {
                return resolve([undefined, '订阅名称不能为空']);
            }
            if (!metadata["scripturl"]) {
                return resolve([undefined, '没有脚本,订阅个寂寞']);
            }
            let subscribe: Subscribe = {
                id: 0,
                name: metadata["name"][0],
                code: code,
                scripts: {},
                author: metadata['author'] && metadata['author'][0],
                url: url,
                metadata: metadata,
                status: SUBSCRIBE_STATUS_ENABLE,
                createtime: new Date().getTime(),
                updatetime: new Date().getTime(),
                checktime: 0,
            };
            let old = await this.subscribeModel.findByUrl(subscribe.url);
            if (old) {
                copySubscribe(subscribe, old);
            } else {
                subscribe.checktime = new Date().getTime();
            }
            return resolve([subscribe, old]);
        });
    }

    public prepareScriptByUrl(url: string): Promise<[Script | undefined, Script | string | undefined]> {
        return new Promise(async (resolve, reject) => {
            get(url, async (resp) => {
                resolve(await this.prepareScriptByCode(resp, url))
            }, () => {
                reject();
            });
        });
    }

    public prepareScriptByCode(code: string, url: string, uuid?: string): Promise<[Script | undefined, Script | string | undefined]> {
        return new Promise(async resolve => {
            let metadata = parseMetadata(code);
            if (metadata == null) {
                return resolve([undefined, 'MetaData信息错误']);
            }
            if (metadata["name"] == undefined) {
                return resolve([undefined, '脚本名不能为空']);
            }
            let type = SCRIPT_TYPE_NORMAL;
            if (metadata["crontab"] != undefined) {
                type = SCRIPT_TYPE_CRONTAB;
                if (nextTime(metadata['crontab'][0]) == '错误的定时表达式') {
                    return resolve([undefined, '错误的定时表达式']);
                }
            } else if (metadata["background"] != undefined) {
                type = SCRIPT_TYPE_BACKGROUND;
            }
            let urlSplit: string[];
            let domain = '';
            let checkupdate_url = '';
            let download_url = '';
            if (metadata['updateurl'] && metadata['downloadurl']) {
                checkupdate_url = metadata['updateurl'][0];
                download_url = metadata['downloadurl'][0];
            } else {
                checkupdate_url = url.replace("user.js", "meta.js");
            }
            if (url.indexOf('/') !== -1) {
                urlSplit = url.split('/');
                if (urlSplit[2]) {
                    domain = urlSplit[2];
                }
            }
            let script: Script = {
                id: 0,
                uuid: uuid || uuidv5(url, uuidv5.URL),
                name: metadata["name"][0],
                code: code,
                author: metadata['author'] && metadata['author'][0],
                namespace: metadata['namespace'] && metadata['namespace'][0],
                origin_domain: domain,
                origin: url,
                checkupdate_url: checkupdate_url,
                download_url: download_url,
                config: parseUserConfig(code),
                metadata: metadata,
                selfMetadata: {},
                sort: 0,
                type: type,
                status: SCRIPT_STATUS_DISABLE,
                runStatus: SCRIPT_RUN_STATUS_COMPLETE,
                createtime: new Date().getTime(),
                updatetime: new Date().getTime(),
                checktime: 0,
            };
            let old = await this.scriptModel.findByUUID(script.uuid);
            if (uuid == undefined && (!old && !script.origin.startsWith(SCRIPT_ORIGIN_LOCAL))) {
                old = await this.scriptModel.findByNameAndNamespace(script.name, script.namespace);
            }
            if (old) {
                copyScript(script, old);
            } else {
                // 前台脚本默认开启
                if (script.type == SCRIPT_TYPE_NORMAL) {
                    script.status = SCRIPT_STATUS_ENABLE;
                }
                script.checktime = new Date().getTime();
            }
            return resolve([script, old]);
        });
    }

    public getScriptLog(scriptId: number, page?: Page): Promise<Log[]> {
        return this.logModel.list(query => {
            return query.where({ scriptId: scriptId, origin: "GM_log" });
        }, page);
    }

    public clearLog(scriptId: number) {
        return this.logModel.delete({ scriptId: scriptId, origin: "GM_log" });
    }


    // 第一次获取后在内存中维护
    public async getScriptValue(script: Script): Promise<{ [key: string]: Value }> {
        if (script.metadata['storagename']) {
            return App.Cache.getOrSet("value:storagename:" + script.metadata['storagename'][0], () => {
                return new Promise(async resolve => {
                    let list = <Value[]>await this.valueModel.list((table) => {
                        return table.where({ storageName: script.metadata['storagename'][0] });
                    }, new AllPage());
                    let ret: { [key: string]: Value } = {};
                    list.forEach(val => {
                        ret[val.key] = val;
                    });
                    resolve(ret);
                });
            });
        }
        return App.Cache.getOrSet("value:" + script.id, () => {
            return new Promise(async resolve => {
                let list = <Value[]>await this.valueModel.list((table) => {
                    return table.where({ scriptId: script.id });
                }, new AllPage());
                let ret: { [key: string]: Value } = {};
                list.forEach(val => {
                    ret[val.key] = val;
                });
                resolve(ret);
            });
        });
    }

    public getResource(id: number, url: string): Promise<Resource | undefined> {
        return new Promise(async resolve => {
            let res = await this.resource.getResource(url);
            if (res) {
                return resolve(res);
            } else {
                res = await this.resource.addResource(url, id);
                if (res) {
                    return resolve(res);
                }
            }
            resolve(undefined);
        });
    }

    public getResources(script: Script): Promise<{ [key: string]: Resource }> {
        return new Promise(async resolve => {
            let ret: { [key: string]: Resource } = {};
            for (let i = 0; i < script.metadata['require']?.length; i++) {
                let res = await this.getResource(script.id, script.metadata['require'][i]);
                if (res) {
                    ret[script.metadata['require'][i]] = res;
                }
            }
            for (let i = 0; i < script.metadata['require-css']?.length; i++) {
                let res = await this.getResource(script.id, script.metadata['require-css'][i]);
                if (res) {
                    ret[script.metadata['require-css'][i]] = res;
                }
            }

            for (let i = 0; i < script.metadata['resource']?.length; i++) {
                let split = script.metadata['resource'][i].split(/\s+/);
                if (split.length == 2) {
                    let res = await this.getResource(script.id, split[1]);
                    if (res) {
                        ret[split[0]] = res;
                    }
                }
            }
            resolve(ret);
        });
    }

    public buildScriptCache(script: Script): Promise<ScriptCache> {
        return new Promise(async resolve => {
            let ret: ScriptCache = <ScriptCache>Object.assign({}, script);

            // 自定义配置
            for (const key in ret.metadata) {
                if (ret.selfMetadata && ret.selfMetadata[key]) {
                    ret.metadata[key] = ret.selfMetadata[key];
                }
            }

            ret.value = await this.getScriptValue(ret);

            ret.resource = await this.getResources(ret);

            ret.flag = randomString(16);
            ret.code = compileScriptCode(ret);

            ret.grantMap = {};

            ret.metadata['grant']?.forEach((val: string) => {
                ret.grantMap![val] = 'ok';
            });

            resolve(ret);
        });
    }


    public subscribe(sub: Subscribe): Promise<number> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(SubscribeUpdate, sub, resp => {
                sub.id = resp;
                resolve(sub.id);
            });
        })
    }

    public unsubscribe(subId: number): Promise<boolean> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(Unsubscribe, subId, resp => {
                resolve(resp);
            });
        })
    }

    public checkSubscribe(subId: number): Promise<boolean> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(SubscribeCheckUpdate, subId, resp => {
                resolve(resp);
            });
        })
    }

    public enableSubscribe(subId: number): Promise<boolean> {
        return new Promise(async resolve => {
            if (await this.subscribeModel.update(subId, { status: SUBSCRIBE_STATUS_ENABLE })) {
                resolve(true);
            } else {
                resolve(false);
            }
        })
    }

    public diableSubscribe(subId: number): Promise<boolean> {
        return new Promise(async resolve => {
            if (await this.subscribeModel.update(subId, { status: SUBSCRIBE_STATUS_DISABLE })) {
                resolve(true);
            } else {
                resolve(false);
            }
        })
    }

    public parseBackFile(str: string): { data?: File, err?: string } {
        let data = <File>JSON.parse(str);
        if (!data.created_by) {
            return { err: "错误的格式" };
        }
        if (!data.scripts) {
            return { err: "脚本为空" }
        }
        return { data: data };
    }

    public openImportFileWindow(file: File): Promise<any> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(OpenImportFileWindow, file, (resp) => {
                resolve(resp);
            });
        });
    }
}
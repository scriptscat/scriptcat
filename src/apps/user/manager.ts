import { Sync, SyncData } from "@App/model/do/sync";
import { ScriptModel } from "@App/model/script";
import { SubscribeModel } from "@App/model/subscribe";
import { SyncModel } from "@App/model/sync";
import { ValueModel } from "@App/model/value";
import { SystemConfig } from "@App/pkg/config";
import { get, getJson, InfoNotification, postJson, put, putJson } from "@App/pkg/utils/utils";
import { KeyCode } from "monaco-editor";
import { App } from "../app";
import { Server } from "../config";
import { AppEvent, SyncTaskEvent, TriggerSync, UserLogin, UserLogout } from "../msg-center/event";
import { MessageCallback, MsgCenter } from "../msg-center/msg-center";
import { ScriptManager } from "../script/manager";

// 用户管理器,监听消息,处理同步等数据
export class UserManager {

    protected scriptModel = new ScriptModel();
    protected subscribeModel = new SubscribeModel();
    protected valueModel = new ValueModel();
    protected syncModel = new SyncModel();

    public scriptManager = new ScriptManager();

    protected syncPort = new Map<any, chrome.runtime.Port[]>();

    public listenEvent() {
        this.login();

        this.listenerMessage(UserLogin, this.loginEvent);
        this.listenerMessage(UserLogout, this.logoutEvent);
        this.listenerMessage(TriggerSync, this.triggerSync);
    }

    public listenerMessage(topic: string, callback: MessageCallback) {
        MsgCenter.listenerMessage(topic, async (body, send, sender) => {
            let ret = <any>callback.call(this, body, send, sender)
            if (ret instanceof Promise) {
                ret = await ret;
            }
            send(ret);
        });
    }

    public login() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([
                'currentUser', 'currentDevice', 'currentScriptSyncVersion'], items => {
                    if (!items['currentUser']) {
                        return resolve('not login');
                    }
                    if (!items['currentDevice']) {
                        this.loginDevice();
                    }
                });
        });
    }

    public triggerSync(): Promise<string> {
        return new Promise(async resolve => {
            resolve(await this.sync());
        });
    }

    public loginEvent(userinfo: Userinfo): Promise<any> {
        return new Promise(resolve => {
            chrome.storage.local.get(['currentUser'], items => {
                if (items['currentUser']) {
                    return resolve('ok');
                }
                chrome.storage.local.set({
                    currentUser: userinfo.id,
                    userinfo: userinfo,
                });
                // 获取设备和同步等信息
                InfoNotification('登录成功', '登录成功,将自动同步账号数据');
                this.loginDevice();
                return resolve('ok');
            });
        });
    }

    public logoutEvent(): Promise<any> {
        return new Promise(resolve => {
            chrome.storage.local.remove(['currentUser', 'currentDevice', 'currentScriptSyncVersion', 'currentSubscribeSyncVersion'], () => {
                return resolve('ok');
            });
        })
    }

    //NOTE:script和subscribe代码大量重复,以后优化
    public firstSync() {
        chrome.storage.local.get(['currentUser', 'currentDevice'], async items => {
            if (!items['currentUser']) {
                return;
            }
            await this.syncModel.clear();
            SystemConfig.changetime = 0;
            this.syncSetting();
            getJson(Server + "api/v1/sync/" + items['currentDevice'] + '/script/pull/0', async (resp) => {
                if (resp.code !== 0) {
                    App.Log.Error("system", resp.msg + ',重启后重试', "设备同步拉取失败");
                    chrome.storage.local.remove(['currentDevice']);
                    return
                }
                let data = <SyncData[]>resp.data.pull || [];
                // 脚本安装
                let map = new Map<string, SyncData>();
                for (const index in data) {
                    let v = data[index];
                    // 首次登录只处理更新的
                    if (v.action == "update") {
                        let newscript = await this.scriptManager.syncToScript(v);
                        if (typeof newscript == "string") {
                            App.Log.Error("system", v.uuid! + ' ' + newscript, "脚本同步失败");
                            continue;
                        }
                        map.set(v.uuid!, v);
                    }
                }
                chrome.storage.local.set({
                    currentScriptSyncVersion: resp.data.version
                }, () => {
                    // 查询未同步的脚本
                    this.scriptManager.scriptList(undefined).then(async list => {
                        let syncNum = 0;
                        for (const i in list) {
                            let item = list[i];
                            if (!map.has(item.uuid)) {
                                // push
                                await this.scriptManager.syncScriptTask(item.uuid, "update", item);
                                syncNum++;
                            }
                        }
                        InfoNotification('首次数据同步成功', `成功拉取${map.size}个脚本,有${syncNum}个脚本将自动同步`);
                        if (syncNum > 0) {
                            this.syncScript();
                        } else {
                            MsgCenter.connect(SyncTaskEvent, 'pull');
                        }
                    });
                })
            }, () => {
                App.Log.Error("system", '网络错误,重启后重试', "设备同步拉取失败");
                chrome.storage.local.remove(['currentDevice']);
            });

            getJson(Server + "api/v1/sync/" + items['currentDevice'] + '/subscribe/pull/0', async (resp) => {
                if (resp.code !== 0) {
                    App.Log.Error("system", resp.msg + ',重启后重试', "设备同步拉取失败");
                    chrome.storage.local.remove(['currentDevice']);
                    return
                }
                let data = <SyncData[]>resp.data.pull || [];
                // 订阅安装
                let map = new Map<string, SyncData>();
                for (const index in data) {
                    let v = data[index];
                    // 首次登录同步只处理更新的
                    if (v.action === "update") {
                        let newsub = await this.scriptManager.syncToSubscribe(v);
                        if (typeof newsub == "string") {
                            App.Log.Error("system", v.url! + ' ' + newsub, "订阅同步失败");
                            continue;
                        }
                        map.set(v.url!, v);
                        continue;
                    }
                }
                chrome.storage.local.set({
                    currentSubscribeSyncVersion: resp.data.version
                }, () => {
                    // 查询未同步的订阅
                    this.scriptManager.subscribeList(undefined).then(async list => {
                        let syncNum = 0;
                        for (const i in list) {
                            let item = list[i];
                            if (!map.has(item.url)) {
                                // push
                                await this.scriptManager.syncSubscribeTask(item.url, "update", item);
                                syncNum++;
                            }
                        }
                        InfoNotification('首次数据同步成功', `成功拉取${map.size}个订阅,有${syncNum}个订阅将自动同步`);
                        if (syncNum > 0) {
                            this.syncSubscribe();
                        } else {
                            MsgCenter.connect(SyncTaskEvent, 'pull');
                        }
                    });
                });
            }, () => {
                App.Log.Error("system", '网络错误,重启后重试', "设备同步拉取失败");
                chrome.storage.local.remove(['currentDevice']);
            });
        });
    }

    public loginDevice() {
        getJson(Server + "api/v1/sync/device", resp => {
            if (resp.code !== 0) {
                App.Log.Error("system", resp.msg + ',重启后重试', "设备登录失败");
                return;
            }
            chrome.storage.local.set({
                currentDevice: resp.data[0].id,
            }, async () => {
                this.firstSync();
            });
        }, () => {
            App.Log.Error("system", '网络或系统错误,重启后重试', "设备登录失败");
        });
    }

    public sync(): Promise<string> {
        return new Promise(async resolve => {
            let ret = await this.syncScript();
            if (ret != '同步成功') {
                return resolve(ret);
            }
            ret = await this.syncSubscribe();
            if (ret != '同步成功') {
                return resolve(ret);
            }
            return resolve(await this.syncSetting());
        });
    }

    public syncSetting(): Promise<string> {
        return new Promise(resolve => {
            // 先拉设置
            chrome.storage.local.get(['currentUser', 'currentDevice'], async items => {
                if (!items['currentUser']) {
                    resolve('未登录账号或者未选择设备');
                    return;
                }
                if (!items['currentDevice']) {
                    resolve('未选择设备');
                    return;
                }
                getJson(Server + "api/v1/sync/" + items['currentDevice'] + '/setting/pull', async (resp) => {
                    if (resp.code !== 0) {
                        App.Log.Error("system", resp.msg, "同步失败");
                        resolve("同步失败:" + resp.msg);
                        return
                    }
                    // 设置时间大于本地时间,进行覆盖,否则本地覆盖远端
                    if (resp.data.settingtime > SystemConfig.changetime) {
                        let setting = JSON.parse(resp.data.setting);
                        for (const key in setting) {
                            SystemConfig.set(key, setting[key]);
                        }
                        SystemConfig.changetime = resp.data.settingtime;
                        return resolve('同步成功');
                    }
                    let param = "setting=" + encodeURIComponent(JSON.stringify(SystemConfig.list())) + "&settingtime=" + SystemConfig.changetime;
                    put(Server + 'api/v1/sync/' + items['currentDevice'] + '/setting/push', param, (resp) => {
                        if (resp.code !== 0) {
                            resolve("同步失败:" + resp.msg);
                            App.Log.Error('system', resp.msg + ',数据push失败', '同步失败');
                            return;
                        }
                        return resolve('同步成功');
                    }, () => {
                        resolve("同步失败:网络错误,数据push失败");
                        App.Log.Error('system', '网络错误,数据push失败', '同步失败');
                    });
                }, () => {
                    resolve("同步失败:网络错误,数据pull失败");
                    App.Log.Error('system', '网络错误,数据pull失败', '同步失败');
                });

            });
        });
    }

    public syncScript(): Promise<string> {
        return new Promise(resolve => {
            // 同步脚本
            chrome.storage.local.get(['currentUser', 'currentDevice', 'currentScriptSyncVersion'], async items => {
                if (!items['currentUser']) {
                    resolve('未登录账号或者未选择设备');
                    return;
                }
                if (!items['currentDevice']) {
                    resolve('未选择设备');
                    return;
                }
                let syncList = <Sync[]>await this.syncModel.list(this.syncModel.table.where({ user: items['currentUser'], device: items['currentDevice'], type: "script" }));
                let localMap = new Map<string, Sync>();
                for (const key in syncList) {
                    localMap.set(syncList[key].key, syncList[key]);
                }
                // pull与本地合并并检查变更中是否有pull
                getJson(Server + "api/v1/sync/" + items['currentDevice'] + '/script/pull/' + (items['currentScriptSyncVersion'] || 0), async (resp) => {
                    if (resp.code !== 0) {
                        App.Log.Error("system", resp.msg, "同步失败");
                        resolve("同步失败:" + resp.msg);
                        return
                    }
                    let data = <SyncData[]>resp.data.pull || [];
                    items['currentScriptSyncVersion'] = resp.data.version;
                    let flag = false;
                    for (const key in data) {
                        if (localMap.has(data[key].uuid!)) {
                            let localKey = data[key].uuid!;
                            // pull与本地的冲突,比对时间
                            if (localMap.get(localKey)!.createtime < data[key].actiontime) {
                                // 本地时间小于远端时间,删除覆盖本地记录
                                await this.scriptManager.syncToScript(data[key]);
                                localMap.delete(localKey);
                                await this.syncModel.delete(localMap.get(localKey)!.id);
                                flag = true;
                            }
                            // 本地比远端大,不做处理,等待push
                            continue;
                        }
                        // 同步到本地
                        this.scriptManager.syncToScript(data[key]);
                    }
                    if (flag) {
                        MsgCenter.connect(SyncTaskEvent, 'pull');
                    }
                    if (localMap.size <= 0) {
                        resolve("同步成功");
                        return;
                    }
                    chrome.storage.local.set({
                        currentScriptSyncVersion: items['currentScriptSyncVersion']
                    }, () => {
                        // push数据
                        let push: SyncData[] = [];
                        localMap.forEach(val => {
                            push.push(val.data);
                        });
                        putJson(Server + 'api/v1/sync/' + items['currentDevice'] + '/script/push/' + (items['currentScriptSyncVersion'] || 0), push, async (resp) => {
                            if (resp.code !== 0) {
                                resolve("同步失败:" + resp.msg);
                                App.Log.Error('system', resp.msg + ',数据push失败', '同步失败');
                                return;
                            }
                            let success = 0, error = 0;
                            for (const index in <SyncData[]>resp.data.push) {
                                let item = resp.data.push[index];
                                if (item.action == 'ok') {
                                    await this.syncModel.delete(localMap.get(push[index].uuid!)!.id);
                                    success++;
                                } else {
                                    error++;
                                }
                            }
                            if (success || error) {
                                App.Log.Info('system', `${success}个脚本同步成功,${error}个脚本同步失败`, '同步成功');
                            }
                            items['currentScriptSyncVersion'] = resp.data.version;
                            chrome.storage.local.set({
                                currentScriptSyncVersion: items['currentScriptSyncVersion']
                            }, () => {
                                resolve("同步成功");
                            });
                        }, () => {
                            resolve("同步失败:网络错误,数据push失败");
                            App.Log.Error('system', '网络错误,数据push失败', '同步失败');
                        });
                    });
                }, () => {
                    resolve("同步失败:网络错误,数据pull失败");
                    App.Log.Error('system', '网络错误,数据pull失败', '同步失败');
                });
            });
        });
    }

    public syncSubscribe(): Promise<string> {
        return new Promise(resolve => {
            // 同步订阅
            chrome.storage.local.get(['currentUser', 'currentDevice', 'currentSubscribeSyncVersion'], async items => {
                if (!items['currentUser']) {
                    resolve('未登录账号或者未选择设备');
                    return;
                }
                if (!items['currentDevice']) {
                    resolve('未选择设备');
                    return;
                }
                let syncList = <Sync[]>await this.syncModel.list(this.syncModel.table.where({ user: items['currentUser'], device: items['currentDevice'], type: "subscribe" }));
                let localMap = new Map<string, Sync>();
                for (const key in syncList) {
                    localMap.set(syncList[key].key, syncList[key]);
                }
                // pull与本地合并并检查变更中是否有pull
                getJson(Server + "api/v1/sync/" + items['currentDevice'] + '/subscribe/pull/' + (items['currentSubscribeSyncVersion'] || 0), async (resp) => {
                    if (resp.code !== 0) {
                        App.Log.Error("system", resp.msg, "同步失败");
                        resolve("同步失败:" + resp.msg);
                        return
                    }
                    let data = <SyncData[]>resp.data.pull || [];
                    items['currentSubscribeSyncVersion'] = resp.data.version;
                    for (const key in data) {
                        if (localMap.has(data[key].url!)) {
                            let localKey = data[key].url!;
                            // pull与本地的冲突,比对时间
                            if (localMap.get(localKey)!.createtime < data[key].actiontime) {
                                // 本地时间小于远端时间,删除覆盖本地记录,不push
                                localMap.delete(localKey);
                                await this.syncModel.delete(localMap.get(localKey)!.id);
                                await this.scriptManager.syncToSubscribe(data[key]);
                            }
                            // 本地比远端大,不做处理,等待push
                            continue;
                        }
                        await this.scriptManager.syncToSubscribe(data[key]);
                    }
                    if (data.length) {
                        MsgCenter.connect(SyncTaskEvent, 'pull');
                    }
                    if (localMap.size <= 0) {
                        resolve("同步成功");
                        return;
                    }
                    chrome.storage.local.set({
                        currentSubscribeSyncVersion: items['currentSubscribeSyncVersion']
                    }, () => {
                        // push数据
                        let push: SyncData[] = [];
                        localMap.forEach(val => {
                            push.push(val.data);
                        });
                        putJson(Server + 'api/v1/sync/' + items['currentDevice'] + '/subscribe/push/' + (items['currentSubscribeSyncVersion'] || 0), push, async (resp) => {
                            if (resp.code !== 0) {
                                resolve("同步失败:" + resp.msg);
                                App.Log.Error('system', resp.msg + ',数据push失败', '同步失败');
                                return;
                            }
                            let success = 0, error = 0;
                            for (const index in <SyncData[]>resp.data.push) {
                                let item = resp.data.push[index];
                                if (item.action == 'ok') {
                                    await this.syncModel.delete(localMap.get(push[index].url!)!.id);
                                    success++;
                                } else {
                                    error++;
                                }
                            }
                            if (success || error) {
                                App.Log.Info('system', `${success}个订阅同步成功,${error}个订阅同步失败`, '同步成功');
                            }
                            items['currentSubscribeSyncVersion'] = resp.data.version;
                            chrome.storage.local.set({
                                currentSubscribeSyncVersion: items['currentSubscribeSyncVersion']
                            }, () => {
                                resolve("同步成功");
                            });
                        }, () => {
                            resolve("同步失败:网络错误,数据push失败");
                            App.Log.Error('system', '网络错误,数据push失败', '同步失败');
                        });
                    });
                }, () => {
                    resolve("同步失败:网络错误,数据pull失败");
                    App.Log.Error('system', '网络错误,数据pull失败', '同步失败');
                });
            });
        });
    }

}
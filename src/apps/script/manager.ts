import axios from 'axios';
import { MsgCenter } from '@App/apps/msg-center/msg-center';
import { AppEvent, ScriptExec, ScriptRunStatusChange, ScriptStatusChange, ScriptStop, ScriptUninstall, ScriptReinstall, ScriptValueChange, TabRemove, RequestTabRunScript, ScriptInstall, RequestInstallInfo, ScriptCheckUpdate, RequestConfirmInfo, ListenGmLog, SubscribeUpdate, Unsubscribe, SubscribeCheckUpdate, OpenImportFileWindow, RequestImportFile, ScriptInstallByURL } from '@App/apps/msg-center/event';
import { dealScript, get, InfoNotification, randomString } from '@App/pkg/utils/utils';
import { App } from '../app';
import { UrlMatch } from '@App/pkg/match';
import { ValueModel } from '@App/model/value';
import { ResourceManager } from '../resource';
import { ScriptCache, Script, SCRIPT_STATUS_ENABLE, SCRIPT_STATUS_DISABLE, SCRIPT_TYPE_CRONTAB, SCRIPT_TYPE_BACKGROUND, SCRIPT_RUN_STATUS_RUNNING, SCRIPT_RUN_STATUS_COMPLETE, SCRIPT_TYPE_NORMAL, SCRIPT_STATUS_ERROR, SCRIPT_RUN_STATUS_RETRY, SCRIPT_RUN_STATUS_ERROR, SCRIPT_STATUS_DELETE, Metadata } from '@App/model/do/script';
import { Value } from '@App/model/do/value';
import { ScriptModel } from '@App/model/script';
import { Background } from './background';
import { copyScript, loadScriptByUrl, parseMetadata } from './utils';
import { ScriptUrlInfo } from '../msg-center/structs';
import { ConfirmParam } from '../grant/interface';
import { ScriptController } from './controller';
import { v5 as uuidv5 } from 'uuid';
import { Subscribe } from '@App/model/do/subscribe';
import { SubscribeModel } from '@App/model/subscribe';
import { SyncModel } from '@App/model/sync';
import { SyncAction, SyncData } from '@App/model/do/sync';
import { v4 as uuidv4 } from 'uuid';
import { Manager } from '@App/pkg/apps/manager';
import { SystemConfig } from '@App/pkg/config';
import Dexie from 'dexie';

// 脚本管理器,收到控制器消息进行实际的操作
export class ScriptManager extends Manager {

    protected scriptModel = new ScriptModel();
    protected subscribeModel = new SubscribeModel();
    protected background = new Background();
    protected controller = new ScriptController();

    protected match = new UrlMatch<ScriptCache>();

    protected valueModel = new ValueModel();
    protected syncModel = new SyncModel();

    protected resource = new ResourceManager();

    protected changePort = new Map<any, chrome.runtime.Port[]>();
    public listenEvent() {
        // 监听值修改事件,并发送给全局
        AppEvent.listener(ScriptValueChange, (msg: any) => {
            const handler = async () => {
                const { model, tabid } = <{ model: Value, tabid: number }>msg;
                let vals: { [key: string]: Value } = {};
                let key = '';
                if (model.storageName) {
                    key = 'value:storagename:' + model.storageName;
                    vals = await App.Cache.get(key);
                } else {
                    key = 'value:' + model.scriptId.toString();
                    vals = await App.Cache.get(key);
                }
                if (!vals) {
                    vals = {};
                    await App.Cache.set(key, vals);
                }
                if (model.value === undefined) {
                    delete vals[model.key]
                } else {
                    vals[model.key] = model;
                }
                this.changePort.forEach(val => {
                    val.forEach(val => {
                        val.postMessage(model);
                    })
                })
                // 监听值修改事件,并发送给沙盒环境
                sandbox.postMessage({ action: ScriptValueChange, value: msg }, '*');
            }
            void handler();
        });
        MsgCenter.listener(ScriptValueChange, (msg, port) => {
            if (typeof msg == 'string') {
                let ports = this.changePort.get(port.sender?.tab?.id);
                if (!ports) {
                    ports = [];
                    ports.push(port);
                }
                this.changePort.set(port.sender?.tab?.id, ports);
                if (!port.sender?.frameId) {
                    port.onDisconnect.addListener(() => {
                        this.changePort.delete(port.sender?.tab?.id);
                    });
                }
            } else {
                AppEvent.trigger(ScriptValueChange, msg);
            }
        });
    }

    public listen() {

        // 消息监听处理
        this.listenerMessage(ScriptInstallByURL, this.installScriptByURL);
        this.listenerMessage(ScriptInstall, this.scriptInstall)
        this.listenerMessage(ScriptReinstall, this.scriptReinstall)
        this.listenerMessage(ScriptUninstall, (body) => { return this.scriptUninstall(body, false) })
        this.listenerMessage(ScriptStatusChange, this.scriptStatusChange);
        this.listenerMessage(ScriptExec, this.execScript);
        this.listenerMessage(ScriptStop, this.stopScript);
        this.listenerMessage(RequestInstallInfo, this.requestInstallInfo);
        this.listenerMessage(ScriptCheckUpdate, this.scriptCheckUpdate);
        this.listenerMessage(RequestConfirmInfo, this.requestConfirmInfo);

        this.listenerMessage(SubscribeUpdate, this.subscribe);
        this.listenerMessage(Unsubscribe, (body) => { return this.unsubscribe(body, false) });
        this.listenerMessage(SubscribeCheckUpdate, this.subscribeCheckUpdate);

        this.listenerMessage(OpenImportFileWindow, this.openImportFileWindow)
        this.listenerMessage(RequestImportFile, this.requestImportFile)

        // 监听事件,并转发
        this.listenerProxy(ListenGmLog);

        // 扩展事件监听操作
        this.listenScriptInstall();
    }

    public listenScriptInstall() {
        chrome.webRequest.onBeforeRequest.addListener(
            (req: chrome.webRequest.WebRequestBodyDetails) => {
                if (req.method != 'GET') {
                    return;
                }
                const hash = req.url
                    .split('#')
                    .splice(1)
                    .join('#');
                if (hash.indexOf('bypass=true') != -1) {
                    return;
                }
                this.installScriptByURL(req.url).catch(() => {
                    chrome.tabs.update(req.tabId, {
                        url: req.url + '#bypass=true',
                    });
                });
                return { redirectUrl: 'javascript:void 0' };
            },
            {
                urls: [
                    '*://*/*.user.js', 'https://*/*.user.sub.js', 'https://*/*.user.bg.js',
                ],
                types: ['main_frame'],
            },
            ['blocking'],
        );
    }

    public async installScriptByURL(url: string) {
        return new Promise(async (resolve, reject) => {
            const info = await loadScriptByUrl(url);
            if (info) {
                App.Cache.set('install:info:' + info.uuid, info);
                chrome.tabs.create({
                    url: 'install.html?uuid=' + info.uuid,
                });
                resolve(true);
            } else {
                reject(false);
            }
        });
    }

    // 监听来自AppEvent的事件和连接来自其它地方的长链接,转发AppEvent的事件
    public listenerProxy(topic: string, callback?: (msg: any) => any) {
        // 暂时只支持一个连接
        const conns = new Map<string, chrome.runtime.Port>();
        MsgCenter.listener(topic, (msg: any, port: chrome.runtime.Port) => {
            const rand = randomString(8);
            conns.set(rand, port);
            port.onDisconnect.addListener(() => {
                conns.delete(rand);
            });
        });
        AppEvent.listener(topic, async (msg: any) => {
            if (callback) {
                msg = callback.call(this, msg);
                if (msg instanceof Promise) {
                    msg = await msg;
                }
            }
            conns.forEach(val => {
                val.postMessage(msg);
            });
        })
    }

    public requestConfirmInfo(uuid: string): Promise<ConfirmParam> {
        return new Promise(resolve => {
            const info = App.Cache.get('confirm:info:' + uuid);
            resolve(info);
        });
    }

    public requestInstallInfo(uuid: string): Promise<ScriptUrlInfo> {
        return new Promise(resolve => {
            const info = App.Cache.get('install:info:' + uuid);
            resolve(info);
        });
    }

    public openImportFileWindow(file: { name: string, url: string }): Promise<any> {
        return new Promise(resolve => {
            // 打开导入窗口
            const uuid = uuidv4()
            void App.Cache.set('import:info:' + uuid, file);
            chrome.tabs.create({
                url: 'import.html?uuid=' + uuid,
                active: true,
            });
            resolve(true);
        });
    }

    public requestImportFile(uuid: string): Promise<any> {
        return new Promise(resolve => {
            const file = App.Cache.get('import:info:' + uuid);
            resolve(file);
        });
    }

    public subscribe(sub: Subscribe): Promise<number> {
        return new Promise(async resolve => {
            // 异步处理订阅
            const old = await this.subscribeModel.findByUrl(sub.url);
            await this.subscribeModel.save(sub);
            this.subscribeUpdate(sub, old, true);
            return resolve(sub.id);
        });
    }

    // 检查订阅规则是否改变,是否能够静默更新
    public checkUpdateRule(oldMeta: Metadata, newMeta: Metadata): boolean {
        //判断connect是否改变
        const oldConnect = new Map();
        const newConnect = new Map();
        oldMeta['connect'] && oldMeta['connect'].forEach(val => {
            oldConnect.set(val, 1);
        });
        newMeta['connect'] && newMeta['connect'].forEach(val => {
            newConnect.set(val, 1);
        });
        // 老的里面没有新的就需要用户确认了
        for (const key of newConnect.keys()) {
            if (!oldConnect.has(key)) {
                return false
            }
        }
        return true;
    }

    public unsubscribe(id: number, sync?: boolean): Promise<boolean> {
        return new Promise(async resolve => {
            const sub = await this.subscribeModel.findById(id);
            if (!sub) {
                return resolve(false);
            }
            // 删除相关联脚本
            for (const key in sub.scripts) {
                const script = await this.scriptModel.findByUUID(sub.scripts[key].uuid);
                if (script && script.subscribeUrl == sub.url) {
                    this.scriptUninstall(script.id, sync);
                }
            }
            await this.subscribeModel.delete(id);
            if (!sync) {
                this.syncSubscribeTask(sub.url, 'delete', sub);
            }
            return resolve(true);
        });
    }

    public subscribeCheckUpdate(subscribeId: number): Promise<boolean> {
        return new Promise(resolve => {
            const handler = async () => {
                const sub = await this.subscribeModel.findById(subscribeId);
                if (!sub) {
                    return resolve(false);
                }
                void this.subscribeModel.table.update(sub.id, { checktime: new Date().getTime() });
                axios.get(sub.url, {
                    responseType: 'text',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                }).then(async (response): Promise<[Subscribe, Subscribe] | null> => {
                    if (response.status != 200) {
                        App.Log.Warn('check subscribe', 'subscribe:' + sub.id.toString() + ' error: respond:' + response.statusText, sub.name);
                        return null;
                    }
                    const [newSub, oldSub] = await this.controller.prepareSubscribeByCode(<string>response.data, sub.url);
                    if (typeof oldSub == 'string') {
                        App.Log.Error('check subscribe', oldSub, sub.name);
                        return null;
                    }
                    if (!newSub) {
                        App.Log.Error('check subscribe', '未知错误', sub.name);
                        return null;
                    }
                    if (!sub.metadata['version']) {
                        sub.metadata['version'] = ['v0.0.0'];
                    }
                    if (!newSub.metadata['version']) {
                        return null;
                    }
                    const regexp = /[0-9]+/g
                    let oldVersion = sub.metadata['version'][0].match(regexp);
                    if (!oldVersion) {
                        oldVersion = ['0', '0', '0'];
                    }
                    const Version = newSub.metadata['version'][0].match(regexp);
                    if (!Version) {
                        App.Log.Warn('check subscribe', '订阅脚本version格式错误:' + sub.id.toString(), sub.name);
                        return null;
                    }
                    for (let i = 0; i < Version.length; i++) {
                        if (oldVersion[i] == undefined) {
                            return [newSub, sub];
                        }
                        if (parseInt(Version[i]) > parseInt(oldVersion[i])) {
                            return [newSub, sub];
                        }
                    }
                    return null;
                }).then(async (val: [Subscribe | undefined, Subscribe | undefined] | null) => {
                    // TODO: 解析了不知道多少次,有时间优化
                    if (val) {
                        // 规则通过静默更新,未通过打开窗口
                        const oldSub = <Subscribe>val[1], newSub = <Subscribe>val[0];
                        if (this.checkUpdateRule(oldSub.metadata, newSub.metadata)) {
                            void this.subscribeUpdate(newSub, oldSub);
                        } else {
                            const info = await loadScriptByUrl(sub.url);
                            if (info) {
                                void App.Cache.set('install:info:' + info.uuid, info);
                                chrome.tabs.create({
                                    url: 'install.html?uuid=' + info.uuid,
                                    active: false,
                                });
                            }
                        }
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }).catch((e: string) => {
                    resolve(false);
                    App.Log.Warn('check subscribe', 'subscribe:' + sub.id.toString() + ' error: ' + e, sub.name);
                });
            }
            void handler();
        });
    }


    public subscribeUpdate(sub: Subscribe, old: Subscribe | undefined, changeRule?: boolean): Promise<number> {
        return new Promise(resolve => {
            const handler = async () => {
                // 异步处理订阅
                const deleteScript = [];
                let addScript: string[] = [];
                const addScriptName = [];
                if (old) {
                    // 存在老订阅,与新订阅比较scripts找出要删除或者新增的脚本
                    sub.metadata['scripturl'].forEach(val => {
                        if (!old?.scripts[val]) {
                            // 老的不存在,新的存在,新增
                            addScript.push(val);
                        } else {
                            sub.scripts[val] = old.scripts[val];
                        }
                    });
                    for (const key in old.scripts) {
                        const script = await this.scriptModel.findByUUIDAndSubscribeUrl(old.scripts[key].uuid, sub.url);
                        if (script) {
                            if (!sub.scripts[key]) {
                                // 老的存在,新的不存在,删除
                                deleteScript.push(script.name);
                                void this.scriptUninstall(script.id);
                            } else if (changeRule) {
                                // 修改已有的connect,可能要考虑一下手动修改了connect的情况
                                script.selfMetadata['connect'] = sub.metadata['connect'];
                                void this.scriptReinstall(script);
                            }
                        }
                    }
                } else {
                    addScript = sub.metadata['scripturl'];
                }
                const error = [];
                for (let i = 0; i < addScript.length; i++) {
                    const url = addScript[i];
                    let script = await this.scriptModel.findByOriginAndSubscribeUrl(url, sub.url);
                    let oldscript;
                    if (!script) {
                        try {
                            [script, oldscript] = await this.controller.prepareScriptByUrl(url);
                            if (!script) {
                                App.Log.Error('subscribe', url + ':' + (<string>oldscript), sub.name + ' 订阅脚本安装失败')
                                error.push(url);
                                continue;
                            }
                        } catch (e) {
                            error.push(url);
                        }
                    }
                    if (script!.subscribeUrl && script!.subscribeUrl != sub.url) {
                        App.Log.Warn('subscribe', script!.name + '已被\"' + script!.subscribeUrl + '"订阅', sub.name + ' 订阅冲突');
                        continue;
                    }
                    script!.selfMetadata['connect'] = sub.metadata['connect'];
                    if (oldscript == undefined) {
                        script!.subscribeUrl = sub.url;
                        script!.status = SCRIPT_STATUS_ENABLE;
                        script!.id = await this.scriptInstall(script!);
                        addScriptName.push(script!.name);
                    }
                    sub.scripts[url] = {
                        uuid: script!.uuid,
                        url: url,
                    };
                }
                let msg = '';
                if (addScriptName.length) {
                    msg += '新增脚本:' + addScriptName.join(',') + '\n';
                }
                if (deleteScript.length) {
                    msg += '删除脚本:' + deleteScript.join(',') + '\n';
                }
                if (error.length) {
                    msg += '安装失败脚本:' + error.join(',');
                }
                await this.subscribeModel.save(sub);
                void this.syncSubscribeTask(sub.url, 'update', sub);
                if (!msg) {
                    return;
                }
                chrome.notifications.create({
                    type: 'basic',
                    title: sub.name + ' 订阅更新成功',
                    message: msg,
                    iconUrl: chrome.runtime.getURL('assets/logo.png')
                });
                App.Log.Info('subscribe', msg, sub.name + ' 订阅更新成功')
                return resolve(sub.id);
            }
            void handler();
        });
    }

    public scriptInstall(script: Script): Promise<number> {
        return new Promise(async resolve => {
            // 加载资源
            await this.scriptModel.save(script);
            await this.loadResouce(script);
            if (script.status == SCRIPT_STATUS_ENABLE) {
                await this.enableScript(script);
            }
            // 设置同步任务
            this.syncScriptTask(script.uuid, 'update', script);
            return resolve(script.id);
        });
    }

    public scriptReinstall(script: Script): Promise<boolean> {
        return new Promise(resolve => {
            const handler = async () => {
                const oldScript = await this.scriptModel.findById(script.id);
                if (!oldScript) {
                    return resolve(false);
                }
                void App.Cache.del('script:grant:' + script.id.toString());
                copyScript(script, oldScript);
                script.updatetime = new Date().getTime();
                // 加载资源
                await this.loadResouce(script);
                if (script.status == SCRIPT_STATUS_ENABLE) {
                    await this.disableScript(oldScript);
                    await this.enableScript(script);
                } else {
                    await this.scriptModel.save(script);
                }
                // 设置同步任务
                void this.syncScriptTask(script.uuid, 'update', script);
                return resolve(true);
            }
            void handler();
        });
    }

    public async loadResouce(script: Script) {
        return new Promise(async resolve => {
            for (let i = 0; i < script.metadata['require']?.length; i++) {
                await this.resource.addResource(script.metadata['require'][i], script.id);
            }
            for (let i = 0; i < script.metadata['require-css']?.length; i++) {
                await this.resource.addResource(script.metadata['require-css'][i], script.id);
            }
            for (let i = 0; i < script.metadata['resource']?.length; i++) {
                const split = script.metadata['resource'][i].split(/\s+/);
                if (split.length === 2) {
                    await this.resource.addResource(split[1], script.id);
                }
            }
            resolve(1);
        });
    }

    public scriptUninstall(scriptId: number, sync?: boolean): Promise<boolean> {
        return new Promise(resolve => {
            const handler = async () => {
                const script = await this.scriptModel.findById(scriptId);
                if (!script) {
                    return resolve(false);
                }
                if (script.status == SCRIPT_STATUS_ENABLE) {
                    await this.disableScript(script, true);
                } else {
                    script.status = SCRIPT_STATUS_DELETE;
                    AppEvent.trigger(ScriptStatusChange, script);
                }
                await this.scriptModel.delete(script.id);
                void App.Cache.del('script:grant:' + script.id.toString());
                //TODO:释放资源
                script.metadata['require']?.forEach((val: string) => {
                    void this.resource.deleteResource(val, script.id);
                });
                script.metadata['require-css']?.forEach((val: string) => {
                    void this.resource.deleteResource(val, script.id);
                });
                // 设置同步任务
                if (!sync) {
                    void this.syncScriptTask(script.uuid, 'delete');
                }
                return resolve(true);
            }
            void handler();
        });
    }

    public scriptStatusChange(msg: any): Promise<boolean> {
        return new Promise(async resolve => {
            const script = await this.scriptModel.findById(msg.scriptId);
            if (!script) {
                return resolve(false);
            }
            if (script.status == msg.status) {
                return resolve(true);
            }
            script.status = msg.status;
            if (script.status == SCRIPT_STATUS_ENABLE) {
                await this.enableScript(script);
            } else {
                await this.disableScript(script);
            }
            return resolve(true);
        });
    }

    public execScript(msg: any): Promise<boolean> {
        return new Promise(async resolve => {
            const script = await this.scriptModel.findById(msg.scriptId);
            if (!script) {
                return resolve(false);
            }
            if (script.type == SCRIPT_TYPE_CRONTAB || script.type == SCRIPT_TYPE_BACKGROUND) {
                await this.background.execScript(await this.controller.buildScriptCache(script), msg.isdebug);
                resolve(true);
            } else {
                resolve(false);
            }
        });
    }

    public stopScript(msg: any): Promise<boolean> {
        return new Promise(resolve => {
            const handler = async () => {
                const script = await this.scriptModel.findById(msg.scriptId);
                if (!script) {
                    return resolve(false);
                }
                if (script.type == SCRIPT_TYPE_CRONTAB || script.type == SCRIPT_TYPE_BACKGROUND) {
                    await this.background.stopScript(script, msg.isdebug);
                    void this.setRunComplete(script.id)
                    resolve(true);
                } else {
                    resolve(false);
                }
            }
            void handler();
        });
    }

    public listenScriptMath() {
        // 监听脚本改变 更新数据
        AppEvent.listener(ScriptStatusChange, (script: Script) => {
            const handler = async () => {
                if (script && script.type !== SCRIPT_TYPE_NORMAL) {
                    return;
                }
                this.match.del(<ScriptCache>script);
                if (script.status == SCRIPT_STATUS_DELETE) {
                    return;
                }
                const cache = await this.controller.buildScriptCache(script);
                cache.code = dealScript(`window['${cache.flag}']=function(GM_info, context){\n` + cache.code + '\n}');
                script.metadata['match']?.forEach(val => {
                    this.match.add(val, cache);
                });
                script.metadata['include']?.forEach(val => {
                    this.match.add(val, cache);
                });
                script.metadata['exclude']?.forEach(val => {
                    this.match.exclude(val, cache);
                });
            }
            void handler();
        });
        // 初始化脚本数据
        const scriptFlag = randomString(8);
        void this.scriptList({ type: SCRIPT_TYPE_NORMAL }).then(items => {
            items.forEach(script => {
                const handler = async () => {
                    const cache = await this.controller.buildScriptCache(script);
                    cache.code = dealScript(`window['${cache.flag}']=function(context){\n` + cache.code + '\n}');
                    script.metadata['match']?.forEach(val => {
                        this.match.add(val, cache);
                    });
                    script.metadata['include']?.forEach(val => {
                        this.match.add(val, cache);
                    });
                    script.metadata['exclude']?.forEach(val => {
                        this.match.exclude(val, cache);
                    });
                }
                void handler();
            });
        });
        // 获取注入源码
        let injectedSource = '';
        get(chrome.runtime.getURL('src/injected.js'), (source: string) => {
            injectedSource = dealScript(`(function (ScriptFlag) {\n${source}\n})('${scriptFlag}')`);
        });
        const runMatchScript = new Map<number, Map<number, ScriptCache>>();
        // 收到前端消息注入脚本
        chrome.runtime.onMessage.addListener((msg, detail, send) => {
            if (msg !== 'runScript') {
                return;
            }
            if (!(detail.url && detail.tab && detail.tab.id)) {
                return;
            }
            const scripts = this.match.match(detail.url);
            const filter: ScriptCache[] = [];

            let matchScript = runMatchScript.get(detail.tab.id);
            if (!matchScript || !detail.frameId) {
                matchScript = new Map();
                runMatchScript.set(detail.tab.id, matchScript);
            }
            scripts.forEach(script => {
                matchScript!.set(script.id, script);
                if (script.status !== SCRIPT_STATUS_ENABLE) {
                    return;
                }
                if (script.metadata['noframes']) {
                    if (detail.frameId != 0) {
                        return;
                    }
                }
                filter.push(script);
            });
            // 注入框架
            void chrome.tabs.executeScript(detail.tab.id, {
                frameId: detail.frameId,
                code: `(function(){
                    let temp = document.createElement('script');
                    temp.setAttribute('type', 'text/javascript');
                    temp.innerHTML = "` + injectedSource + `";
                    temp.className = "injected-js";
                    document.documentElement.appendChild(temp)
                    temp.remove();
                }())`,
                runAt: 'document_start',
            });
            // 发送脚本
            send({ scripts: filter, flag: scriptFlag });
            if (!filter.length) {
                return;
            }
            // 角标和脚本
            chrome.browserAction.getBadgeText({
                tabId: detail.tab?.id,
            }, res => {
                void chrome.browserAction.setBadgeText({
                    text: (filter.length + (parseInt(res) || 0)).toString(),
                    tabId: detail.tab?.id,
                });
            });

            void chrome.browserAction.setBadgeBackgroundColor({
                color: [255, 0, 0, 255],
                tabId: detail.tab?.id,
            });
            filter.forEach(script => {
                // 注入实际脚本
                let runAt = 'document_idle';
                if (script.metadata['run-at']) {
                    runAt = script.metadata['run-at'][0];
                }
                switch (runAt) {
                    case 'document-body':
                    case 'document-menu':
                    case 'document-start':
                        runAt = 'document_start';
                        break;
                    case 'document-end':
                        runAt = 'document_end';
                        break;
                    case 'document-idle':
                        runAt = 'document_idle';
                        break;
                    default:
                        runAt = 'document_idle';
                        break;
                }
                void chrome.tabs.executeScript(detail.tab!.id!, {
                    frameId: detail.frameId,
                    code: `(function(){
                        let temp = document.createElement('script');
                        temp.setAttribute('type', 'text/javascript');
                        temp.innerHTML = "` + script.code + `";
                        temp.className = "injected-js";
                        document.documentElement.appendChild(temp)
                        temp.remove();
                    }())`,
                    runAt: runAt,
                });
            });
        });
        const runMenu = new Map<number, { [key: number]: Array<any> }>();
        const bgMenu: { [key: number]: Array<any> } = {};
        AppEvent.listener('GM_registerMenuCommand', msg => {
            const param = msg.param;
            if (msg.type == 'frontend') {
                let tabMenus = runMenu.get(param.tabId);
                if (!tabMenus) {
                    tabMenus = {};
                }
                let scriptMenu = tabMenus[param.scriptId];
                if (!scriptMenu) {
                    scriptMenu = [];
                }
                //name去重
                for (let i = 0; i < scriptMenu.length; i++) {
                    if (scriptMenu[i].name == param.name) {
                        return;
                    }
                }
                scriptMenu.push(param);
                tabMenus[param.scriptId] = scriptMenu;
                runMenu.set(param.tabId, tabMenus);
            } else {
                let scriptMenu = bgMenu[param.scriptId];
                if (!scriptMenu) {
                    scriptMenu = [];
                }
                for (let i = 0; i < scriptMenu.length; i++) {
                    if (scriptMenu[i].name == param.name) {
                        return;
                    }
                }
                scriptMenu.push(param);
                bgMenu[param.scriptId] = scriptMenu;
            }
        });
        AppEvent.listener('GM_unregisterMenuCommand', msg => {
            const param = msg.param;
            let scriptMenu: any[] = [];
            if (msg.type == 'frontend') {
                const tabMenus = runMenu.get(param.tabId);
                if (tabMenus) {
                    scriptMenu = tabMenus[param.scriptId];
                }
            } else {
                scriptMenu = bgMenu[param.scriptId];
            }
            for (let i = 0; i < scriptMenu.length; i++) {
                if (scriptMenu[i].id == param.id) {
                    scriptMenu.splice(i, 1);
                }
            }
        });
        chrome.tabs.onRemoved.addListener((tabId, info) => {
            runMatchScript.delete(tabId);
            runMenu.delete(tabId);
            AppEvent.trigger(TabRemove, tabId);
        });
        chrome.tabs.onUpdated.addListener((tabId, info) => {
            if (info.status == 'loading' && !info.url) {
                runMenu.delete(tabId);
                AppEvent.trigger(TabRemove, tabId);
                return;
            }
        });
        this.listenerMessage(RequestTabRunScript, (val: { url: string, tabId: number }) => {
            const run = this.match.match(val.url);
            const scripts = runMatchScript.get(val.tabId);
            if (scripts) {
                const tmp = new Map();
                run.forEach(val => {
                    tmp.set(val.id, 1);
                });
                scripts.forEach((val, key) => {
                    if (!tmp.has(key)) {
                        run.unshift(val);
                    }
                });
            }
            return {
                run: run,
                runMenu: runMenu.get(val.tabId),
                bgMenu: bgMenu,
            }
        })
    }

    public enableScript(script: Script): Promise<boolean> {
        return new Promise(async resolve => {
            if (script.type == SCRIPT_TYPE_CRONTAB || script.type == SCRIPT_TYPE_BACKGROUND) {
                const ret = await this.background.enableScript(await this.controller.buildScriptCache(script));
                if (ret) {
                    script.error = ret;
                    script.status == SCRIPT_STATUS_ERROR;
                } else {
                    script.status = SCRIPT_STATUS_ENABLE;
                }
            } else {
                script.status = SCRIPT_STATUS_ENABLE;
                if (script.metadata['run-at'] && script.metadata['match'] && script.metadata['run-at'][0] == 'document-menu') {
                    // 处理menu类型脚本
                    chrome.contextMenus.create({
                        id: script.uuid,
                        title: script.name,
                        contexts: ['all'],
                        parentId: 'script-cat',
                        onclick: (info, tab) => {
                            // 通信发送
                            chrome.tabs.sendMessage(tab.id!, {
                                'action': ScriptExec, 'uuid': script.uuid,
                            });
                        },
                        documentUrlPatterns: script.metadata['match'],
                    });
                }
            }
            await this.scriptModel.save(script);
            AppEvent.trigger(ScriptStatusChange, script);
            return resolve(true);
        });
    }

    public disableScript(script: Script, isuninstall?: boolean): Promise<void> {
        return new Promise(async resolve => {
            if (isuninstall) {
                script.status = SCRIPT_STATUS_DELETE;
            } else {
                script.status = SCRIPT_STATUS_DISABLE;
            }
            if (script.type == SCRIPT_TYPE_CRONTAB || script.type == SCRIPT_TYPE_BACKGROUND) {
                await this.background.disableScript(script);
            } else {
                // 处理menu类型脚本
                if (script.metadata['run-at'] && script.metadata['run-at'][0] == 'document-menu') {
                    // 处理menu类型脚本
                    chrome.contextMenus.remove(script.uuid);
                }
            }
            await this.scriptModel.save(script);
            AppEvent.trigger(ScriptStatusChange, script);
            resolve();
        });
    }

    public scriptList(equalityCriterias: { [key: string]: any } | ((where: Dexie.Table) => Dexie.Collection) | undefined): Promise<Array<Script>> {
        return new Promise(async resolve => {
            if (equalityCriterias == undefined) {
                resolve(await this.scriptModel.list(this.scriptModel.table));
            } else if (typeof equalityCriterias == 'function') {
                const ret = (await this.scriptModel.list(equalityCriterias(this.scriptModel.table)));
                resolve(ret);
            } else {
                resolve(await this.scriptModel.list(this.scriptModel.table.where(equalityCriterias)));
            }
        });
    }

    public subscribeList(equalityCriterias: { [key: string]: any } | ((where: Dexie.Table) => Dexie.Collection) | undefined): Promise<Array<Subscribe>> {
        return new Promise(async resolve => {
            if (equalityCriterias == undefined) {
                resolve(await this.subscribeModel.list(this.subscribeModel.table));
            } else if (typeof equalityCriterias == 'function') {
                const ret = (await this.subscribeModel.list(equalityCriterias(this.subscribeModel.table)));
                resolve(ret);
            } else {
                resolve(await this.subscribeModel.list(this.subscribeModel.table.where(equalityCriterias)));
            }
        });
    }

    public getScript(id: number): Promise<Script | undefined> {
        return this.scriptModel.findById(id);
    }

    public getScriptSelfMeta(id: number): Promise<Script | undefined> {
        return new Promise(resolve => {
            const handler = async () => {
                const script = await this.getScript(id);
                if (!script) {
                    return resolve(undefined);
                }
                // 自定义配置
                for (const key in script.selfMetadata) {
                    script.metadata[key] = script.selfMetadata[key];
                }
                return resolve(script);
            }
            void handler()
        });
    }

    // 设置脚本最后一次运行时间
    public setLastRuntime(id: number, time: number): Promise<boolean> {
        return new Promise(async resolve => {
            this.scriptModel.table.update(id, {
                lastruntime: time, runStatus: SCRIPT_RUN_STATUS_RUNNING
            })
            MsgCenter.connect(ScriptRunStatusChange, [id, SCRIPT_RUN_STATUS_RUNNING]);
            resolve(true);
        });
    }

    // 设置脚本运行错误
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

    // 设置脚本运行完成
    public setRunComplete(id: number): Promise<boolean> {
        return new Promise(async resolve => {
            this.scriptModel.table.update(id, { error: '', runStatus: SCRIPT_RUN_STATUS_COMPLETE })
            MsgCenter.connect(ScriptRunStatusChange, [id, SCRIPT_RUN_STATUS_COMPLETE]);
            resolve(true);
        });
    }

    // 检查脚本更新
    public scriptCheckUpdate(scriptId: number): Promise<boolean> {
        return new Promise(resolve => {
            const handler = async () => {
                const script = await this.getScript(scriptId);
                if (!script) {
                    return resolve(false);
                }
                if (!script.checkupdate_url) {
                    return resolve(false);
                }
                void this.scriptModel.table.update(script.id, { checktime: new Date().getTime() });
                axios.get(script.checkupdate_url, {
                    responseType: 'text',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                }).then(async (response): Promise<[Script, Script] | null> => {
                    if (response.status != 200) {
                        App.Log.Warn('check update', 'script:' + script.id.toString() + ' error: respond:' + response.statusText, script.name);
                        return null;
                    }
                    const [newScript, oldScript] = await this.controller.prepareScriptByCode(<string>response.data, script.download_url, script.uuid);
                    if (typeof oldScript == 'string') {
                        App.Log.Error('check update', oldScript, script.name);
                        return null;
                    }
                    if (!newScript) {
                        App.Log.Error('check update', '未知错误', script.name);
                        return null;
                    }
                    if (!script.metadata['version']) {
                        script.metadata['version'] = ['0.0.0'];
                    }
                    if (!newScript.metadata['version']) {
                        return null;
                    }
                    const regexp = /[0-9]+/g
                    let oldVersion = script.metadata['version'][0].match(regexp);
                    if (!oldVersion) {
                        oldVersion = ['0', '0', '0'];
                    }
                    const Version = newScript.metadata['version'][0].match(regexp);
                    if (!Version) {
                        App.Log.Warn('check update', 'script:' + script.id.toString() + ' error: version format', script.name);
                        return null;
                    }
                    for (let i = 0; i < Version.length; i++) {
                        if (oldVersion[i] == undefined) {
                            return [newScript, script];
                        }
                        if (parseInt(Version[i]) > parseInt(oldVersion[i])) {
                            return [newScript, script];
                        }
                    }
                    return null;
                }).then(async (val) => {
                    if (val) {
                        // 规则通过静默更新,未通过打开窗口
                        const oldInfo = val[1], newScript = val[0];
                        if (SystemConfig.silence_update_script && this.checkUpdateRule(oldInfo.metadata, newScript.metadata)) {
                            // 之前加载的是updateurl的内容,重载downloadurl
                            const [newScript, oldScript] = await this.controller.prepareScriptByUrl(script.download_url || script.origin);
                            if (typeof oldScript == 'string') {
                                App.Log.Error('check update', '更新脚本下载错误', script.name);
                                return resolve(false);
                            }
                            if (!newScript) {
                                App.Log.Error('check update', '未知错误', script.name);
                                return resolve(false);
                            }
                            void this.scriptReinstall(newScript);
                            InfoNotification('脚本更新 - ' + oldInfo.name, newScript.name + ' 更新到了 ' + (newScript.metadata['version'] && newScript.metadata['version'][0]))
                        } else {
                            const info = await loadScriptByUrl(script.download_url || script.origin);
                            if (info) {
                                info.url = script.origin;
                                info.uuid = uuidv5(info.url, uuidv5.URL)
                                void App.Cache.set('install:info:' + info.uuid, info);
                                chrome.tabs.create({
                                    url: 'install.html?uuid=' + info.uuid,
                                    active: false,
                                });
                            }
                        }
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }).catch((e: string) => {
                    resolve(false);
                    App.Log.Warn('check update', 'script:' + script.id.toString() + ' error: ' + e, script.name);
                });
            }
            void handler();
        })
    }

    public syncToScript(syncdata: SyncData): Promise<Script | undefined | string> {
        return new Promise(resolve => {
            const handler = async () => {
                if (syncdata.action == 'update') {
                    // NOTE:同步安装逻辑与现有逻辑不同,差不多重新写了一遍
                    const sync = syncdata.script;
                    if (!sync) {
                        return resolve(undefined);
                    }
                    const [script, old] = await this.controller.prepareScriptByCode(sync.code, sync.origin, sync.uuid);
                    if (script == undefined) {
                        App.Log.Error('system', sync.uuid + ' ' + <string>old, '脚本同步失败');
                        return resolve(<string>old);
                    }
                    if (old) {
                        script.status = (<Script>old).status;
                        script.runStatus = (<Script>old).runStatus;
                    }
                    script.sort = sync.sort;
                    script.selfMetadata = JSON.parse(sync.self_meta) || {};
                    script.createtime = sync.createtime;
                    script.updatetime = sync.updatetime;
                    script.subscribeUrl = sync.subscribe_url
                    if (script.id) {
                        // 存在reinstall
                        void App.Cache.del('script:grant:' + script.id.toString());
                        await this.loadResouce(script);
                        if (script.status == SCRIPT_STATUS_ENABLE) {
                            await this.disableScript(<Script>old || script);
                            await this.enableScript(script);
                        } else {
                            await this.scriptModel.save(script);
                        }
                    } else {
                        // 不存在install
                        await this.scriptModel.save(script);
                        await this.loadResouce(script);
                        if (script.status == SCRIPT_STATUS_ENABLE) {
                            await this.enableScript(script);
                        }
                    }
                    return resolve(script);
                } else if (syncdata.action == 'delete') {
                    const script = await this.scriptModel.findByUUID(<string>syncdata.uuid);
                    if (script) {
                        void this.scriptUninstall(script.id, true);
                        return resolve(script);
                    }
                    return resolve(undefined);
                }
                return resolve('无操作');
            }
            void handler();
        });
    }

    public syncScriptTask(uuid: string, action: SyncAction, script?: Script): Promise<any> {
        return new Promise(resolve => {
            // 设置同步任务
            chrome.storage.local.get(['currentUser', 'currentDevice'], async (items) => {
                if (!items['currentUser'] || !items['currentDevice']) {
                    return resolve(1);
                }
                let sync = await this.syncModel.findByKey(uuid);
                const data: SyncData = {
                    action: action,
                    actiontime: new Date().getTime(),
                    uuid: uuid,
                };
                if (action == 'update') {
                    data.script = {
                        name: script!.name,
                        uuid: script!.uuid,
                        code: script!.code,
                        meta_json: JSON.stringify(script!.metadata),
                        self_meta: JSON.stringify(script!.selfMetadata),
                        origin: script!.origin,
                        sort: script!.sort,
                        subscribe_url: script!.subscribeUrl,
                        type: script!.type,
                        createtime: script!.createtime,
                        updatetime: script!.updatetime,
                    };
                }
                if (!sync) {
                    sync = {
                        id: 0,
                        key: uuid,
                        user: items['currentUser'],
                        device: items['currentDevice'],
                        type: 'script',
                        data: data,
                        createtime: new Date().getTime(),
                    };
                } else {
                    sync.data = data
                    sync.createtime = new Date().getTime();
                }
                await this.syncModel.save(sync);
                return resolve(1);
            });
        });
    }

    public syncSubscribeTask(url: string, action: SyncAction, subscribe?: Subscribe): Promise<any> {
        return new Promise(resolve => {
            // 设置同步任务
            chrome.storage.local.get(['currentUser', 'currentDevice'], async (items) => {
                if (!items['currentUser'] || !items['currentDevice']) {
                    return resolve(1);
                }
                let sync = await this.syncModel.findByKey(url);
                const data: SyncData = {
                    action: action,
                    actiontime: new Date().getTime(),
                    url: url,
                };
                if (action == 'update') {
                    data.subscribe = {
                        name: subscribe!.name,
                        url: subscribe!.url,
                        code: subscribe!.code,
                        meta_json: JSON.stringify(subscribe!.metadata),
                        scripts: JSON.stringify(subscribe!.scripts),
                        createtime: subscribe!.createtime,
                        updatetime: subscribe!.updatetime,
                    };
                }
                if (!sync) {
                    sync = {
                        id: 0,
                        key: url,
                        user: items['currentUser'],
                        device: items['currentDevice'],
                        type: 'subscribe',
                        data: data,
                        createtime: new Date().getTime(),
                    };
                } else {
                    sync.data = data
                    sync.createtime = new Date().getTime();
                }
                await this.syncModel.save(sync);
                return resolve(1);
            });
        });
    }

    public syncToSubscribe(syncdata: SyncData): Promise<Subscribe | undefined | string> {
        return new Promise(async resolve => {
            if (syncdata.action == 'update') {
                const sync = syncdata.subscribe;
                if (!sync) {
                    return resolve(undefined);
                }
                const [subscribe, old] = await this.controller.prepareSubscribeByCode(sync.code, sync.url);
                if (subscribe == undefined) {
                    App.Log.Error('system', sync.url + ' ' + old, '订阅同步失败');
                    return resolve(<string>old);
                }
                if (old) {
                    subscribe.status = (<Subscribe>old).status;
                }
                subscribe.scripts = JSON.parse(sync.scripts);
                subscribe.createtime = sync.createtime;
                subscribe.updatetime = sync.updatetime;
                // 订阅直接save即可,不需要安装等操作
                await this.subscribeModel.save(subscribe);
                return resolve(subscribe);
            } else if (syncdata.action == 'delete') {
                const sub = await this.subscribeModel.findOne({ url: syncdata.url });
                if (sub) {
                    // 订阅直接delete即可,不需要卸载等操作
                    await this.subscribeModel.delete(sub.id);
                    return resolve(sub);
                }
                return resolve(undefined);
            }
            return resolve('');
        });
    }

}

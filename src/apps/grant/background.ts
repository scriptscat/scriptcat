import { PermissionModel } from "@App/model/permission";
import { isFirefox } from "@App/pkg/utils";
import { App } from "../app";
import { AppEvent, PermissionConfirm, ScriptGrant, ScriptValueChange } from "../msg-center/event";
import { MsgCenter } from "../msg-center/msg-center";
import { ScriptManager } from "../script/manager";
import { Grant, Api, IPostMessage, IGrantListener, ConfirmParam, PermissionParam, FreedCallback } from "./interface";
import { v4 as uuidv4 } from "uuid"
import { ValueModel } from "@App/model/value";
import { LOGGER_LEVEL_INFO } from "@App/model/do/logger";
import { Permission } from "@App/model/do/permission";
import { SCRIPT_TYPE_CRONTAB, SCRIPT_TYPE_BACKGROUND, Script } from "@App/model/do/script";
import { Value } from "@App/model/do/value";

class postMessage implements IPostMessage {

    public port: chrome.runtime.Port;

    constructor(port: chrome.runtime.Port) {
        this.port = port;
    }

    public sender(): any {
        return this.port.sender;
    }

    public postMessage(msg: string): void {
        this.port.postMessage(msg);
    }

}

export class grantListener implements IGrantListener {
    public listen(callback: (msg: any, postMessage: IPostMessage) => Promise<any>): void {
        MsgCenter.listener(ScriptGrant, async (msg, port): Promise<any> => {
            return callback(msg, new postMessage(port));
        });
    }
}

export class BackgroundGrant {

    protected static apis = new Map<string, Api>();
    protected static freedCallback = new Map<string, FreedCallback>();
    protected static _singleInstance: BackgroundGrant;
    protected listener: IGrantListener;
    protected scriptMgr: ScriptManager;
    protected permissionModel: PermissionModel = new PermissionModel();
    protected valueModel = new ValueModel();
    protected rand = uuidv4();

    private constructor(scriptMgr: ScriptManager, listener: IGrantListener) {
        this.listener = listener;
        this.scriptMgr = scriptMgr;
        //处理xhrcookie的问题,firefox不支持
        try {
            chrome.webRequest.onBeforeSendHeaders.addListener((data) => {
                let setCookie = '';
                let cookie = '';
                let anonymous = false;
                let cookieIndex = -1;
                let requestHeaders: chrome.webRequest.HttpHeader[] = [];
                data.requestHeaders?.forEach((val, key) => {
                    switch (val.name.toLowerCase()) {
                        case "x-cat-" + this.rand + "-cookie": {
                            setCookie = val.value || '';
                            break;
                        }
                        case "x-cat-" + this.rand + "-anonymous": {
                            anonymous = true;
                            break;
                        }
                        case "cookie": {
                            cookieIndex = key;
                            cookie = val.value || '';
                            break;
                        }
                        default: {
                            requestHeaders.push(val);
                        }
                    }
                });
                if (anonymous) {
                    cookie = '';
                }
                if (setCookie) {
                    if (!cookie || cookie.endsWith(';')) {
                        cookie += setCookie;
                    } else {
                        cookie += ';' + setCookie;
                    }
                }
                cookie && requestHeaders.push({
                    name: 'cookie',
                    value: cookie
                });
                return {
                    requestHeaders: requestHeaders,
                }
            }, {
                urls: ["<all_urls>"],
            }, ["blocking", "requestHeaders", "extraHeaders"]);
        } catch (e) {
        }
    }

    // 单实例
    public static SingleInstance(scriptMgr: ScriptManager, listener: IGrantListener): BackgroundGrant {
        if (!BackgroundGrant._singleInstance) {
            BackgroundGrant._singleInstance = new BackgroundGrant(scriptMgr, listener);
        }
        return BackgroundGrant._singleInstance;
    }

    public static Instance(): BackgroundGrant {
        return BackgroundGrant._singleInstance;
    }

    // NOTE: 一大长串 尝试优化?
    public static GMFunction(permission: PermissionParam = {}) {
        return function (
            target: any,
            propertyName: string,
            descriptor: PropertyDescriptor
        ) {
            let old = descriptor.value;
            if (permission.listener) {
                permission.listener();
            }
            if (permission.freed) {
                BackgroundGrant.freedCallback.set(propertyName, permission.freed);
            }
            descriptor.value = function (grant: Grant, post: IPostMessage): Promise<any> {
                let _this: BackgroundGrant = <BackgroundGrant>this;
                return new Promise(async resolve => {
                    let script = await App.Cache.getOrSet('script:' + grant.id, () => {
                        return _this.scriptMgr.getScript(grant.id)
                    });
                    if (!script) {
                        return resolve(undefined);
                    }
                    App.Log.Debug("script", "call function: " + propertyName, script.name);
                    let metaGrant = script.metadata["grant"];
                    if (!permission.default) {
                        let flag = false;
                        for (let i = 0; i < metaGrant.length; i++) {
                            if (metaGrant[i] == propertyName) {
                                flag = true;
                                break;
                            }
                            if (permission.alias) {
                                for (let n = 0; n < permission.alias.length; n++) {
                                    if (permission.alias[n] == metaGrant[i]) {
                                        flag = true;
                                        break;
                                    }
                                }
                            }
                            if (flag) {
                                break;
                            }
                        }
                        if (!flag) {
                            return resolve(undefined);
                        }
                    }

                    if (permission.background && (script.type != SCRIPT_TYPE_CRONTAB && script.type != SCRIPT_TYPE_BACKGROUND)) {
                        return resolve(undefined);
                    }

                    if (permission.confirm) {
                        let confirm = await permission.confirm(grant, script);
                        if (confirm) {
                            let cacheKey = "permission:" + script.id + ":" + confirm.permissionValue + ":" + confirm.permission;
                            let ret = <Permission>await App.Cache.getOrSet(cacheKey, () => {
                                return new Promise(async resolve => {
                                    let ret = await _this.permissionModel.findOne({ scriptId: script?.id, permission: confirm?.permission, permissionValue: confirm?.permissionValue });
                                    if (!ret) {
                                        if (confirm?.wildcard) {
                                            ret = await _this.permissionModel.findOne({ scriptId: script?.id, permission: confirm?.permission, permissionValue: '*' });
                                        }
                                    }
                                    return resolve(ret);
                                });
                            });
                            if (ret) {
                                if (ret.allow) {
                                    return resolve(await old.apply(this, [grant, post, script]));
                                } else {
                                    //TODO:执行拒绝的提示
                                    return resolve(undefined);
                                }
                            }
                            //弹出页面确认
                            let uuid = uuidv4();
                            App.Cache.set("confirm:uuid:" + uuid, confirm);

                            let timeout = setTimeout(() => {
                                App.Cache.del("confirm:uuid:" + uuid);
                                MsgCenter.removeListener(PermissionConfirm + uuid, listener);
                            }, 30000);
                            let listener = async (param: any) => {
                                clearTimeout(timeout);
                                App.Cache.del("confirm:uuid:" + uuid);
                                MsgCenter.removeListener(PermissionConfirm + uuid, listener);
                                ret = {
                                    id: 0,
                                    scriptId: script?.id || 0,//愚蠢的自动提示。。。
                                    permission: confirm?.permission || '',
                                    permissionValue: '',
                                    allow: param.allow,
                                    createtime: new Date().getTime(),
                                    updatetime: 0,
                                };
                                switch (param.type) {
                                    case 4:
                                    case 2: {
                                        ret.permissionValue = '*';
                                        break;
                                    }
                                    case 5:
                                    case 3: {
                                        ret.permissionValue = confirm?.permissionValue || '';
                                        break;
                                    }
                                }
                                //临时 放入缓存
                                if (param.type >= 2) {
                                    App.Cache.set(cacheKey, ret);
                                }
                                //总是 放入数据库
                                if (param.type >= 4) {
                                    _this.permissionModel.save(ret);
                                }
                                if (param.allow) {
                                    return resolve(await old.apply(this, [grant, post, script]));
                                } else {
                                    return resolve(undefined);
                                }
                            }
                            MsgCenter.listener(PermissionConfirm + uuid, listener);

                            chrome.tabs.create({ url: chrome.runtime.getURL("confirm.html?uuid=" + uuid) });
                        } else {
                            return resolve(await old.apply(this, [grant, post, script]));
                        }
                    } else {
                        return resolve(await old.apply(this, [grant, post, script]));
                    }
                });
            }
            BackgroundGrant.apis.set(propertyName, descriptor.value);
        };
    }

    public listenScriptGrant() {
        this.listener.listen((msg, postMessage) => {
            return new Promise(async resolve => {
                let grant = <Grant>msg;
                if (!grant.value) {
                    return;
                }
                let api = BackgroundGrant.apis.get(grant.value);
                if (api == undefined) {
                    return resolve(undefined);
                }
                api.apply(this, [grant, postMessage]).then(result => {
                    if (grant.value == "CAT_runComplete" || (grant.value == "CAT_setRunError" && grant.params[0])) {
                        //执行完毕,释放资源
                        BackgroundGrant.freedCallback.forEach(v => {
                            v(grant);
                        });
                    }
                    resolve(result);
                }).catch(e => {
                    grant.error = 'GM_ERROR';
                    grant.errorMsg = e;
                    resolve(grant);
                });
            });
        });

    }


    protected dealXhr(config: GM_Types.XHRDetails, xhr: XMLHttpRequest): GM_Types.XHRResponse {
        let respond: GM_Types.XHRResponse = {
            readyState: <any>xhr.readyState,
            status: xhr.status,
            statusText: xhr.statusText,
            responseHeaders: xhr.getAllResponseHeaders(),
        };
        if (xhr.readyState === 4) {
            if (!config.responseType && xhr.getResponseHeader("Content-Type")?.indexOf("application/json") !== -1) {
                respond.response = JSON.parse(xhr.responseText);
            } else {
                respond.response = xhr.response;
            }
            respond.responseText = xhr.responseText;
            respond.responseXML = xhr.responseXML;
        }
        return respond;
    }

    //TODO:按照tampermonkey文档实现
    @BackgroundGrant.GMFunction({
        confirm: (grant: Grant, script: Script) => {
            return new Promise(resolve => {
                let config = <GM_Types.XHRDetails>grant.params[0];
                let url = new URL(config.url);
                if (script.metadata["connect"]) {
                    let connect = script.metadata["connect"];
                    for (let i = 0; i < connect.length; i++) {
                        if (url.hostname.endsWith(connect[i])) {
                            return resolve(undefined);
                        }
                    }
                }
                let ret: ConfirmParam = {
                    permission: 'cors',
                    permissionValue: url.host,
                    title: '脚本正在试图访问跨域资源',
                    metadata: {
                        "名称": script.name,
                        "请求域名": url.host,
                        "请求地址": config.url,
                    },
                    describe: '请您确认是否允许脚本进行此操作,脚本也可增加@connect标签跳过此选项',
                    wildcard: true,
                    permissionContent: '域名',
                };
                resolve(ret);
            });
        },
        alias: ['GM.fetch'],
    })
    protected GM_xmlhttpRequest(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            if (grant.params.length <= 0) {
                //错误
                return resolve(undefined);
            }
            let config = <GM_Types.XHRDetails>grant.params[0];

            let xhr = new XMLHttpRequest();
            xhr.open(config.method || 'GET', config.url);
            xhr.responseType = config.responseType || '';
            let _this = this;

            function deal(event: string) {
                let respond = _this.dealXhr(config, xhr);
                grant.data = { type: event, data: respond };
                post.postMessage(grant);
            }
            xhr.onload = (event) => {
                deal("load");
            }
            xhr.onloadstart = (event) => {
                deal("onloadstart");
            }
            xhr.onloadend = (event) => {
                deal("onloadstart");
            }
            xhr.onprogress = (event) => {
                let respond: GM_Types.XHRProgress = {
                    done: xhr.DONE,
                    lengthComputable: event.lengthComputable,
                    loaded: event.loaded,
                    total: event.total,
                    totalSize: event.total,
                };
                grant.data = { type: 'onprogress', data: respond };
                post.postMessage(grant);
            }
            xhr.onreadystatechange = (event) => {
                deal("onreadystatechange");
            }
            xhr.ontimeout = () => {
                grant.data = { type: 'ontimeout', data: "" };
                post.postMessage(grant);
            }
            for (const key in config.headers) {
                const val = config.headers[key];
                xhr.setRequestHeader(key, val);
            }
            if (config.timeout) {
                xhr.timeout = config.timeout;
            }
            if (config.cookie) {
                xhr.setRequestHeader("X-Cat-" + this.rand + "-Cookie", config.cookie);
            }
            if (config.anonymous) {
                xhr.setRequestHeader("X-Cat-" + this.rand + "-Anonymous", "true")
            }
            if (config.overrideMimeType) {
                xhr.overrideMimeType(config.overrideMimeType);
            }
            xhr.send(config.data);
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({
        background: true,
        confirm: (grant: Grant, script: Script) => {
            return new Promise(resolve => {
                let detail = <GM_Types.CookieDetails>grant.params[1];
                if (!detail.url || !detail.name) {
                    return resolve(undefined);
                }
                let url = new URL(detail.url);
                let ret: ConfirmParam = {
                    permission: 'cookie',
                    permissionValue: url.host,
                    title: '脚本正在试图访问网站cookie内容',
                    metadata: {
                        "名称": script.name,
                        "请求域名": url.host,
                    },
                    describe: '请您确认是否允许脚本进行此操作,cookie是一项重要的用户数据,请务必只给信任的脚本授权.',
                    permissionContent: 'Cookie域',
                };
                resolve(ret);
            });
        }
    })
    protected GM_cookie(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            let param = grant.params;
            if (param.length != 2) {
                return resolve(undefined);
            }
            let detail = <GM_Types.CookieDetails>grant.params[1];
            if (!detail.url || !detail.name) {
                return resolve(undefined);
            }
            switch (param[0]) {
                case 'list': {
                    chrome.cookies.getAll({
                        domain: detail.domain,
                        name: detail.name,
                        path: detail.path,
                        secure: detail.secure,
                        session: false,
                        url: detail.url,
                    }, (cookies) => {
                        grant.data = { type: 'done', data: cookies };
                        post.postMessage(grant);
                    });
                    break;
                }
            }
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction()
    protected GM_openInTab(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            let param: GM_Types.OpenTabOptions = grant.params[1] || {};
            chrome.tabs.create({
                url: grant.params[0],
                active: param.active || false,
            });
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({
        listener: () => {
            chrome.notifications.onClosed.addListener(async (id, user) => {
                let grant: Grant, post: IPostMessage;
                let ret = await App.Cache.get("GM_notification:" + id);
                if (ret) {
                    [grant, post] = ret;
                    grant.data = { type: 'done', id: id, user: user };
                    post.postMessage(grant);
                    App.Cache.del("GM_notification:" + id);
                }
            });
            chrome.notifications.onClicked.addListener(async (id) => {
                let grant: Grant, post: IPostMessage;
                [grant, post] = await App.Cache.get("GM_notification:" + id);
                if (grant) {
                    grant.data = { type: 'click', id: id, index: -1 };
                    post.postMessage(grant);
                }
            });
            chrome.notifications.onButtonClicked.addListener(async (id, buttonIndex) => {
                let grant: Grant, post: IPostMessage;
                [grant, post] = await App.Cache.get("GM_notification:" + id);
                if (grant) {
                    grant.data = { type: 'click', id: id, index: buttonIndex };
                    post.postMessage(grant);
                }
            });
        }
    })
    protected GM_notification(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            let params = grant.params;
            if (params.length == 0) {
                return resolve(undefined);
            }
            let details: GM_Types.NotificationDetails = params[0];
            let options: chrome.notifications.NotificationOptions = {
                title: details.title || 'ScriptCat',
                message: details.text,
                iconUrl: details.image || chrome.runtime.getURL("assets/logo.png"),
                type: details.progress === undefined ? 'basic' : 'progress',
                buttons: details.buttons,
            };
            if (!isFirefox()) {
                options.silent = details.silent;
            }

            chrome.notifications.create(options, (notificationId) => {
                App.Cache.set("GM_notification:" + notificationId, [grant, post]);
                grant.data = { type: 'create', id: notificationId };
                post.postMessage(grant);
                if (details.timeout) {
                    setTimeout(() => {
                        chrome.notifications.clear(notificationId);
                    }, details.timeout);
                }
            });
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction()
    protected GM_closeNotification(grant: Grant): Promise<any> {
        return new Promise(resolve => {
            chrome.notifications.clear(grant.params[0]);
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction()
    protected GM_updateNotification(grant: Grant): Promise<any> {
        return new Promise(resolve => {
            let id = grant.params[0];
            let details: GM_Types.NotificationDetails = grant.params[1];
            let options: chrome.notifications.NotificationOptions = {
                title: details.title,
                message: details.text,
                iconUrl: details.image,
                type: details.progress === undefined ? 'basic' : 'progress',
                progress: Math.round(details.progress || 0),
            };
            if (!isFirefox()) {
                options.silent = details.silent;
            }
            chrome.notifications.update(id, options);
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({ default: true, background: true })
    protected CAT_setLastRuntime(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            this.scriptMgr.setLastRuntime(grant.id, grant.params[0]);
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({ default: true, background: true })
    protected CAT_setRunError(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            this.scriptMgr.setRunError(grant.id, grant.params[0], grant.params[1]);
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({ default: true, background: true })
    protected CAT_runComplete(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            this.scriptMgr.setRunComplete(grant.id);
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({ default: true })
    protected GM_log(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            if (!grant.params[0]) {
                return resolve(undefined);
            }
            App.Log.Logger(grant.params[1] ?? LOGGER_LEVEL_INFO, 'GM_log', grant.params[0], grant.name);
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction()
    protected GM_setValue(grant: Grant, post: IPostMessage, script?: Script): Promise<any> {
        //getValue直接从缓存中返回了,无需编写
        return new Promise(async resolve => {
            let [key, value] = grant.params;
            let model: Value | undefined;
            if (script?.namespace) {
                model = await this.valueModel.findOne({ namespace: script.namespace, key: key });
            } else {
                model = await this.valueModel.findOne({ scriptId: script?.id, key: key });
            }
            if (!model) {
                model = {
                    id: 0,
                    scriptId: script?.id || 0,
                    namespace: script?.namespace || '',
                    key: key,
                    value: value,
                    createtime: new Date().getTime()
                }
            } else {
                model.value = value;
            }

            if (value === undefined) {
                this.valueModel.delete(model!.id);
                AppEvent.trigger(ScriptValueChange, model);
                return resolve(undefined);
            }

            this.valueModel.save(model);
            AppEvent.trigger(ScriptValueChange, model);
            resolve(undefined);
        })
    }

    protected static proxyRule = new Map<number, CAT_Types.ProxyRule[] | string>();
    protected static buildProxyPACScript(): string {
        let ret = 'function FindProxyForURL(url, host) {\nlet ret;';
        BackgroundGrant.proxyRule.forEach((val, key) => {
            if (typeof val == 'string') {
                ret += `\nfunction pac${key}(){\n${val}\nreturn FindProxyForURL(url,host)}\nret=pac${key}();if(ret && ret!='DIRECT'){return ret;}`;
            } else {
                val.forEach(val => {
                    val.matchUrl.forEach(url => {
                        let regex = url;
                        if (regex.indexOf('*') === -1) {
                            regex = regex.replaceAll('.', '\\.');
                            if (regex.indexOf('.') === 1 || regex.indexOf('//.') !== -1) {
                                regex = regex.replace('\\.', '(?:^|www)\\.');
                            }
                        } else {
                            regex = regex.replaceAll('.', '\\.');
                            regex = regex.replace('*', '(?:^|.*?)')
                        }
                        regex = regex.replaceAll('/', '\\/');
                        ret += `if(/${regex}/.test(url)){return "${val.proxyServer.scheme?.toUpperCase() || 'HTTP'} ${val.proxyServer.host}` + (val.proxyServer.port ? ':' + val.proxyServer.port : '') + `"}\n`;
                    });
                });
            }
        });
        return ret + '\nreturn "DIRECT"}';
    }

    protected static freedProxy(id: number) {
        BackgroundGrant.proxyRule.delete(id);
        if (BackgroundGrant.proxyRule.size == 0) {
            return chrome.proxy.settings.clear({});
        }
        chrome.proxy.settings.set({
            value: {
                mode: 'pac_script',
                pacScript: {
                    data: BackgroundGrant.buildProxyPACScript(),
                }
            }
        });
    }

    @BackgroundGrant.GMFunction({
        background: true,
        freed: (grant: Grant) => {
            BackgroundGrant.freedProxy(grant.id);
        }
    })
    protected CAT_setProxy(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            BackgroundGrant.proxyRule.set(grant.id, grant.params[0]);
            App.Log.Debug("background", "enable proxy", grant.name);
            chrome.proxy.settings.set({
                value: {
                    mode: 'pac_script',
                    pacScript: {
                        data: BackgroundGrant.buildProxyPACScript(),
                    }
                }
            });
            resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({ background: true })
    protected CAT_clearProxy(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            BackgroundGrant.freedProxy(grant.id);
            resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction()
    public CAT_click(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            let target = { tabId: (<chrome.runtime.MessageSender>post.sender()).tab?.id };
            let param = grant.params;
            chrome.debugger.getTargets(result => {
                let flag = false;
                for (let i = 0; i < result.length; i++) {
                    if (result[i].tabId == target.tabId) {
                        flag = result[i].attached;
                        break;
                    }
                }
                if (flag) {
                    chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x: param[0], y: param[1], button: "left", clickCount: 1 }, (result) => {
                        chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x: param[0], y: param[1], button: "left", clickCount: 1 }, (result) => {
                        });
                    });
                } else {
                    chrome.debugger.attach(target, '1.2', () => {
                        chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x: param[0], y: param[1], button: "left", clickCount: 1 }, (result) => {
                            chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x: param[0], y: param[1], button: "left", clickCount: 1 }, (result) => {
                            });
                        });
                    });
                }
            });
            resolve(undefined);
        });
    }

    protected static textarea: HTMLElement = document.createElement('textarea');
    protected static clipboardData: any;
    @BackgroundGrant.GMFunction({
        listener: () => {
            document.body.appendChild(BackgroundGrant.textarea);
            document.addEventListener('copy', (e: ClipboardEvent) => {
                e.preventDefault();
                let { type, data } = BackgroundGrant.clipboardData;
                (<any>e).clipboardData.setData(type || 'text/plain', data);
            })
        }
    })
    public GM_setClipboard(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            BackgroundGrant.clipboardData = {
                type: grant.params[1],
                data: grant.params[0]
            };
            BackgroundGrant.textarea.focus();
            document.execCommand('copy', false, <any>null);
            resolve(undefined);
        });
    }
}

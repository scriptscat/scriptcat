import { LOGGER_LEVEL_INFO } from "@App/model/logger";
import { Permission, PermissionModel } from "@App/model/permission";
import { Script, SCRIPT_TYPE_CRONTAB } from "@App/model/script";
import { isFirefox } from "@App/pkg/utils";
import axios from "axios";
import { App } from "../app";
import { PermissionConfirm, ScriptGrant } from "../msg-center/event";
import { MsgCenter } from "../msg-center/msg-center";
import { ScriptManager } from "../script/manager";
import { Grant, Api, IPostMessage, IGrantListener, ConfirmParam, PermissionParam } from "./interface";
import { v4 as uuidv4 } from "uuid"

class postMessage implements IPostMessage {

    public port: chrome.runtime.Port;

    constructor(port: chrome.runtime.Port) {
        this.port = port;
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
    protected static _singleInstance: BackgroundGrant;
    protected listener: IGrantListener;
    protected scriptMgr: ScriptManager;
    protected permissionModel: PermissionModel = new PermissionModel();

    private constructor(scriptMgr: ScriptManager, listener: IGrantListener) {
        this.listener = listener;
        this.scriptMgr = scriptMgr;
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
            descriptor.value = function (grant: Grant, post: IPostMessage): Promise<any> {
                let _this: BackgroundGrant = <BackgroundGrant>this;
                return new Promise(async resolve => {
                    //TODO: 权限错误提示
                    let script = await _this.scriptMgr.getScript(grant.id);
                    if (!script) {
                        return resolve(undefined);
                    }
                    let metaGrant = script.metadata["grant"];
                    if (!metaGrant) {
                        return resolve(undefined);
                    }
                    if (!permission.default) {
                        let flag = false;
                        for (let i = 0; i < metaGrant.length; i++) {
                            if (metaGrant[i] == propertyName) {
                                flag = true;
                                break;
                            }
                        }
                        if (!flag) {
                            return resolve(undefined);
                        }
                    }

                    if (permission.sandbox && script.type != SCRIPT_TYPE_CRONTAB) {
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
                                    return resolve(await old.apply(this, [grant, post]));
                                } else {
                                    //TODO:执行拒绝的提示
                                    return resolve(undefined);
                                }
                            }
                            //弹出页面确认
                            let uuid = uuidv4();
                            App.Cache.set("confirm:uuid:" + uuid, confirm);
                            let listener = async (param: any) => {
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
                                    return resolve(await old.apply(this, [grant, post]));
                                } else {
                                    return resolve(undefined);
                                }
                            }
                            MsgCenter.listener(PermissionConfirm + uuid, listener);
                            setTimeout(() => {
                                App.Cache.del("confirm:uuid:" + uuid);
                                MsgCenter.removeListener(PermissionConfirm + uuid, listener)
                            }, 30000);

                            chrome.tabs.create({ url: chrome.runtime.getURL("confirm.html?uuid=" + uuid) });
                        } else {
                            return resolve(await old.apply(this, [grant, post]));
                        }
                    } else {
                        return resolve(await old.apply(this, [grant, post]));
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
                return resolve(await api.apply(this, [grant, postMessage]));
            });
        });
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
        }
    })
    protected GM_xmlhttpRequest(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            if (grant.params.length <= 0) {
                //错误
                return resolve(undefined);
            }
            let config = <GM_Types.XHRDetails>grant.params[0];

            axios(config).then(result => {
                let text = '';
                switch (typeof (result.data)) {
                    case 'string':
                        text = result.data; break;
                    default:
                        text = JSON.stringify(result.data); break;
                }
                let respond: GM_Types.XHRResponse = {
                    status: result.status,
                    statusText: result.statusText,
                    responseHeaders: result.headers,
                    response: result.data,
                    responseText: text,
                };
                grant.data = { type: 'load', data: respond };
                post.postMessage(grant);
            });
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({
        sandbox: true,
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
            console.log(detail);
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
                type: 'basic',
            };
            if (!isFirefox()) {
                options.silent = details.silent;
            }

            chrome.notifications.create(options, (notificationId) => {
                if (details.timeout) {
                    setTimeout(() => {
                        chrome.notifications.clear(notificationId);
                    }, details.timeout);
                }
            });
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({ default: true, sandbox: true })
    protected GM_setLastRuntime(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            this.scriptMgr.setLastRuntime(grant.id, grant.params[0]);
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({ default: true, sandbox: true })
    protected GM_setDelayRuntime(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            this.scriptMgr.setLastRuntime(grant.id, grant.params[0]);
            return resolve(undefined);
        });
    }

    @BackgroundGrant.GMFunction({ default: true })
    protected GM_log(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            if (!grant.params[0]) {
                return resolve(undefined);
            }
            App.Log.Logger(grant.params[1] ?? LOGGER_LEVEL_INFO, 'script', grant.params[0], grant.name);
            return resolve(undefined);
        });
    }
}

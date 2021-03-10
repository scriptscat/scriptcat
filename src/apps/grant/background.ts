import { LOGGER_LEVEL_DEBUG, LOGGER_LEVEL_INFO } from "@App/model/logger";
import { Script, SCRIPT_TYPE_CRONTAB } from "@App/model/script";
import { isFirefox } from "@App/pkg/utils";
import axios from "axios";
import { logger } from "../logger/logger";
import { ScriptGrant } from "../msg-center/event";
import { MsgCenter } from "../msg-center/msg-center";
import { ScriptManager } from "../script/manager";
import { Grant, Api, IPostMessage, IGrantListener } from "./interface";

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

interface ConfirmParam {
    title: string
    metadata: { [key: string]: string }
    describe: string
}

interface Permission {
    // 默认提供的函数
    default?: boolean
    // 是否只有沙盒环境中才能执行
    sandbox?: boolean

    // 是否需要弹出页面让用户进行确认
    confirm?: (grant: Grant, script: Script) => Promise<ConfirmParam | undefined>
    // 必须用户确认
    mustConfirm?: boolean
}


export class BackgroundGrant {

    public apis = new Map<string, Api>();
    protected listener: IGrantListener;
    protected scriptMgr: ScriptManager;

    constructor(scriptMgr: ScriptManager, listener: IGrantListener) {
        this.listener = listener;
        this.scriptMgr = scriptMgr;
    }

    public static GMFunction(permission: Permission = {}) {
        return function (
            target: BackgroundGrant,
            propertyName: string,
            descriptor: PropertyDescriptor
        ) {
            let old = descriptor.value;
            descriptor.value = function (grant: Grant, post: IPostMessage): Promise<any> {
                return new Promise(async resolve => {
                    //TODO: 权限错误提示
                    let script = await target.scriptMgr.getScript(grant.id);
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
                            //弹出页面确认
                          
                        }

                    }

                    resolve(await old.apply(this, [grant, post]));
                });
            }
            target.apis.set(propertyName, descriptor.value);
        };
    }

    public listenScriptGrant() {
        this.listener.listen((msg, postMessage) => {
            return new Promise(async resolve => {
                let grant = <Grant>msg;
                if (!grant.value) {
                    return;
                }
                let api = this.apis.get(grant.value);
                if (api == undefined) {
                    return resolve(undefined);
                }
                return resolve(await api.apply(this, [grant, postMessage]));
            });
        });
    }

    //TODO:按照tampermonkey文档实现
    @BackgroundGrant.GMFunction()
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

    @BackgroundGrant.GMFunction({ sandbox: true })
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
            logger.Logger(grant.params[1] ?? LOGGER_LEVEL_INFO, 'script', grant.params[0]);
            return resolve(undefined);
        });
    }
}

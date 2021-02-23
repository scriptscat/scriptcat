import axios from "axios";
import { ScriptGrant } from "../msg-center/event";
import { MsgCenter } from "../msg-center/msg-center";
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

export class BackgroundGrant {

    public apis = new Map<string, Api>();
    protected listener: IGrantListener;

    constructor(listener: IGrantListener) {
        this.listener = listener;
        this.apis.set("GM_xmlhttpRequest", this.GM_xmlhttpRequest).set("GM_cookie", this.GM_cookie).set("GM_notification", this.GM_notification);

    }

    public listenScriptGrant() {
        this.listener.listen((msg, postMessage) => {
            return new Promise(async resolve => {
                let grant = <Grant>msg;
                let api = this.apis.get(grant.value);
                //TODO:通过id校验权限
                if (api == undefined) {
                    return resolve(undefined);
                }
                return resolve(await api(grant, postMessage));
            });
        });
    }

    //TODO:按照tampermonkey文档实现
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

    protected GM_cookie(): Promise<any> {
        return new Promise(resolve => {
            resolve(undefined);
        });
    }

    protected GM_notification(grant: Grant, post: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            let params = grant.params;
            if (params.length == 0) {
                return resolve(undefined);
            }
            let details: GM_Types.NotificationDetails = {};

            if (params.length > 1) {
                switch (params.length) {
                    case 3: {
                        details.image = params[2];
                    }
                    case 2: {
                        details.title = params[1];
                    }
                    case 1: {
                        details.text = params[0];
                    }
                }
            } else {
                details = params[0];
            }
            chrome.notifications.create({
                title: details.title,
                contextMessage: details.text,
                iconUrl: details.image,
                silent: details.silent,
            }, (notificationId) => {
                if (details.timeout) {
                    setTimeout(() => {
                        chrome.notifications.clear(notificationId);
                    });
                }
            });

        });
    }
}

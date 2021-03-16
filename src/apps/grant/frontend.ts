import { Script } from "@App/model/script";
import { Value } from "@App/model/value";
import { randomString } from "@App/pkg/utils";
import { Api, Grant } from "./interface";

type Callback = (grant: Grant) => void;
type FrontendApi = any;

interface DescriptionParam {
    sync?: boolean
    depend?: string[]
}

export interface FrontenApiValue {
    api: FrontendApi
    param: DescriptionParam
}

export class FrontendGrant {

    public request = new Map<string, Callback>();

    public static apis = new Map<string, FrontenApiValue>();

    public script: Script;

    public value: Map<string, Value>;

    constructor(script: Script, value: Map<string, Value>) {
        this.script = script;
        this.value = value;
    }

    public static GMFunction(param: DescriptionParam = {}) {
        return function (
            target: any,
            propertyName: string,
            descriptor: PropertyDescriptor
        ) {
            let key = propertyName;
            if (param.sync) {
                key = 'GM.' + key;
            }
            FrontendGrant.apis.set(key, {
                api: descriptor.value,
                param: param
            });
        }
    }

    public listenScriptGrant() {
        //TODO:做前端通信时完成
        window.addEventListener('message', event => {
            let grant = <Grant>event.data;

        });
    }

    public getApi(grant: string): FrontenApiValue | undefined {
        return FrontendGrant.apis.get(grant);
    }

    public postRequest = (value: string, params: any[], callback?: Callback | undefined) => {
        let grant: Grant = {
            id: this.script.id,
            name: this.script.name,
            value: value,
            params: params,
            request: randomString(32)
        };
        if (callback) {
            this.request.set(grant.request, (grant: Grant) => {
                if (grant.error != '') {
                    throw 'ErrCode:' + grant.error + ' ErrMsg:' + grant.errorMsg;
                }
                callback(grant);
            });
        }
        top.postMessage(grant, '*');
    }

    @FrontendGrant.GMFunction()
    public GM_xmlhttpRequest(details: GM_Types.XHRDetails) {
        let param = {
            method: details.method,
            timeout: details.timeout,
            url: details.url,
            headers: details.headers,
            data: details.data,
        };
        if (details.cookie) {
            //TODO:不允许设置cookie header,找看看还有没有其他方法
            param.headers = param.headers || {};
            param.headers['Cookie'] = details.cookie;
        }

        this.postRequest('GM_xmlhttpRequest', [param], (grant: Grant) => {
            switch (grant.data.type) {
                case 'load':
                    details.onload && details.onload(<GM_Types.XHRResponse>grant.data.data);
                    break;
            }
        });
    }

    @FrontendGrant.GMFunction({ depend: ['GM_xmlhttpRequest'] })
    public GMSC_xmlhttpRequest(details: GM_Types.XHRDetails): Promise<GM_Types.XHRResponse> {
        return new Promise(resolve => {
            details.onload = (xhr) => {
                resolve(xhr);
            }
            this.GM_xmlhttpRequest(details);
        });
    }

    public GM_notification(text: string, title: string, image: string, onclick: Function): void

    @FrontendGrant.GMFunction()
    public GM_notification(detail: GM_Types.NotificationDetails | string, ondone: GM_Types.NotificationOnDone | string): void {
        let data: GM_Types.NotificationDetails = {};
        if (typeof detail === 'string') {
            data.text = detail;
            switch (arguments.length) {
                case 4:
                    data.onclick = arguments[3];
                case 3:
                    data.image = arguments[2];
                case 2:
                    data.title = arguments[1];
            }
        } else {
            data = detail;
            data.ondone = data.ondone || <GM_Types.NotificationOnDone>ondone;
        }
        let click: GM_Types.NotificationOnClick, done: GM_Types.NotificationOnDone, create: GM_Types.NotificationOnClick;
        if (data.onclick) {
            click = data.onclick;
            delete data.onclick;
        }
        if (data.ondone) {
            done = data.ondone;
            delete data.ondone;
        }
        if (data.oncreate) {
            create = data.oncreate;
            delete data.oncreate;
        }
        this.postRequest('GM_notification', [data], (grant: Grant) => {
            switch (grant.data.type) {
                case 'click': {
                    click && click.apply({ id: grant.data.id }, [grant.data.id])
                    break;
                }
                case 'done': {
                    done && done.apply({ id: grant.data.id }, [grant.data.user, grant.data.id])
                    break;
                }
                case 'create': {
                    create && create.apply({ id: grant.data.id }, [grant.data.id]);
                }
            }
        });
    }

    @FrontendGrant.GMFunction()
    public GM_closeNotification(id: string) {
        this.postRequest('GM_closeNotification', [id]);
    }

    @FrontendGrant.GMFunction()
    public GM_updateNotification(id: string, details: GM_Types.NotificationDetails): void {
        this.postRequest('GM_updateNotification', [id, details]);
    }

    @FrontendGrant.GMFunction()
    public GM_log(message: string, level?: GM_Types.LOGGER_LEVEL): void {
        this.postRequest('GM_log', [message, level]);
    }

    @FrontendGrant.GMFunction()
    public GM_getValue(name: string, defaultValue?: any): any {
        let ret = this.value.get(name);
        if (ret) {
            return ret.value;
        }
        return defaultValue;
    }

    @FrontendGrant.GMFunction()
    public GM_setValue(name: string, value: any): void {
        let ret = this.value.get(name);
        if (ret) {
            ret.value = value;
        } else {
            ret = {
                id: 0,
                scriptId: this.script.id,
                namespace: this.script.namespace,
                key: name,
                value: value,
                createtime: new Date().getTime()
            };
        }
        this.value.set(name, ret);
        this.postRequest('GM_setValue', [name, value]);
    }

    @FrontendGrant.GMFunction({ sync: true, depend: ['GM_xmlhttpRequest'] })
    public fetch(details: GM_Types.XHRDetails): Promise<GM_Types.XHRResponse> {
        return new Promise(resolve => {
            details.onload = (xhr) => {
                resolve(xhr);
            }
            this.GM_xmlhttpRequest(details);
        });
    }


}

export type rejectCallback = (msg: string, delayrun: number) => void
//ts会定义在prototype里,Proxy拦截的时候会有问题,所以function使用属性的方式定义(虽然可以处理,先这样)
export class SandboxContext extends FrontendGrant {

    constructor(script: Script, value: Map<string, Value>) {
        super(script, value);
        window.addEventListener('message', this.message);
    }

    public message = (event: MessageEvent) => {
        let grant = <Grant>event.data;
        let callback = this.request.get(grant.request);
        if (callback) {
            callback(grant);
        }
    }

    public GM_setLastRuntime(time: number) {
        this.postRequest('GM_setLastRuntime', [time], () => {
        });
    }

    public GM_setDelayRuntime(time: number) {
        this.postRequest('GM_setDelayRuntime', [time], () => {
        });
    }

    @FrontendGrant.GMFunction()
    public GM_cookie(action: string, details: GM_Types.CookieDetails, done: (cookie: GM_Types.Cookie[] | any, error: any | undefined) => void) {
        this.postRequest('GM_cookie', [action, details], (grant: Grant) => {
            switch (grant.data.type) {
                case 'done':
                    done && done(<GM_Types.Cookie[]>grant.data.data, undefined);
                    break;
            }
        });
    }

    public destruct() {
        //释放资源
        window.removeEventListener('message', this.message);
        this.request.clear();
        this.value.clear();
    }

}

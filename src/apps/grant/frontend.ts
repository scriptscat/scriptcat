import { randomString } from "@App/pkg/utils";
import { Grant } from "./interface";

type Callback = (grant: Grant) => void;
type FrontendApi = any;


export class FrontendGrant {

    public request = new Map<string, Callback>();

    public apis = new Map<string, FrontendApi>();

    public id: number;

    constructor(id: number) {
        this.id = id;
        this.apis.set("GM_xmlhttpRequest", this.GM_xmlhttpRequest)
        this.apis.set("GMSC_xmlhttpRequest", this.GMSC_xmlhttpRequest)
            .set("GM_notification", this.GM_notification);
    }

    public listenScriptGrant() {
        //TODO:做前端通信时完成
        window.addEventListener('message', event => {
            let grant = <Grant>event.data;

        });
    }

    public getApi(grant: string): FrontendApi {
        return this.apis.get(grant);
    }

    //会被替换上下文,沙盒环境由SandboxContext接管
    public postRequest = (value: string, params: any[], callback: Callback | undefined) => {
        let grant: Grant = {
            id: this.id,
            value: value,
            params: params,
            request: randomString(32)
        };
        if (callback) {
            this.request.set(grant.request, callback);
        }
        top.postMessage(grant, '*');
    }

    public GM_xmlhttpRequest(details: GM_Types.XHRDetails) {
        let param = {
            method: details.method,
            timeout: details.timeout,
            url: details.url,
            headers: details.headers,
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

    public GMSC_xmlhttpRequest(details: GM_Types.XHRDetails): Promise<GM_Types.XHRResponse> {
        return new Promise(resolve => {
            details.onload = (xhr) => {
                resolve(xhr);
            }
            this.GM_xmlhttpRequest(details);
        });
    }

    public GM_notification(text: string, title: string, image: string, onclick: Function): void
    public GM_notification(detail: GM_Types.NotificationDetails | string, ondone: Function | string): void {
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
        }
        this.postRequest('GM_notification', [data], (grant: Grant) => {
            switch (grant.data.type) {
                case 'click': {

                }
            }
        });
    }

}

export type rejectCallback = (result: any) => void
//ts会定义在prototype里,Proxy拦截的时候会有问题,所以function使用属性的方式定义(虽然可以处理,先这样)
export class SandboxContext extends FrontendGrant {

    public request = new Map<string, Callback>();
    protected rejectCallback!: Function;

    constructor(id: number) {
        super(id);
        this.apis.set('GM_setRuntime', this.GM_setLastRuntime).set("GM_cookie", this.GM_cookie);
        window.addEventListener('message', this.message);
    }

    public listenReject(callback: rejectCallback) {
        this.rejectCallback = callback;
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

    public GM_cookie(action: string, details: GM_Types.CookieDetails, done: (cookie: GM_Types.Cookie[] | any, error: any | undefined) => void) {
        this.postRequest('GM_cookie', [action, details], (grant: Grant) => {
            switch (grant.data.type) {
                case 'done':
                    done && done(<GM_Types.Cookie[]>grant.data.data, undefined);
                    break;
            }
        });
    }

    //沙盒脚本执行结束
    public GMSC_resolve = () => {

    }

    //沙盒脚本执行异常
    public GMSC_reject = (result: any) => {
        this.rejectCallback && this.rejectCallback(result);
    }

    public destruct() {
        //释放资源
        window.removeEventListener('message', this.message);
    }

}

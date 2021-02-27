import { randomString } from "@App/pkg/utils";
import { time } from "cron";
import { Grant } from "./interface";

type Callback = (grant: Grant) => void;
type FrontendApi = any;


export class FrontendGrant {

    public request = new Map<string, Callback>();

    public apis = new Map<string, FrontendApi>();

    public id: number;

    constructor(id: number) {
        this.id = id;
        this.apis.set("GM_xmlhttpRequest", this.GM_xmlhttpRequest).set("GM_cookie", this.GM_cookie)
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

    public GM_cookie(action: string, details: GM_Types.CookieDetails, done: (cookie: GM_Types.Cookie, error: any)) {
        this.postRequest('GM_cookie', [action, details], undefined);
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

//ts会定义在prototype里,Proxy拦截的时候会有问题,所以function使用属性的方式定义(虽然可以处理,先这样)
export class SandboxContext extends FrontendGrant {

    public request = new Map<string, Callback>();

    constructor(id: number) {
        super(id);
        this.apis.set('GM_setRuntime', this.GM_setRuntime);
        window.addEventListener('message', this.message);
    }

    public message = (event: MessageEvent) => {
        let grant = <Grant>event.data;
        let callback = this.request.get(grant.request);
        if (callback) {
            callback(grant);
        }
    }

    public GM_setRuntime(time: number) {
        this.postRequest('GM_setRuntime', [time], () => {
        });
    }

    //沙盒脚本执行结束
    public resolve = () => {

    }

    //沙盒脚本执行异常
    public reject = () => {

    }

    public destruct() {
        //释放资源
        window.removeEventListener('message', this.message);
    }

}

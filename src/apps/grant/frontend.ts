import { randomString } from "@App/pkg/utils";
import { GM_xmlhttpRequestDetails, GM_xmlhttpRespond, Grant } from "./interface";

type Callback = (grant: Grant) => void;
type FrontendApi = any;


export class FrontendGrant {

    //TODO:优化request表删除
    public request = new Map<string, Callback>();

    public apis = new Map<string, FrontendApi>();

    public id: number;

    constructor(id: number) {
        this.id = id;
        this.apis.set("GM_xmlhttpRequest", this.GM_xmlhttpRequest).set("GM_cookie", this.GM_cookie);
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
    public postRequest(value: string, params: any[], callback: Callback | undefined) {
        let grant: Grant = {
            id: 0,
            value: value,
            params: params,
            request: randomString(32)
        };
        if (callback) {
            this.request.set(grant.request, callback);
        }
        window.postMessage(grant, '*');
    }

    public GM_xmlhttpRequest(details: GM_xmlhttpRequestDetails) {
        let param = {
            method: details.method,
            timeout: details.timeout,
            url: details.url,
        };
        this.postRequest('GM_xmlhttpRequest', [param], (grant: Grant) => {
            switch (grant.data.type) {
                case 'load':
                    details.onload && details.onload(<GM_xmlhttpRespond>grant.data.data);
                    break;
            }
        });
    }

    public GM_cookie(action: string, details: any) {
        this.postRequest('GM_cookie', [action, details], undefined);
    }
}

export class SandboxContext {

    public id: number;
    //TODO:优化request表删除
    public request = new Map<string, Callback>();

    constructor(id: number) {
        this.id = id;
        window.addEventListener('message', event => {
            let grant = <Grant>event.data;
            let callback = this.request.get(grant.request);
            if (callback) {
                callback(grant);
            }
        });
    }

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

}

import { randomString } from "@App/pkg/utils";
import { GM_xmlhttpRequestDetails, Grant } from "./interface";

type Callback = () => void;
type FrontendApi = any;

export class FrontendGrant {

    public request = new Map<string, Callback>();

    public apis = new Map<string, FrontendApi>();

    constructor() {
        this.apis.set("GM_xmlhttpRequest", this.GM_xmlhttpRequest).set("GM_cookie", this.GM_cookie);
        window.addEventListener('message', event => {
            let grant = <Grant>event.data;
            console.log(grant, 'front');
        });
    }

    public getApi(grant: string): FrontendApi {
        return this.apis.get(grant);
    }

    public postRequest(value: string, params: any[]) {
        let grant: Grant = {
            value: value,
            params: params,
            request: randomString(32)
        };
        window.postMessage(grant, '*');
    }

    public GM_xmlhttpRequest(details: GM_xmlhttpRequestDetails) {
        let param = {
            method: details.method,
            timeout: details.timeout,
            url: details.url,
        };
        this.postRequest('GM_xmlhttpRequest', [param]);
    }

    public GM_cookie(action: string, details: any, callback: (cookies: any, error: any) => void) {
        this.postRequest('GM_cookie', [action, details]);
    }
}
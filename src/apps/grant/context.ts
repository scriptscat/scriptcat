import { ScriptGrant } from "../msg-center/event";
import { MsgCenter } from "../msg-center/msg-center";
import { Grant } from "./interface";

type ContentApi = (grant: Grant, event: MessageEvent) => Promise<any>;


export class ContentGrant {

    public apis = new Map<string, ContentApi>();
    constructor() {
        this.apis.set("GM_xmlhttpRequest", this.GM_xmlhttpRequest).set("GM_cookie", this.GM_cookie);
    }

    public listenScriptGrant() {
        window.addEventListener('message', async event => {
            if (event.origin != 'null') {
                return;
            }
            let grant = <Grant>event.data;
            let api = this.apis.get(grant.value);
            if (api == undefined) {
                //TODO:返回错误
                return;
            }
            let ret = await api(grant, event);
            grant.data = ret;
        });
    }

    protected GM_xmlhttpRequest(grant: Grant, event: MessageEvent): Promise<any> {
        return new Promise(resolve => {
            MsgCenter.connect(ScriptGrant, grant).addListener((msg, port) => {
                window.postMessage(msg, event.origin);
            });
        });
    }

    protected GM_cookie(): Promise<any> {
        return new Promise(resolve => {
            resolve(undefined);
        });
    }

}

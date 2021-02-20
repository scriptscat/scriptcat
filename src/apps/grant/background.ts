import axios from "axios";
import { ScriptGrant } from "../msg-center/event";
import { MsgCenter } from "../msg-center/msg-center";
import { Grant, GM_xmlhttpRequestDetails } from "./interface";

type BackgroundApi = (grant: Grant, port: chrome.runtime.Port) => Promise<any>;

export class BackgroundGrant {

    public apis = new Map<string, BackgroundApi>();
    constructor() {
        this.apis.set("GM_xmlhttpRequest", this.GM_xmlhttpRequest).set("GM_cookie", this.GM_cookie);
    }

    public listenScriptGrant() {
        MsgCenter.listener(ScriptGrant, async (msg, port): Promise<any> => {
            return new Promise(async resolve => {
                let grant = <Grant>msg;
                let api = this.apis.get(grant.value);
                //TODO:通过uuid校验权限
                if (api == undefined) {
                    //TODO:返回错误
                    return;
                }
                let ret = await api(grant, port);
                grant.data = ret;
                resolve(grant);
            });
        })
    }

    //TODO:按照tampermonkey文档实现
    protected GM_xmlhttpRequest(grant: Grant): Promise<any> {
        return new Promise(resolve => {
            if (grant.params.length <= 0) {
                return resolve(undefined);
            }
            let config = <GM_xmlhttpRequestDetails>grant.params[0];
            axios(config).then(result => {
                resolve(result);
            });
        });
    }

    protected GM_cookie(): Promise<any> {
        return new Promise(resolve => {
            resolve(undefined);
        });
    }
}

import { ScriptGrant } from "../msg-center/event";
import { MsgCenter } from "../msg-center/msg-center";
import { Api, Grant, IGrantListener, IPostMessage } from "./interface";

class postMessage implements IPostMessage {

    public event: MessageEvent;
    public context: Window;

    constructor(context: Window, event: MessageEvent) {
        this.event = event;
        this.context = context;
    }

    public postMessage(msg: any): void {
        this.context.postMessage(msg, '*');
    }

}

export class grantListener implements IGrantListener {

    public context: Window;

    constructor(context: Window) {
        this.context = context;
    }

    public listen(callback: (msg: any, postMessage: IPostMessage) => Promise<any>): void {
        let extension_id = 'moz-extension://' + chrome.i18n.getMessage("@@extension_id");
        window.addEventListener('message', async event => {
            if (event.origin != 'null' && event.origin != extension_id) {
                return;
            }
            let post = new postMessage(this.context, event);
            let ret = await callback(event.data, post);
            if (ret) {
                post.postMessage(ret);
            }
        });
    }
}

//TODO:优化 转发作用
export class ContentGrant {

    public request = new Map<string, Grant>();
    public apis = new Map<string, Api>();
    protected listener: IGrantListener;

    constructor(listener: IGrantListener) {
        this.listener = listener;
        this.apis.set("GM_xmlhttpRequest", this.GM_xmlhttpRequest).set("GM_cookie", this.GM_cookie);
    }

    public listenScriptGrant() {
        this.listener.listen((msg, postMessage) => {
            return new Promise(async resolve => {
                let grant = <Grant>msg;
                let api = this.apis.get(grant.value);
                if (api == undefined) {
                    return resolve(undefined);
                }
                return resolve(await api(grant, postMessage));
            });
        });
    }

    protected GM_xmlhttpRequest(grant: Grant, postMessage: IPostMessage): Promise<any> {
        return new Promise(resolve => {
            MsgCenter.connect(ScriptGrant, grant).addListener((msg, port) => {
                console.log(msg);
                postMessage.postMessage(msg);
            });
        });
    }

    protected GM_cookie(): Promise<any> {
        return new Promise(resolve => {
            resolve(undefined);
        });
    }

}

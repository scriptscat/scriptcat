
// 前端用通信

export type ListenMsg = (msg: any) => void;

// 浏览器页面之间的通信,主要在content和injected页面之间

export interface BrowserMsg {
    send(topic: string, msg: any): void;

    listen(topic: string, callback: ListenMsg): void;
}

export class FrontendMsg implements BrowserMsg {

    public id: string;

    public content: boolean;

    public listenMap = new Map<string, ListenMsg>();

    constructor(id: string, content: boolean) {
        this.id = id;
        this.content = content;
        document.addEventListener(this.id + (content ? 'ct' : 'fd'), (event: unknown) => {
            const detail = (<{ detail: { msg: any, topic: string } }>event).detail;
            const topic = detail.topic;
            const listen = this.listenMap.get(topic);
            if (listen) {
                listen(detail.msg);
            }
        });
    }

    public send(topic: string, msg: any) {
        let detail = <{ topic: string, msg: any }>Object.assign({}, {
            topic: topic,
            msg: msg,
        });
        if ((<{ cloneInto?: (detail: any, view: any) => { topic: string, msg: any } }><unknown>global).cloneInto) {
            try {
                detail = (<{ cloneInto: (detail: any, view: any) => { topic: string, msg: any } }><unknown>global).cloneInto(detail, document.defaultView);
            } catch (e) {
                console.log(e);
            }
        }
        const ev = new CustomEvent(this.id + (this.content ? 'fd' : 'ct'), {
            detail: detail,
        });
        document.dispatchEvent(ev);
    }

    public listen(topic: string, callback: ListenMsg) {
        this.listenMap.set(topic, callback);
    }

}
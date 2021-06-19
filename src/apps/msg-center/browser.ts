
// 前端用通信

export type ListenMsg = (msg: any) => void;

// 浏览器页面之间的通信,主要在content和injected页面之间
export class BrowserMsg {

    public id: string;

    public listenMap = new Map<string, ListenMsg>();

    constructor(id: string) {
        this.id = id;
        document.addEventListener(this.id, event => {
            let detail = JSON.parse((<any>event).detail);
            let ret = this.listenMap.get(detail.topic);
            if (ret) {
                ret(detail.msg);
            }
        });
    }

    public send(topic: string, msg: any) {
        // 兼容火狐的序列化
        let ev = new CustomEvent(this.id, {
            detail: JSON.stringify({
                topic: topic,
                msg: msg,
            }),
        });
        document.dispatchEvent(ev);
    }

    public listen(topic: string, callback: ListenMsg) {
        this.listenMap.set(topic, callback);
    }

}
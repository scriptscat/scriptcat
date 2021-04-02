
// 前端用通信

export type ListenMsg = (msg: any) => void;

export class BrowserMsg {

    public id: string;

    public listenMap = new Map<string, ListenMsg>();

    constructor(id: string) {
        this.id = id;
        document.addEventListener(this.id, event => {
            let detail = (<any>event).detail
            let ret = this.listenMap.get(detail.topic);
            if (ret) {
                ret(detail.msg);
            }
        });
    }

    public send(topic: string, msg: any) {
        let ev = new CustomEvent(this.id, {
            detail: {
                topic: topic,
                msg: msg,
            },
        });
        document.dispatchEvent(ev);
    }

    public listen(topic: string, callback: ListenMsg) {
        this.listenMap.set(topic, callback);
    }

}
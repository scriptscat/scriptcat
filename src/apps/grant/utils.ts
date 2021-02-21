import { IGrantListener, IPostMessage } from "./interface";

export class MultiGrantListener implements IGrantListener {
    public listeners: IGrantListener[] = [];

    constructor(...l: IGrantListener[]) {
        this.listeners = l;
    }

    public listen(callback: (msg: any, postMessage: IPostMessage) => Promise<any>): void {
        this.listeners.forEach(val => {
            val.listen(callback);
        });
    }

}
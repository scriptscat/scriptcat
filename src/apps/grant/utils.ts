import { App } from "../app";
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

export function execMethod(propertyName: string, name: string, resolve: (arg0: any) => void, reject: (arg0: any) => void, method: { apply: (arg0: any, arg1: any) => Promise<any>; }, _this: any, params: any): any {
    return method.apply(_this, params).then((result: any) => {
        resolve(result);
    }).catch((e: any) => {
        App.Log.Error("script", "call function error: " + propertyName, name);
        reject(e);
    });
}
import { SystemCacheEvent } from "@App/apps/msg-center/event";
import { MsgCenter } from "@App/apps/msg-center/msg-center";

export interface ICache {
    get(key: string): Promise<any>
    set(key: string, val: any): Promise<any>
    getOrSet(key: string, set: () => Promise<any>): Promise<any>
    del(key: string): Promise<any>
}

export class MapCache implements ICache {
    protected map = new Map();
    get(key: string): Promise<any> {
        return new Promise(resolve => {
            return resolve(this.map.get(key));
        });
    }
    set(key: string, val: any): Promise<any> {
        return new Promise(resolve => {
            this.map.set(key, val);
            resolve(undefined);
        });
    }
    del(key: string): Promise<any> {
        this.map.delete(key);
        return new Promise(resolve => {
            this.map.delete(key);
            resolve(undefined);
        });
    }
    getOrSet(key: string, set: () => Promise<any>): Promise<any> {
        return new Promise(async resolve => {
            let ret = await this.get(key);
            if (!ret) {
                ret = await set();
                this.set(key, ret);
            }
            return resolve(ret);
        });
    }

}

// 只要是在域内都能缓存,直接用缓存在域内通讯!
export class SystemCache extends MapCache implements ICache {
    protected master: boolean;
    constructor(master: boolean) {
        super();
        this.master = master || false;
        MsgCenter.listener(SystemCacheEvent, (msg: any, port: chrome.runtime.Port): Promise<any> => {
            return new Promise(async resolve => {
                return resolve(await this.get(msg, true));
            });
        });
    }

    get(key: string, remote: boolean = false): Promise<any> {
        return new Promise(async resolve => {
            let ret = await super.get(key);
            if (ret) {
                return resolve(ret);
            }
            if (remote || this.master) {
                return resolve(undefined);
            }
            return MsgCenter.connect(SystemCacheEvent, key).addListener((val: any, port) => {
                this.set(key, val);
                port.disconnect();
                return resolve(val);
            });
        });
    }

}

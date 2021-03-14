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

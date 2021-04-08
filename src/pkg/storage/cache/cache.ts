import { ADD_CHANGE_EVENT, ChangeCallback, CHANGE_EVENT, DELETE_CHANGE_EVENT, Storage, UPDATE_CHANGE_EVENT } from "../storage";

export interface ICache extends Storage {
    get(key: string): Promise<any>
    set(key: string, val: any): Promise<any>
    getOrSet(key: string, set: () => Promise<any>): Promise<any>
    del(key: string): Promise<any>
}

export class MapCache implements ICache {
    protected map = new Map();
    protected callback = new Map<ChangeCallback, ChangeCallback>();
    protected trigger(event: CHANGE_EVENT, key: string, data: any, oldData: any) {
        this.callback.forEach((v) => {
            v(event, key, data, oldData);
        });
    }
    get(key: string): Promise<any> {
        return new Promise(resolve => {
            return resolve(this.map.get(key));
        });
    }
    set(key: string, val: any): Promise<any> {
        return new Promise(resolve => {
            let old = this.map.get(key);
            this.map.set(key, val);
            if (old) {
                this.trigger(UPDATE_CHANGE_EVENT, key, val, old);
            } else {
                this.trigger(ADD_CHANGE_EVENT, key, val, undefined);
            }
            resolve(undefined);
        });
    }
    del(key: string): Promise<any> {
        return new Promise(resolve => {
            let old = this.map.get(key);
            if (!old) {
                return resolve(undefined);
            }
            this.map.delete(key);
            this.trigger(DELETE_CHANGE_EVENT, key, undefined, old);
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
    remove(key: string): Promise<void> {
        return this.del(key);
    }
    removeAll(): Promise<void> {
        return new Promise(resolve => {
            this.map.clear();
            resolve(undefined);
        });
    }
    keys(): Promise<{ [key: string]: any }> {
        return new Promise((resolve) => {
            let ret: { [key: string]: any } = {};
            this.map.forEach((v, k) => {
                ret[k] = v;
            });
            resolve(ret);
        });
    }

    listenChange(callback: ChangeCallback): void {
        this.callback.set(callback, callback);
    }

}

import { SystemCacheEvent } from "@App/apps/msg-center/event";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { MapCache, ICache } from "./cache";

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

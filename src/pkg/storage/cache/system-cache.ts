import { SystemCacheEvent } from "@App/apps/msg-center/event";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { randomString } from "@App/pkg/utils/utils";
import { CHANGE_EVENT } from "../storage";
import { MapCache, ICache } from "./cache";

// 只要是在域内都能缓存,直接用缓存在域内通讯!
export class SystemCache extends MapCache implements ICache {
    protected master = false;
    constructor(master: boolean = false) {
        super();
        this.master = master;
        // 判断是否是同一环境下的链接
        MsgCenter.listener(SystemCacheEvent, (data: any, port: chrome.runtime.Port): Promise<any> => {
            return new Promise(async resolve => {
                let msg = data.msg;
                switch (msg[0]) {
                    case 0:
                        return resolve({ data: this.map.get(msg[1]) });
                    case 1:
                    case 2:
                        this.map.set(msg[1], msg[2]);
                        this.trigger(msg[0], msg[1], msg[2], msg[3]);
                        break;
                    case 3:
                        this.map.delete(msg[1]);
                        this.trigger(msg[0], msg[1], msg[2], msg[3]);
                        break;
                    default:
                        break;
                }
                return resolve(undefined);
            });
        });
    }

    protected trigger(event: CHANGE_EVENT, key: string, data: any, oldData: any) {
        super.trigger(event, key, data, oldData);
        if (!this.master) {
            try {
                MsgCenter.connect(SystemCacheEvent, { msg: [event, key, data, oldData] });
            } catch (e) {
                console.log(e.message);
            }
        }
    }

    get(key: string): Promise<any> {
        return new Promise(async resolve => {
            let ret = await super.get(key);
            if (ret) {
                return resolve(ret);
            }
            if (this.master) {
                return resolve(ret);
            }
            return MsgCenter.connect(SystemCacheEvent, { msg: [0, key] }).addListener((val: any, port) => {
                if (val.data) {
                    this.map.set(key, val.data);
                }
                return resolve(val.data);
            });
        });
    }

}

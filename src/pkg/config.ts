import { Storage } from "@App/pkg/storage/storage"
import { ChromeStorage } from "./storage/chrome";

export class SystemConfig {

    public static cache = new Map<string, any>();

    public static storage: Storage;
    // 检查更新周期,单位为秒
    public static get check_update_cycle(): number {
        return this.cache.get("check_update_cycle") || 86400;
    }

    public static set check_update_cycle(n: number) {
        this.storage.set("check_update_cycle", n);
        this.cache.set("check_update_cycle", n);
    }

}

SystemConfig.storage = new ChromeStorage("system");


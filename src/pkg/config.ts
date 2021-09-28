import { Storage } from "@App/pkg/storage/storage"
import { ChromeStorage } from "./storage/chrome";

export class SystemConfig {

    public static cache = new Map<string, any>();

    public static storage: Storage;

    public static async init() {
        let list = await this.storage.keys();
        for (const key in list) {
            this.cache.set(key, list[key]);
        }
    }

    // 检查更新周期,单位为秒
    public static get check_script_update_cycle(): number {
        return this.cache.get("check_script_update_cycle") || 86400;
    }

    public static set check_script_update_cycle(n: number) {
        this.storage.set("check_script_update_cycle", n);
        this.cache.set("check_script_update_cycle", n);
    }

    public static get enable_auto_sync(): boolean {
        if (!this.cache.has('enable_auto_sync')) {
            return true;
        }
        return this.cache.get('enable_auto_sync');
    }

    public static set enable_auto_sync(enable: boolean) {
        this.storage.set("enable_auto_sync", enable);
        this.cache.set("enable_auto_sync", enable);
    }

    public static get update_disable_script(): boolean {
        return this.cache.get('update_disable_script');
    }

    public static set update_disable_script(enable: boolean) {
        this.storage.set("update_disable_script", enable);
        this.cache.set("update_disable_script", enable);
    }

}

SystemConfig.storage = new ChromeStorage("system");
// 初始化值
SystemConfig.init();

import { App, ENV_BACKGROUND, ENV_FRONTEND } from '@App/apps/app';
import { MsgCenter } from '@App/apps/msg-center/msg-center';
import { Storage } from '@App/pkg/storage/storage'
import { ChromeStorage } from './storage/chrome';

export const SYSTEM_CONFIG_CHANGE = 'system_config_change';
//NOTE: 可以抽象set接口
export class SystemConfig {

    public static cache = new Map<string, any>();

    public static storage: Storage;

    public static async init() {
        const list = await this.storage.keys();
        for (const key in list) {
            this.cache.set(key, list[key]);
        }
        // 监听设置变化
        if (App.Environment === ENV_BACKGROUND) {
            MsgCenter.listenerMessage(SYSTEM_CONFIG_CHANGE, (body) => {
                this.set(body.key, body.val);
                this.set('changetime', new Date().getTime());
            });
        }
    }

    public static set(key: string, val: any) {
        this.cache.set(key, val);
        if (App.Environment === ENV_FRONTEND) {
            MsgCenter.sendMessage(SYSTEM_CONFIG_CHANGE, { key: key, val: val });
        } else {
            this.storage.set(key, val);
        }
    }

    public static list() {
        const ret: { [key: string]: any } = {};
        this.cache.forEach((val, key) => {
            ret[key] = val;
        });
        return ret;
    }

    public static get changetime() {
        return this.cache.get('changetime') || 0;
    }

    public static set changetime(n: number) {
        this.set('changetime', 0);
    }

    // 检查更新周期,单位为秒
    public static get check_script_update_cycle(): number {
        return this.cache.get('check_script_update_cycle') || 86400;
    }

    public static set check_script_update_cycle(n: number) {
        this.set('check_script_update_cycle', n);
    }

    public static get enable_auto_sync(): boolean {
        if (!this.cache.has('enable_auto_sync')) {
            return true;
        }
        return this.cache.get('enable_auto_sync');
    }

    public static set enable_auto_sync(enable: boolean) {
        this.set('enable_auto_sync', enable);
    }

    public static get update_disable_script(): boolean {
        return this.cache.get('update_disable_script');
    }

    public static set update_disable_script(enable: boolean) {
        this.set('update_disable_script', enable);
    }

    public static get vscode_url(): string {
        return this.cache.get('vscode_url') || 'ws://localhost:8642';
    }

    public static set vscode_url(val: string) {
        this.set('vscode_url', val);
    }

    public static get vscode_reconnect(): boolean {
        return this.cache.get('vscode_reconnect') || false;
    }

    public static set vscode_reconnect(val: boolean) {
        this.set('vscode_reconnect', val);
    }
}

SystemConfig.storage = new ChromeStorage('system');

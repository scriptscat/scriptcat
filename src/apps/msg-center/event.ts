// TODO: 优化消息通信机制
export const PermissionConfirm: string = "permission-confirm";

export const ScriptExec: string = "script-exec";
export const ScriptStop: string = "script-stop";
export const ScriptInstall: string = "script-install";
export const ScriptReinstall: string = "script-reinstall";
export const ScriptUninstall: string = "script-uninstall";
export const ScriptStatusChange: string = "script-status-change";
export const ScriptRunStatusChange: string = "script-run-status-change";
export const ScriptCheckUpdate = "script-check-update";

export const SubscribeUpdate: string = "subscribe-update";
export const Unsubscribe: string = "unsubscribe";
export const SubscribeStatusChange: string = "subscribe-status-change";

export const RequestInstallInfo: string = "request-install-info";
export const RequestConfirmInfo: string = "request-confirm-info";
export const RequestTabRunScript: string = "request-tab-run-script";
export const ListenGmLog: string = "gm-log";
export const TabRemove: string = "tab-remove";
export const TabMenuClick: string = "tab-menu-click";

export const ScriptGrant: string = "script-grant";

export const Logger: string = "logger";

export const SystemCacheEvent: string = "system-cache";

export const ScriptValueChange: string = "script-value-change";

export type ListenCallback = (msg: any) => void;

// 单页面内的消息
export class AppEvent {
    public static eventMap = new Map<string, Map<any, any>>();

    public static listener(event: string, callback: ListenCallback) {
        let val = AppEvent.eventMap.get(event);
        if (!val) {
            val = new Map();
            AppEvent.eventMap.set(event, val);
        }
        val.set(callback, callback);
    }

    public static removeListener(event: string, callback: ListenCallback) {
        let val = AppEvent.eventMap.get(event);
        if (val) {
            val.delete(callback);
            if (!val.size) {
                AppEvent.eventMap.delete(event);
            }
        }
    }

    public static trigger(topic: string, msg?: any): void {
        AppEvent.eventMap.get(topic)?.forEach((val) => {
            val(msg);
        });
    }
}

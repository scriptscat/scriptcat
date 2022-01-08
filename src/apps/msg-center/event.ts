// TODO: 优化消息通信机制
export const PermissionConfirm = 'permission-confirm';
// 脚本执行
export const ScriptExec = 'script-exec';
// 脚本停止
export const ScriptStop = 'script-stop';
// 脚本通过url安装
export const ScriptInstallByURL = 'script-install-by-url';
// 脚本安装
export const ScriptInstall = 'script-install';
// 脚本更新
export const ScriptReinstall = 'script-reinstall';
// 脚本卸载
export const ScriptUninstall = 'script-uninstall';
export const ScriptStatusChange = 'script-status-change';
export const ScriptRunStatusChange = 'script-run-status-change';
export const ScriptCheckUpdate = 'script-check-update';

export const SubscribeUpdate = 'subscribe-update';
export const Unsubscribe = 'unsubscribe';
export const SubscribeCheckUpdate = 'subscribe-check-update';
export const SubscribeStatusChange = 'subscribe-status-change';

export const RequestInstallInfo = 'request-install-info';
export const RequestConfirmInfo = 'request-confirm-info';
export const RequestTabRunScript = 'request-tab-run-script';
export const ListenGmLog = 'gm-log';
export const TabRemove = 'tab-remove';
export const TabMenuClick = 'tab-menu-click';

export const ScriptGrant = 'script-grant';

export const Logger = 'logger';

export const SystemCacheEvent = 'system-cache';

export const ScriptValueChange = 'script-value-change';

export type ListenCallback = (msg: any) => void;

export const UserLogin = 'user-login';
export const UserLogout = 'user-logout';

export const SyncTaskEvent = 'sync-task-event';
export const TriggerSync = 'trigger-sync';

export const OpenImportFileWindow = 'open-import-file-window';
export const RequestImportFile = 'request-import-file';

export const ToolsConnectVSCode = 'tools-connect-vscode';
export const ToolsDisconnecttVSCode = 'tools-disconnect-vscode';

export const ExternalMessage = 'external.message';

export const RequestBackgroundRandCode='request-background-rand-code';

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
        const val = AppEvent.eventMap.get(event);
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

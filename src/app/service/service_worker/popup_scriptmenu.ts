import { SCRIPT_RUN_STATUS_RUNNING, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { ScriptMenu } from "@App/app/service/service_worker/types";
import type { Script } from "@App/app/repo/scripts";
import { getStorageName } from "@App/pkg/utils/utils";

export type TPopupPageLoadInfo = { tabId: number; frameId?: number; scriptmenus: ScriptMenu[] };

// 将 Script 转为 ScriptMenu 并初始化其在该 tab 的菜单暂存（menus 空阵列、计数归零）。
export const scriptToMenu = (script: Script): ScriptMenu => {
  return {
    uuid: script.uuid,
    name: script.name,
    storageName: getStorageName(script),
    enable: script.status === SCRIPT_STATUS_ENABLE,
    updatetime: script.updatetime || 0,
    hasUserConfig: !!script.config,
    metadata: script.metadata,
    runStatus: script.runStatus,
    runNum: script.type === SCRIPT_TYPE_NORMAL ? 0 : script.runStatus === SCRIPT_RUN_STATUS_RUNNING ? 1 : 0,
    runNumByIframe: 0,
    menus: [],
    isEffective: null,
  };
};

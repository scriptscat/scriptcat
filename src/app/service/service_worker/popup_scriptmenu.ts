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
    // 不需要完整 metadata。目前在 Popup 未使用 metadata。
    // 有需要时请把 metadata 里需要的部份抽出 (例如 @match @include @exclude)，避免 chrome.storage.session 储存量过大
    // metadata: script.metadata,
    runStatus: script.runStatus,
    runNum: script.type === SCRIPT_TYPE_NORMAL ? 0 : script.runStatus === SCRIPT_RUN_STATUS_RUNNING ? 1 : 0,
    runNumByIframe: 0,
    menus: [],
    isEffective: null,
  };
};

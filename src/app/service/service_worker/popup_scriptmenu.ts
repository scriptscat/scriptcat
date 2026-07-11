import { SCRIPT_RUN_STATUS_RUNNING, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { ScriptMenu } from "@App/app/service/service_worker/types";
import type { Script } from "@App/app/repo/scripts";
import { getIcon, getStorageName } from "@App/pkg/utils/utils";
import { i18nName } from "@App/locales/locales";

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

/**
 * 为 ScriptMenu 即时补充「响应专用」的展示信息：本地化脚本名（@name:&lt;lang&gt;）与图标 URL。
 *
 * 这些信息依赖完整 metadata，而 ScriptMenu 出于 session 缓存体积考虑并不存 metadata，
 * 因此在 getPopupData 返回前用完整 Script 即时计算并附加（返回浅拷贝，不回写缓存）。
 * 名称本地化逻辑与 options 列表（i18nName）保持一致。
 */
export const applyScriptDisplayInfo = (menu: ScriptMenu, script: Script): ScriptMenu => {
  const name = i18nName(script);
  const icon = getIcon(script);
  if (name === menu.name && !icon) return menu;
  return icon ? { ...menu, name, icon } : { ...menu, name };
};

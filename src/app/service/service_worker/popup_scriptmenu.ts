import { SCRIPT_RUN_STATUS_RUNNING, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { ScriptMenu } from "@App/app/service/service_worker/types";
import type { Script } from "@App/app/repo/scripts";
import { getStorageName } from "@App/pkg/utils/utils";

export type TPopupPageLoadInfo = { tabId: number; frameId?: number; scriptmenus: ScriptMenu[] };

// 将 Script 转为 ScriptMenu 并初始化其在该 tab 的菜单暂存（menus 空阵列、计数归零）。
// 从 metadata 提取脚本图标 URL
export const extractIcon = (m: Script["metadata"]): string | undefined => {
  const [icon] = m?.icon || m?.iconurl || m?.icon64 || m?.icon64url || [];
  return icon || undefined;
};

// 从 metadata 提取本地化名称（name:lang 条目）
export const extractLocalizedNames = (m: Script["metadata"]): Record<string, string> | undefined => {
  if (!m) return undefined;
  const names: Record<string, string> = {};
  for (const key of Object.keys(m)) {
    if (key.startsWith("name:") && m[key]?.[0]) {
      names[key.slice(5)] = m[key]![0];
    }
  }
  return Object.keys(names).length > 0 ? names : undefined;
};

export const scriptToMenu = (script: Script): ScriptMenu => {
  return {
    uuid: script.uuid,
    name: script.name,
    storageName: getStorageName(script),
    enable: script.status === SCRIPT_STATUS_ENABLE,
    updatetime: script.updatetime || 0,
    hasUserConfig: !!script.config,
    icon: extractIcon(script.metadata),
    localizedNames: extractLocalizedNames(script.metadata),
    runStatus: script.runStatus,
    runNum: script.type === SCRIPT_TYPE_NORMAL ? 0 : script.runStatus === SCRIPT_RUN_STATUS_RUNNING ? 1 : 0,
    runNumByIframe: 0,
    menus: [],
    isEffective: null,
  };
};

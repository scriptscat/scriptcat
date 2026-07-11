import type { ScriptMenu } from "@App/app/service/service_worker/types";
import { ExtVersion } from "@App/app/const";
import { cacheInstance } from "@App/app/cache";
import { sanitizeHTML } from "@App/pkg/utils/sanitize";
import { getCurrentTab } from "@App/pkg/utils/utils";
import { createPreloadableQuery } from "@App/pages/preloadable-query";
import { popupClient } from "../store/features/script";
import { systemConfig } from "../store/global";

export type ScriptProvider = "scriptcat" | "greasyfork" | "openuserjs";

export type PopupInitialData = {
  tabId: number;
  url: string;
  isEnableScript: boolean;
  checkUpdate: { notice: string; version: string; isRead: boolean };
  menuExpandNum: number;
  defaultScriptProvider: ScriptProvider;
  isBlacklist: boolean;
  scriptList: ScriptMenu[];
  backScriptList: ScriptMenu[];
};

/** 排序：启用优先 → 菜单数量多者优先 → 执行次数多者优先 → 更新时间新者优先 */
export const scriptListSorter = (a: ScriptMenu, b: ScriptMenu) =>
  (b.enable ? 1 : 0) - (a.enable ? 1 : 0) ||
  b.menus.length - a.menus.length ||
  b.runNum - a.runNum ||
  b.updatetime - a.updatetime;

const popupDataQuery = createPreloadableQuery<"popup", PopupInitialData>({
  key: (key) => key,
  load: async (_key, signal) => {
    const [tab, isEnableScript, checkUpdate, menuExpandNum, provider] = await Promise.all([
      getCurrentTab(),
      systemConfig.getEnableScript(),
      systemConfig.getCheckUpdate({ sanitizeHTML }),
      systemConfig.getMenuExpandNum(),
      cacheInstance.get<ScriptProvider>("default_script_provider"),
    ]);

    if (signal.aborted) throw new DOMException("Popup preload aborted", "AbortError");

    const tabId = tab?.id ?? -1;
    const url = tab?.url ?? "";
    const popupData =
      tabId >= 0 && url
        ? await popupClient.getPopupData({ tabId, url })
        : { isBlacklist: false, scriptList: [], backScriptList: [] };

    if (signal.aborted) throw new DOMException("Popup preload aborted", "AbortError");

    return {
      tabId,
      url,
      isEnableScript,
      checkUpdate: checkUpdate ?? { notice: "", version: ExtVersion, isRead: false },
      menuExpandNum,
      defaultScriptProvider: provider ?? "scriptcat",
      isBlacklist: popupData.isBlacklist,
      scriptList: popupData.scriptList.sort(scriptListSorter),
      backScriptList: popupData.backScriptList,
    };
  },
});

export function preloadPopupData() {
  popupDataQuery.preload("popup").catch(() => {});
}

export function usePopupDataQuery() {
  return popupDataQuery.useQuery("popup");
}

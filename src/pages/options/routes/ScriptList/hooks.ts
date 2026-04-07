import { useEffect, useMemo, useState } from "react";
import {
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import { fetchScript, fetchScriptList } from "@App/pages/store/features/script";
import { loadScriptFavicons } from "@App/pages/store/favicons";
import { systemConfig, subscribeMessage } from "@App/pages/store/global";
import { parseTags } from "@App/app/repo/metadata";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import { cacheInstance } from "@App/app/cache";
import { t } from "@App/locales/locales";
import { HookManager } from "@App/pkg/utils/hookManager";

import type { ScriptLoading } from "@App/pages/store/features/script";
import type {
  TScriptRunStatus,
  TInstallScript,
  TDeleteScript,
  TEnableScript,
  TSortedScript,
} from "@App/app/service/queue";
import type { SearchFilterRequest } from "./SearchFilter";

import { Code, Play, Pause, Square, Monitor, Clock, Tag, Link } from "lucide-react";

export type TFilterKey = null | string | number;

export interface FilterItem {
  key: TFilterKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  color?: string;
}

export type TSelectFilter = {
  status: TFilterKey;
  type: TFilterKey;
  tags: TFilterKey;
  source: TFilterKey;
};

export type TSelectFilterKeys = keyof TSelectFilter;

/**
 * 管理脚本数据的核心逻辑
 */
export function useScriptDataManagement() {
  const [scriptList, setScriptList] = useState<ScriptLoading[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);

  // 初始化列表与 Favicon 加载
  useEffect(() => {
    let mounted = true;
    setLoadingList(true);
    fetchScriptList().then(async (list) => {
      if (!mounted) return;
      setScriptList(list);
      setLoadingList(false);
      cacheInstance.tx("faviconOPFSControl", async () => {
        if (!mounted) return;
        const faviconService = await systemConfig.getFaviconService();
        for await (const { chunkResults } of loadScriptFavicons(list, faviconService)) {
          if (!mounted) return;
          setScriptList((prev) => {
            const favMap = new Map(chunkResults.map((r) => [r.uuid, r]));
            let changed = false;
            const newList = prev.map((s) => {
              const item = favMap.get(s.uuid);
              if (item && s.favorite !== item.fav) {
                changed = true;
                return { ...s, favorite: item.fav };
              }
              return s;
            });
            favMap.clear();
            return changed ? newList : prev;
          });
        }
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 监听后台消息更新状态
  useEffect(() => {
    const handlers = {
      scriptRunStatus(data: TScriptRunStatus) {
        setScriptList((list) => {
          const index = list.findIndex((s) => s.uuid === data.uuid);
          if (index === -1 || list[index].runStatus === data.runStatus) return list;
          const newList = [...list];
          newList[index] = { ...list[index], runStatus: data.runStatus };
          return newList;
        });
      },
      async installScript(msg: TInstallScript) {
        const installedScript = await fetchScript(msg.script.uuid);
        if (!installedScript) return;
        setScriptList((list) => {
          const idx = list.findIndex((s) => s.uuid === installedScript.uuid);
          if (idx !== -1) {
            const newList = [...list];
            newList[idx] = { ...newList[idx], ...installedScript };
            return newList;
          }
          const res = [{ ...installedScript }, ...list];
          res.forEach((s, i) => (s.sort = i));
          return res;
        });
      },
      deleteScripts(data: TDeleteScript[]) {
        const set = new Set(data.map((d) => d.uuid));
        setScriptList((list) => {
          const res = list.filter((s) => !set.has(s.uuid));
          if (res.length === list.length) return list;
          res.forEach((s, i) => (s.sort = i));
          return res;
        });
      },
      enableScripts(data: TEnableScript[]) {
        const map = new Map(data.map((d) => [d.uuid, d.enable]));
        setScriptList((list) => {
          let changed = false;
          const newList = list.map((s) => {
            if (map.has(s.uuid)) {
              const nextStatus = map.get(s.uuid) ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
              if (s.status !== nextStatus || s.enableLoading) {
                changed = true;
                return { ...s, status: nextStatus, enableLoading: false };
              }
            }
            return s;
          });
          return changed ? newList : list;
        });
      },
      sortedScripts(sorting: TSortedScript[]) {
        setScriptList((list) => {
          const currentOrder = list.map((s) => s.uuid).join(",");
          const newOrder = sorting.map((s) => s.uuid).join(",");
          if (currentOrder === newOrder) return list;
          const sortingObject: Record<string, { obj: ScriptLoading; order?: number }> = {};
          for (let i = 0; i < list.length; i++) {
            sortingObject[list[i].uuid] = { obj: list[i] };
          }
          for (let i = 0; i < sorting.length; i++) {
            const entry = sortingObject[sorting[i].uuid];
            if (entry) entry.order = i;
          }
          const entries = Object.values(sortingObject);
          entries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          return entries.map((entry, i) => {
            entry.obj.sort = i;
            return entry.obj;
          });
        });
      },
    } as const;

    const hookMgr = new HookManager();
    hookMgr.append(
      subscribeMessage<TScriptRunStatus>("scriptRunStatus", handlers.scriptRunStatus),
      subscribeMessage<TInstallScript>("installScript", handlers.installScript),
      subscribeMessage<TDeleteScript[]>("deleteScripts", handlers.deleteScripts),
      subscribeMessage<TEnableScript[]>("enableScripts", handlers.enableScripts),
      subscribeMessage<TSortedScript[]>("sortedScripts", handlers.sortedScripts)
    );
    return hookMgr.unhook;
  }, []);

  return { scriptList, setScriptList, loadingList };
}

/**
 * 管理统计与过滤逻辑
 */
export function useScriptFilters(
  scriptList: ScriptLoading[],
  _selectedFilters: TSelectFilter,
  _searchRequest: SearchFilterRequest
) {
  const stats = useMemo(() => {
    const tagMap: Record<string, Set<string>> = {};
    const originMap: Record<string, Set<string>> = {};
    const counts = { enable: 0, disable: 0, running: 0, stopped: 0, normal: 0, background: 0, crontab: 0 };

    for (const s of scriptList) {
      if (s.status === SCRIPT_STATUS_ENABLE) counts.enable++;
      else counts.disable++;
      if (s.type !== SCRIPT_TYPE_NORMAL) {
        if (s.runStatus === SCRIPT_RUN_STATUS_RUNNING) counts.running++;
        else counts.stopped++;
      }
      if (s.type === SCRIPT_TYPE_NORMAL) counts.normal++;
      else {
        counts.background++;
        if (s.type === SCRIPT_TYPE_CRONTAB) counts.crontab++;
      }
      const meta = s.selfMetadata ? getCombinedMeta(s.metadata, s.selfMetadata) : s.metadata;
      for (const tag of parseTags(meta)) {
        if (!tagMap[tag]) tagMap[tag] = new Set();
        tagMap[tag].add(s.uuid);
      }
      if (s.originDomain) {
        if (!originMap[s.originDomain]) originMap[s.originDomain] = new Set();
        originMap[s.originDomain].add(s.uuid);
      }
    }
    return { tagMap, originMap, counts };
  }, [scriptList]);

  const filterItems = useMemo(() => {
    const { counts, tagMap, originMap } = stats;

    const statusItems: FilterItem[] = [
      { key: null, label: t("script_list.sidebar.all"), icon: Code, count: scriptList.length },
      { key: SCRIPT_STATUS_ENABLE, label: t("enable"), icon: Play, count: counts.enable, color: "text-green-500" },
      { key: SCRIPT_STATUS_DISABLE, label: t("disable"), icon: Pause, count: counts.disable, color: "text-red-500" },
      {
        key: SCRIPT_RUN_STATUS_RUNNING,
        label: t("running"),
        icon: Play,
        count: counts.running,
        color: "text-blue-500",
      },
      {
        key: SCRIPT_RUN_STATUS_COMPLETE,
        label: t("script_list.sidebar.stopped"),
        icon: Square,
        count: counts.stopped,
        color: "text-muted-foreground",
      },
    ];

    const typeItems: FilterItem[] = [
      { key: null, label: t("script_list.sidebar.all"), icon: Code, count: scriptList.length },
      {
        key: SCRIPT_TYPE_NORMAL,
        label: t("script_list.sidebar.normal_script"),
        icon: Code,
        count: counts.normal,
        color: "text-blue-500",
      },
      {
        key: SCRIPT_TYPE_BACKGROUND,
        label: t("background_script"),
        icon: Monitor,
        count: counts.background,
        color: "text-purple-500",
      },
      {
        key: SCRIPT_TYPE_CRONTAB,
        label: t("scheduled_script"),
        icon: Clock,
        count: counts.crontab,
        color: "text-orange-500",
      },
    ];

    const tagItems: FilterItem[] = [
      { key: null, label: t("script_list.sidebar.all"), icon: Tag, count: Object.keys(tagMap).length },
      ...Object.keys(tagMap)
        .sort()
        .map((tag) => ({
          key: tag,
          label: tag,
          count: tagMap[tag].size,
          icon: Tag,
        })),
    ];

    const sourceItems: FilterItem[] = [
      { key: null, label: t("script_list.sidebar.all"), icon: Link, count: Object.keys(originMap).length },
      ...Object.keys(originMap)
        .sort()
        .map((src) => ({
          key: src,
          label: src,
          count: originMap[src].size,
          icon: Link,
        })),
    ];

    return { statusItems, typeItems, tagItems, sourceItems };
  }, [stats, scriptList.length]);

  return { stats, filterItems };
}

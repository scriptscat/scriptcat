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
import { parseTags } from "@App/app/repo/metadata";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import { cacheInstance } from "@App/app/cache";

// 组件与工具
import { type SearchFilterRequest } from "./SearchFilter";
import { hashColor } from "../utils";
import {
  IconCode,
  IconPlayArrow,
  IconPause,
  IconStop,
  IconDesktop,
  IconClockCircle,
  IconTags,
  IconLink,
} from "@arco-design/web-react/icon";

// 类型定义
import type { ScriptLoading } from "@App/pages/store/features/script";
import type {
  TScriptRunStatus,
  TInstallScript,
  TDeleteScript,
  TEnableScript,
  TSortedScript,
} from "@App/app/service/queue";
import { type useTranslation } from "react-i18next";
import { subscribeMessage } from "@App/pages/store/global";
import { HookManager } from "@App/pkg/utils/hookManager";

export type TFilterKey = null | string | number;

export interface FilterItem {
  key: TFilterKey;
  label: string;
  icon: React.ReactNode;
  count: number;
}

export type TSelectFilter = {
  status: TFilterKey;
  type: TFilterKey;
  tags: TFilterKey;
  source: TFilterKey;
};

export type TSelectFilterKeys = keyof TSelectFilter;

/**
 * 钩子 1: 管理脚本数据的核心逻辑
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
        for await (const { chunkResults } of loadScriptFavicons(list)) {
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
            favMap.clear(); // GC
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
    const pageApi = {
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
          const orderChanged = list.map((s) => s.uuid).join(",") !== sorting.map((s) => s.uuid).join(",");
          if (!orderChanged) return list;
          const sortingObject: Record<
            string,
            {
              obj: ScriptLoading;
              order?: number;
            }
          > = {};
          for (let i = 0, l = list.length; i < l; i += 1) {
            sortingObject[list[i].uuid] = {
              obj: list[i],
              // order: undefined, // no order change
            };
          }
          for (let i = 0, l = sorting.length; i < l; i += 1) {
            const entry = sortingObject[sorting[i].uuid];
            if (entry) {
              entry.order = i; // set to preferred order
            }
          }
          const entries = Object.values(sortingObject);
          //@ts-ignore
          entries.sort((a, b) => a.order - b.order || 0);
          return entries.map((entry, i) => {
            const obj = entry.obj;
            obj.sort = i;
            return obj;
          });
        });
      },
    } as const;

    const hookMgr = new HookManager();
    hookMgr.append(
      subscribeMessage<TScriptRunStatus>("scriptRunStatus", pageApi.scriptRunStatus),
      subscribeMessage<TInstallScript>("installScript", pageApi.installScript),
      subscribeMessage<TDeleteScript[]>("deleteScripts", pageApi.deleteScripts),
      subscribeMessage<TEnableScript[]>("enableScripts", pageApi.enableScripts),
      subscribeMessage<TSortedScript[]>("sortedScripts", pageApi.sortedScripts)
    );
    return hookMgr.unhook;
  }, []);

  return { scriptList, setScriptList, loadingList };
}

/**
 * 钩子 2: 管理统计与过滤逻辑
 */
export function useScriptFilters(
  scriptList: ScriptLoading[],
  selectedFilters: TSelectFilter,
  searchRequest: SearchFilterRequest,
  t: ReturnType<typeof useTranslation>[0]
) {
  // 核心数据解析与统计
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

  // 构建 Sidebar UI 项
  const filterItems = useMemo(() => {
    const { counts, tagMap, originMap } = stats;
    const tagItems = [
      { key: null, label: t("script_list.sidebar.all"), icon: <IconTags />, count: Object.keys(tagMap).length },
      ...Object.keys(tagMap)
        .sort()
        .map((tag) => ({
          key: tag,
          label: tag,
          count: tagMap[tag].size,
          icon: <div className={`tw-w-3 tw-h-3 arco-badge-color-${hashColor(tag)} tw-rounded-full`} />,
        })),
    ];
    const sourceItems = [
      { key: null, label: t("script_list.sidebar.all"), icon: <IconLink />, count: Object.keys(originMap).length },
      ...Object.keys(originMap)
        .sort()
        .map((src) => ({
          key: src,
          label: src,
          count: originMap[src].size,
          icon: <div className={`tw-w-3 tw-h-3 arco-badge-color-${hashColor(src)} tw-rounded-full`} />,
        })),
    ];

    return {
      tagItems,
      sourceItems,
      statusItems: [
        { key: null, label: t("script_list.sidebar.all"), icon: <IconCode />, count: scriptList.length },
        {
          key: SCRIPT_STATUS_ENABLE,
          label: t("enable"),
          icon: <IconPlayArrow style={{ color: "#52c41a" }} />,
          count: counts.enable,
        },
        {
          key: SCRIPT_STATUS_DISABLE,
          label: t("disable"),
          icon: <IconPause style={{ color: "#ff4d4f" }} />,
          count: counts.disable,
        },
        {
          key: SCRIPT_RUN_STATUS_RUNNING,
          label: t("running"),
          icon: <IconPlayArrow style={{ color: "#1890ff" }} />,
          count: counts.running,
        },
        {
          key: SCRIPT_RUN_STATUS_COMPLETE,
          label: t("script_list.sidebar.stopped"),
          icon: <IconStop style={{ color: "#8c8c8c" }} />,
          count: counts.stopped,
        },
      ],
      typeItems: [
        { key: null, label: t("script_list.sidebar.all"), icon: <IconCode />, count: scriptList.length },
        {
          key: SCRIPT_TYPE_NORMAL,
          label: t("script_list.sidebar.normal_script"),
          icon: <IconCode style={{ color: "#1890ff" }} />,
          count: counts.normal,
        },
        {
          key: SCRIPT_TYPE_BACKGROUND,
          label: t("background_script"),
          icon: <IconDesktop style={{ color: "#722ed1" }} />,
          count: counts.background,
        },
        {
          key: SCRIPT_TYPE_CRONTAB,
          label: t("scheduled_script"),
          icon: <IconClockCircle style={{ color: "#fa8c16" }} />,
          count: counts.crontab,
        },
      ],
    };
  }, [stats, scriptList.length, t]);

  return { stats, filterItems };
}

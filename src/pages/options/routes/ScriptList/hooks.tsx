import type { Script, UserConfig } from "@App/app/repo/scripts";
import {
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import type {
  TScriptRunStatus,
  TInstallScript,
  TDeleteScript,
  TEnableScript,
  TSortedScript,
} from "@App/app/service/queue";
import { useAppContext } from "@App/pages/store/AppContext";
import type { ScriptLoading } from "@App/pages/store/features/script";
import {
  fetchScript,
  fetchScriptList,
  requestFilterResult,
  sortScript,
  requestDeleteScripts,
  requestRunScript,
  requestStopScript,
} from "@App/pages/store/features/script";
import { loadScriptFavicons } from "@App/pages/store/favicons";
import { arrayMove } from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { hashColor } from "../utils";
import { parseTags } from "@App/app/repo/metadata";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
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
import { useTranslation } from "react-i18next";
import { ValueClient } from "@App/app/service/service_worker/client";
import { message } from "@App/pages/store/global";
import { Message } from "@arco-design/web-react";
import { cacheInstance } from "@App/app/cache";

export function useScriptList() {
  const { t } = useTranslation();
  const { subscribeMessage } = useAppContext();
  const [scriptList, setScriptList] = useState<ScriptLoading[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);

  // 初始化数据
  useEffect(() => {
    let mounted = true;
    setLoadingList(true);
    fetchScriptList().then(async (list) => {
      if (!mounted) return;
      setScriptList(list);
      setLoadingList(false);
      cacheInstance.tx("faviconOPFSControl", async () => {
        for await (const { chunkResults } of loadScriptFavicons(list)) {
          if (!mounted) return;
          setScriptList((list) => {
            const scriptMap = new Map<string, ScriptLoading>();
            for (const s of list) {
              scriptMap.set(s.uuid, s);
            }
            const altered = new Set();
            for (const item of chunkResults) {
              const script = scriptMap.get(item.uuid);
              if (script) {
                altered.add(item.uuid);
                script.favorite = item.fav;
              }
            }
            return list.map((entry) => (altered.has(entry.uuid) ? { ...entry } : entry));
          });
        }
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 监听事件
  useEffect(() => {
    const pageApi = {
      scriptRunStatus(data: TScriptRunStatus) {
        const { uuid, runStatus } = data;
        setScriptList((list: ScriptLoading[]) => {
          const index = list.findIndex((s) => s.uuid === uuid);
          if (index === -1) return list;

          const newList = [...list];
          newList[index] = { ...list[index], runStatus };
          return newList;
        });
      },

      async installScript(message: TInstallScript) {
        const installedScript = await fetchScript(message.script.uuid);
        if (!installedScript) return;
        const installedScriptUUID = installedScript.uuid;
        if (!installedScriptUUID) return;

        setScriptList((list: ScriptLoading[]) => {
          const existingIndex = list.findIndex((s) => s.uuid === installedScriptUUID);
          if (existingIndex !== -1) {
            const newList = [...list];
            newList[existingIndex] = { ...list[existingIndex], ...installedScript };
            return newList;
          }

          // 放到第一
          const res = [{ ...installedScript }, ...list];
          for (let i = 0, l = res.length; i < l; i++) {
            res[i].sort = i;
          }
          return res;
        });
      },

      deleteScripts(data: TDeleteScript[]) {
        const uuids = data.map(({ uuid }) => uuid);
        const set = new Set(uuids);
        setScriptList((list: ScriptLoading[]) => {
          const res = list.filter((s) => !set.has(s.uuid));
          for (let i = 0, l = res.length; i < l; i++) {
            res[i].sort = i;
          }
          return res;
        });
      },

      enableScripts(data: TEnableScript[]) {
        const map = new Map();
        for (const { uuid, enable } of data) {
          map.set(uuid, enable);
        }

        setScriptList((list: ScriptLoading[]) => {
          let hasChanges = false;
          const newList = list.map((script) => {
            if (map.has(script.uuid)) {
              hasChanges = true;
              const enable = map.get(script.uuid);
              return {
                ...script,
                enableLoading: false,
                status: enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE,
              };
            }
            return script;
          });

          return hasChanges ? newList : list;
        });
      },

      sortedScripts(data: TSortedScript[]) {
        setScriptList((list: ScriptLoading[]) => {
          const listEntries = new Map<string, ScriptLoading>();
          for (const item of list) {
            listEntries.set(item.uuid, item);
          }
          let j = 0;
          const res = new Array(data.length);
          for (const { uuid } of data) {
            const item = listEntries.get(uuid);
            if (item) {
              res[j] = item;
              item.sort = j;
              j++;
            }
          }
          res.length = j;
          return res;
        });
      },
    };

    const unhooks = [
      subscribeMessage<TScriptRunStatus>("scriptRunStatus", pageApi.scriptRunStatus),
      subscribeMessage<TInstallScript>("installScript", pageApi.installScript),
      subscribeMessage<TDeleteScript[]>("deleteScripts", pageApi.deleteScripts),
      subscribeMessage<TEnableScript[]>("enableScripts", pageApi.enableScripts),
      subscribeMessage<TSortedScript[]>("sortedScripts", pageApi.sortedScripts),
    ];
    return () => {
      for (const unhook of unhooks) unhook();
      unhooks.length = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateScripts = (uuids: string[], data: Partial<Script | ScriptLoading>) => {
    const set = new Set(uuids);
    setScriptList((list) => {
      let hasChanges = false;
      const newList = list.map((script) => {
        if (set.has(script.uuid)) {
          hasChanges = true;
          return { ...script, ...data };
        }
        return script;
      });

      return hasChanges ? newList : list;
    });
  };

  const scriptListSortOrder = ({ active, over }: { active: string; over: string }) => {
    setScriptList((scripts) => {
      let oldIndex = -1;
      let newIndex = -1;
      scripts.forEach((item, index) => {
        if (item.uuid === active) {
          oldIndex = index;
        } else if (item.uuid === over) {
          newIndex = index;
        }
      });
      if (oldIndex >= 0 && newIndex >= 0) {
        const newItems = arrayMove(scripts, oldIndex, newIndex);
        for (let i = 0, l = newItems.length; i < l; i += 1) {
          if (newItems[i].sort !== i) {
            newItems[i].sort = i;
          }
        }
        return newItems;
      } else {
        return scripts;
      }
    });
    sortScript({ active, over });
  };

  // 删除脚本操作
  const handleDelete = (item: ScriptLoading) => {
    const { uuid } = item;
    updateScripts([uuid], { actionLoading: true });
    requestDeleteScripts([uuid]);
  };

  // 配置脚本操作
  const handleConfig = (
    item: ScriptLoading,
    setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void
  ) => {
    new ValueClient(message).getScriptValue(item).then((newValues) => {
      setUserConfig({
        userConfig: { ...item.config! },
        script: item,
        values: newValues,
      });
    });
  };

  // 运行/停止脚本操作
  const handleRunStop = async (item: ScriptLoading) => {
    if (item.runStatus === SCRIPT_RUN_STATUS_RUNNING) {
      Message.loading({
        id: "script-stop",
        content: t("stopping_script"),
      });
      updateScripts([item.uuid], { actionLoading: true });
      await requestStopScript(item.uuid);
      updateScripts([item.uuid], { actionLoading: false });
      Message.success({
        id: "script-stop",
        content: t("script_stopped"),
        duration: 3000,
      });
    } else {
      Message.loading({
        id: "script-run",
        content: t("starting_script"),
      });
      updateScripts([item.uuid], { actionLoading: true });
      await requestRunScript(item.uuid);
      updateScripts([item.uuid], { actionLoading: false });
      Message.success({
        id: "script-run",
        content: t("script_started"),
        duration: 3000,
      });
    }
  };

  return {
    loadingList,
    scriptList,
    setScriptList,
    updateScripts,
    scriptListSortOrder,
    // 操作函数
    handleDelete,
    handleConfig,
    handleRunStop,
  };
}

export interface FilterItem {
  key: string | number;
  label: string;
  icon: React.ReactNode;
  count: number;
}

export function useScriptSearch() {
  const scriptListManager = useScriptList();
  const { t } = useTranslation();
  const { scriptList } = scriptListManager;
  const [filterScriptList, setFilterScriptList] = useState<ScriptLoading[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string | number>>({
    status: "all",
    type: "all",
    tags: "all",
    source: "all",
  });
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => localStorage.getItem("script-list-sidebar") === "1");

  // 计算数据量
  const { statusItems, typeItems, tagItems, sourceItems, tagMap, originMap } = useMemo(() => {
    // 侧边栏关闭时不计算
    if (!sidebarOpen) {
      return { statusItems: [], typeItems: [], tagItems: [], sourceItems: [], tagMap: {}, originMap: {} };
    }
    // 状态过滤选项
    const statusItems: FilterItem[] = [
      {
        key: "all",
        label: t("script_list.sidebar.all"),
        icon: <IconCode style={{ fontSize: 14 }} />,
        count: scriptList.length,
      },
      {
        key: SCRIPT_STATUS_ENABLE,
        label: t("enable"),
        icon: <IconPlayArrow style={{ fontSize: 14, color: "#52c41a" }} />,
        count: 0,
      },
      {
        key: SCRIPT_STATUS_DISABLE,
        label: t("disable"),
        icon: <IconPause style={{ fontSize: 14, color: "#ff4d4f" }} />,
        count: 0,
      },
      {
        key: SCRIPT_RUN_STATUS_RUNNING,
        label: t("running"),
        icon: <IconPlayArrow style={{ fontSize: 14, color: "#1890ff" }} />,
        count: 0,
      },
      {
        key: SCRIPT_RUN_STATUS_COMPLETE,
        label: t("script_list.sidebar.stopped"),
        icon: <IconStop style={{ fontSize: 14, color: "#8c8c8c" }} />,
        count: 0,
      },
    ];
    // 类型过滤选项
    const typeItems: FilterItem[] = [
      {
        key: "all",
        label: t("script_list.sidebar.all"),
        icon: <IconCode style={{ fontSize: 14 }} />,
        count: scriptList.length,
      },
      {
        key: SCRIPT_TYPE_NORMAL,
        label: t("script_list.sidebar.normal_script"),
        icon: <IconCode style={{ fontSize: 14, color: "#1890ff" }} />,
        count: 0,
      },
      {
        key: SCRIPT_TYPE_BACKGROUND,
        label: t("background_script"),
        icon: <IconDesktop style={{ fontSize: 14, color: "#722ed1" }} />,
        count: 0,
      },
      {
        key: SCRIPT_TYPE_CRONTAB,
        label: t("scheduled_script"),
        icon: <IconClockCircle style={{ fontSize: 14, color: "#fa8c16" }} />,
        count: 0,
      },
    ];

    // 标签过滤选项
    const tagItems: FilterItem[] = [
      {
        key: "all",
        label: t("script_list.sidebar.all"),
        icon: <IconTags style={{ fontSize: 14 }} />,
        count: scriptList.length,
      },
    ];

    // 安装来源过滤选项
    const sourceItems: FilterItem[] = [
      {
        key: "all",
        label: t("script_list.sidebar.all"),
        icon: <IconLink style={{ fontSize: 14 }} />,
        count: scriptList.length,
      },
    ];

    const tagMap = {} as Record<string, Set<string>>;
    const originMap = {} as Record<string, Set<string>>;

    for (const script of scriptList) {
      // 状态统计
      if (script.status === SCRIPT_STATUS_ENABLE) {
        statusItems[1].count++;
      } else {
        statusItems[2].count++;
      }
      if (script.type === SCRIPT_TYPE_NORMAL) {
        typeItems[1].count++;
      } else {
        if (script.runStatus === SCRIPT_RUN_STATUS_RUNNING) {
          statusItems[3].count++;
        } else {
          statusItems[4].count++;
        }
        typeItems[2].count++;
        if (script.type === SCRIPT_TYPE_CRONTAB) {
          typeItems[3].count++;
        }
      }
      // 标签统计
      let metadata = script.metadata;
      if (script.selfMetadata) {
        metadata = getCombinedMeta(metadata, script.selfMetadata);
      }
      if (metadata.tag) {
        const tags = parseTags(metadata);
        for (const tag of tags) {
          const tagMapSet = tagMap[tag] || (tagMap[tag] = new Set());
          tagMapSet.add(script.uuid);
        }
      }
      // 来源统计
      if (script.originDomain) {
        const originMapSet = originMap[script.originDomain] || (originMap[script.originDomain] = new Set());
        originMapSet.add(script.uuid);
      }
    }
    tagItems.push(
      ...Object.keys(tagMap).map((tag) => {
        // 标签过滤选项
        const count = tagMap[tag]?.size || 0;
        return {
          key: tag,
          label: tag,
          icon: <div className={`w-3 h-3 arco-badge-color-${hashColor(tag)} rounded-full`} />,
          count,
        };
      })
    );
    sourceItems.push(
      ...Object.keys(originMap).map((source) => {
        const count = originMap[source]?.size || 0;
        return {
          key: source,
          label: source,
          icon: <div className={`w-3 h-3 arco-badge-color-${hashColor(source)} rounded-full`} />,
          count,
        };
      })
    );
    return { statusItems, typeItems, tagItems, sourceItems, tagMap, originMap };
  }, [scriptList, sidebarOpen, t]);

  useEffect(() => {
    const filterFuncs: Array<(script: Script) => boolean> = [];
    for (const [groupKey, itemKey] of Object.entries(selectedFilters)) {
      switch (groupKey) {
        case "status":
          switch (itemKey) {
            case "all":
              break;
            case SCRIPT_STATUS_ENABLE:
            case SCRIPT_STATUS_DISABLE:
              filterFuncs.push((script) => script.status === itemKey);
              break;
            case SCRIPT_RUN_STATUS_RUNNING:
            case SCRIPT_RUN_STATUS_COMPLETE:
              filterFuncs.push((script) => {
                if (script.type === SCRIPT_TYPE_NORMAL) {
                  return false;
                }
                return script.runStatus === itemKey;
              });
              break;
          }
          break;
        case "type":
          switch (itemKey) {
            case "all":
              break;
            case SCRIPT_TYPE_NORMAL:
              filterFuncs.push((script) => script.type === SCRIPT_TYPE_NORMAL);
              break;
            case SCRIPT_TYPE_BACKGROUND:
              filterFuncs.push((script) => script.type === SCRIPT_TYPE_BACKGROUND);
              break;
            case SCRIPT_TYPE_CRONTAB:
              filterFuncs.push((script) => script.type === SCRIPT_TYPE_CRONTAB);
              break;
          }
          break;
        case "tags":
          if (itemKey !== "all") {
            const scriptSet = tagMap[itemKey as string];
            if (scriptSet) {
              filterFuncs.push((script) => scriptSet.has(script.uuid));
            }
          }
          break;
        case "source":
          if (itemKey !== "all") {
            const scriptSet = originMap[itemKey as string];
            if (scriptSet) {
              filterFuncs.push((script) => scriptSet.has(script.uuid));
            }
          }
          break;
      }
    }
    const filterList = scriptList.filter((script) => filterFuncs.every((fn) => fn(script)));
    if (searchKeyword !== "") {
      let mounted = true;
      // 再基于关键词过滤一次
      requestFilterResult({ value: searchKeyword, type: "auto" }).then((res) => {
        if (!mounted) return;
        const cacheMap = new Map<string, any>();
        if (res && Array.isArray(res)) {
          for (const entry of res) {
            cacheMap.set(entry.uuid, {
              code: entry.code === true,
              name: entry.name === true,
              auto: entry.auto === true,
            });
          }
        }

        setFilterScriptList(
          filterList.filter((item) => {
            const result = cacheMap.get(item.uuid);
            return result?.auto;
          })
        );
      });
      return () => {
        mounted = false;
      };
    } else {
      setFilterScriptList(filterList);
    }
  }, [originMap, scriptList, selectedFilters, tagMap, searchKeyword]);

  // 覆盖scriptListManager的排序方法
  // 避免触发顺序是 scriptList -> filterScriptList 导致列表会出现一瞬间的错乱
  const scriptListSortOrder = ({ active, over }: { active: string; over: string }) => {
    setFilterScriptList((scripts) => {
      let oldIndex = -1;
      let newIndex = -1;
      scripts.forEach((item, index) => {
        if (item.uuid === active) {
          oldIndex = index;
        } else if (item.uuid === over) {
          newIndex = index;
        }
      });
      if (oldIndex >= 0 && newIndex >= 0) {
        const newItems = arrayMove(scripts, oldIndex, newIndex);
        for (let i = 0, l = newItems.length; i < l; i += 1) {
          if (newItems[i].sort !== i) {
            newItems[i].sort = i;
          }
        }
        return newItems;
      } else {
        return scripts;
      }
    });
    scriptListManager.scriptListSortOrder!({ active, over });
  };

  return {
    ...scriptListManager,
    scriptListSortOrder,
    filterScriptList,
    selectedFilters,
    setSelectedFilters,
    keyword: searchKeyword,
    searchKeyword,
    setSearchKeyword,
    filterItems: {
      statusItems,
      typeItems,
      tagItems,
      sourceItems,
    },
    sidebarOpen,
    setSidebarOpen,
  };
}

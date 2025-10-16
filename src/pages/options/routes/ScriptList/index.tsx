import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@arco-design/web-react";
import type { Script, UserConfig } from "@App/app/repo/scripts";
import { type SCRIPT_STATUS, SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, ScriptDAO } from "@App/app/repo/scripts";
import { useSearchParams } from "react-router-dom";
import UserConfigPanel from "@App/pages/components/UserConfigPanel";
import CloudScriptPlan from "@App/pages/components/CloudScriptPlan";
import ScriptListSidebar from "./Sidebar";
import ScriptCard from "./ScriptCard";
import { message, systemConfig } from "@App/pages/store/global";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { fetchScriptList, fetchScript } from "@App/pages/store/features/script";
import { ValueClient } from "@App/app/service/service_worker/client";
import { loadScriptFavicons } from "@App/pages/store/utils";
import type {
  TDeleteScript,
  TEnableScript,
  TInstallScript,
  TScriptRunStatus,
  TSortedScript,
} from "@App/app/service/queue";
import { useAppContext } from "@App/pages/store/AppContext";
import ScriptTable from "./ScriptTabel";

const MemoizedScriptListSidebar = React.memo(
  ({ open, scriptList, onFilter }: { open: any; scriptList: any; onFilter: any }) => (
    <ScriptListSidebar open={open} scriptList={scriptList} onFilter={onFilter} />
  )
);
MemoizedScriptListSidebar.displayName = "MemoizedScriptListSidebar";

function ScriptList() {
  const { subscribeMessage } = useAppContext();

  const [userConfig, setUserConfig] = useState<{
    script: Script;
    userConfig: UserConfig;
    values: { [key: string]: any };
  }>();
  const [cloudScript, setCloudScript] = useState<Script>();
  const [mInitial, setInitial] = useState<boolean>(false);
  const [scriptList, setScriptList] = useState<ScriptLoading[]>([]);
  const [filterScriptList, setFilterScriptList] = useState<ScriptLoading[]>([]);

  const openUserConfig = useSearchParams()[0].get("userConfig") || "";
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => localStorage.getItem("script-list-sidebar") === "1");
  const [viewMode, setViewMode] = useState<"table" | "card">(
    () => (localStorage.getItem("script-list-view-mode") as "table" | "card") || "table"
  );
  const [searchValue, setSearchValue] = useState<string>("");

  const filterCache = useMemo(() => new Map<string, any>(), []);

  const setFilterCache = useCallback(
    (res: Partial<Record<string, any>>[] | null) => {
      filterCache.clear();
      if (res === null) return;
      for (const entry of res) {
        filterCache.set(entry.uuid, {
          code: entry.code === true,
          name: entry.name === true,
          auto: entry.auto === true,
        });
      }
    },
    [filterCache]
  );

  const doInitial = async () => {
    setInitial(true);
    const list = await fetchScriptList();
    setScriptList(list);

    for await (const { chunkResults } of loadScriptFavicons(list)) {
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
  };

  mInitial === false && doInitial();

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
  }, []);

  const { updateScriptList, updateEntry } = {
    updateScriptList: (data: Partial<Script | ScriptLoading>) => {
      setScriptList((list) => {
        const index = list.findIndex((script) => script.uuid === data.uuid);
        if (index === -1) return list;

        const newList = [...list];
        newList[index] = { ...list[index], ...data };
        return newList;
      });
    },
    updateEntry: (uuids: string[], data: Partial<Script | ScriptLoading>) => {
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
    },
  };

  // 设置列和判断是否打开用户配置
  useEffect(() => {
    if (openUserConfig) {
      const dao = new ScriptDAO();
      dao.get(openUserConfig).then((script) => {
        if (script && script.config) {
          new ValueClient(message).getScriptValue(script).then((values) => {
            setUserConfig({
              script,
              userConfig: script.config!,
              values: values,
            });
          });
        }
      });
    }
  }, []);

  const [canShowList, setCanShowList] = useState(false);

  // 同步 filterScriptList 与 scriptList
  useEffect(() => {
    // 如果没有搜索或筛选，直接使用 scriptList
    if (!searchValue && filterCache.size === 0) {
      setFilterScriptList(scriptList);
    }
  }, [scriptList, searchValue, filterCache]);

  console.log(canShowList, viewMode);

  return (
    <Card
      id="script-list"
      className="script-list"
      style={{
        height: "100%",
        overflowY: "auto",
      }}
    >
      <div className="flex flex-col">
        {/* 主要内容区域 */}
        <div className="flex flex-row relative">
          {/* 侧边栏 */}
          <MemoizedScriptListSidebar open={sidebarOpen} scriptList={scriptList} onFilter={setFilterScriptList} />

          {/* 主要表格/卡片区域 */}
          <div className="flex-1">
            {viewMode === "table" ? (
              <ScriptTable
                scriptList={filterScriptList}
                setCanShowList={setCanShowList}
                setScriptList={setScriptList}
                updateScriptList={updateScriptList}
                sidebarOpen={false}
                setSidebarOpen={setSidebarOpen}
                setViewMode={setViewMode}
                updateEntry={updateEntry}
                setUserConfig={setUserConfig}
                setCloudScript={setCloudScript}
                setFilterCache={setFilterCache}
                filterCache={filterCache}
              />
            ) : (
              <ScriptCard
                scriptList={filterScriptList}
                updateScriptList={updateScriptList}
                sidebarOpen={false}
                setSidebarOpen={setSidebarOpen}
                setViewMode={setViewMode}
                updateEntry={updateEntry}
                setUserConfig={setUserConfig}
                setCloudScript={setCloudScript}
                setFilterCache={setFilterCache}
              />
            )}
          </div>
        </div>

        {userConfig && (
          <UserConfigPanel script={userConfig.script} userConfig={userConfig.userConfig} values={userConfig.values} />
        )}
        <CloudScriptPlan
          script={cloudScript}
          onClose={() => {
            setCloudScript(undefined);
          }}
        />
      </div>
    </Card>
  );
}

export default ScriptList;

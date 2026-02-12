import { useCallback, useEffect, useState, memo } from "react";
import { Card, Message } from "@arco-design/web-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { arrayMove, arraySwap } from "@dnd-kit/sortable";

// 仓库与常量引用
import type { Script, UserConfig } from "@App/app/repo/scripts";
import {
  ScriptDAO,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import {
  requestDeleteScripts,
  requestRunScript,
  requestStopScript,
  sortScript,
} from "@App/pages/store/features/script";
import { ValueClient } from "@App/app/service/service_worker/client";
import { message } from "@App/pages/store/global";

// 组件与工具
import UserConfigPanel from "@App/pages/components/UserConfigPanel";
import CloudScriptPlan from "@App/pages/components/CloudScriptPlan";
import ScriptListSidebar from "./Sidebar";
import ScriptCard from "./ScriptCard";
import ScriptTable from "./ScriptTable";
import { SearchFilter, type SearchFilterRequest } from "./SearchFilter";

// 类型定义
import type { ScriptLoading } from "@App/pages/store/features/script";

import { type TSelectFilter, useScriptDataManagement, useScriptFilters } from "./hooks";

type TableProps = React.ComponentProps<typeof ScriptTable>;
type CardProps = React.ComponentProps<typeof ScriptCard>;

type SharedProps = TableProps & CardProps;

/**
 * 子组件: 渲染内容区域 (通过 memo 防止 userConfig 变更触发列表重绘)
 */
const MainContent = memo(({ viewMode, ...props }: { viewMode: "table" | "card" } & SharedProps) => {
  return viewMode === "table" ? <ScriptTable {...props} /> : <ScriptCard {...props} />;
});

MainContent.displayName = "MainContent";

/**
 * 主组件
 */
function ScriptList() {
  const { t } = useTranslation();
  const [usp] = useSearchParams();

  // 1. 基础 UI 状态
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("script-list-sidebar") === "1");
  const [viewMode, setViewMode] = useState<"table" | "card">(() => {
    const saved = localStorage.getItem("script-list-view-mode");
    if (saved === "table" || saved === "card") return saved;
    return window.screen.width < 1280 ? "card" : "table";
  });
  const [selectedFilters, setSelectedFilters] = useState<TSelectFilter>({
    status: null,
    type: null,
    tags: null,
    source: null,
  });
  const [searchRequest, setSearchRequest] = useState<SearchFilterRequest>({ keyword: "", type: "auto" });

  // 2. 弹窗状态 (独立状态，不会引起 MainContent 重绘)
  const [userConfig, setUserConfig] = useState<{
    script: Script;
    userConfig: UserConfig;
    values: Record<string, any>;
  }>();
  const [cloudScript, setCloudScript] = useState<Script>();

  // 3. 数据与统计 Hook
  const { scriptList, setScriptList, loadingList } = useScriptDataManagement();
  const { stats, filterItems } = useScriptFilters(scriptList, selectedFilters, searchRequest, t);
  const [filterScriptList, setFilterScriptList] = useState<ScriptLoading[]>([]);

  // 4. 更新函数 (useCallback 保证引用稳定)
  const updateScripts = useCallback(
    (uuids: string[], data: Partial<ScriptLoading>) => {
      const set = new Set(uuids);
      setScriptList((list) => {
        let changed = false;
        const newList = list.map((s) => {
          if (set.has(s.uuid)) {
            let hasDiff = false;
            const next = { ...s };
            for (const [k, v] of Object.entries(data)) {
              if ((s as any)[k] !== v) {
                hasDiff = true;
                (next as any)[k] = v;
              }
            }
            if (hasDiff) {
              changed = true;
              return next;
            }
          }
          return s;
        });
        return changed ? newList : list;
      });
    },
    [setScriptList]
  );

  // 5. 业务操作函数
  const handleDelete = useCallback(
    (item: ScriptLoading) => {
      updateScripts([item.uuid], { actionLoading: true });
      requestDeleteScripts([item.uuid]);
    },
    [updateScripts]
  );

  const handleConfig = useCallback((item: ScriptLoading) => {
    new ValueClient(message).getScriptValue(item).then((newValues) => {
      setUserConfig({ userConfig: { ...item.config! }, script: item, values: newValues });
    });
  }, []);

  const handleRunStop = useCallback(
    async (item: ScriptLoading) => {
      const isRunning = item.runStatus === SCRIPT_RUN_STATUS_RUNNING;
      const msgId = isRunning ? "script-stop" : "script-run";
      Message.loading({ id: msgId, content: t(isRunning ? "stopping_script" : "starting_script") });
      updateScripts([item.uuid], { actionLoading: true });
      try {
        if (isRunning) await requestStopScript(item.uuid);
        else await requestRunScript(item.uuid);
        Message.success({ id: msgId, content: t(isRunning ? "script_stopped" : "script_started"), duration: 3000 });
      } catch (_err) {
        Message.error({ id: msgId, content: t("operation_failed") });
      } finally {
        updateScripts([item.uuid], { actionLoading: false });
      }
    },
    [t, updateScripts]
  );

  const scriptListSortOrderMove = useCallback(
    ({ active, over }: { active: string; over: string }) => {
      setFilterScriptList((prev) => {
        const before = prev.map((s) => s.uuid);
        const oldIdx = before.findIndex((id) => id === active);
        const newIdx = before.findIndex((id) => id === over);
        if (oldIdx !== -1 && newIdx !== -1) {
          const next = arrayMove(prev, oldIdx, newIdx);
          const after = next.map((s) => s.uuid);
          sortScript({ before, after });
          next.forEach((s, i) => (s.sort = i));
          return next;
        }
        return prev;
      });
    },
    [setFilterScriptList]
  );

  const scriptListSortOrderSwap = useCallback(
    ({ active, over }: { active: string; over: string }) => {
      setFilterScriptList((prev) => {
        const before = prev.map((s) => s.uuid);
        const oldIdx = before.findIndex((id) => id === active);
        const newIdx = before.findIndex((id) => id === over);
        if (oldIdx !== -1 && newIdx !== -1) {
          const next = arraySwap(prev, oldIdx, newIdx);
          const after = next.map((s) => s.uuid);
          sortScript({ before, after });
          next.forEach((s, i) => (s.sort = i));
          return next;
        }
        return prev;
      });
    },
    [setFilterScriptList]
  );

  // 6. 执行过滤逻辑
  useEffect(() => {
    const { status, type, tags, source } = selectedFilters;
    const list = scriptList.filter((s) => {
      if (status !== null) {
        if (status === SCRIPT_STATUS_ENABLE || status === SCRIPT_STATUS_DISABLE) {
          if (s.status !== status) return false;
        } else if (s.type === SCRIPT_TYPE_NORMAL || s.runStatus !== status) return false;
      }
      if (type !== null) {
        if (type === SCRIPT_TYPE_NORMAL) {
          if (s.type !== SCRIPT_TYPE_NORMAL) return false;
        } else if (type === SCRIPT_TYPE_BACKGROUND) {
          if (s.type !== SCRIPT_TYPE_BACKGROUND && s.type !== SCRIPT_TYPE_CRONTAB) return false;
        } else if (s.type !== SCRIPT_TYPE_CRONTAB) return false;
      }
      if (tags !== null && !stats.tagMap[tags as string]?.has(s.uuid)) return false;
      if (source !== null && !stats.originMap[source as string]?.has(s.uuid)) return false;
      return true;
    });

    let enableKeywordSearch = false;
    if (searchRequest.keyword) {
      enableKeywordSearch = true;
      SearchFilter.requestFilterResult(searchRequest).then(() => {
        if (!enableKeywordSearch) return; // effect cleanup 了
        setFilterScriptList(list.filter((s) => SearchFilter.checkByUUID(s.uuid)));
      });
    } else {
      setFilterScriptList(list);
    }
    return () => {
      enableKeywordSearch = false;
    };
  }, [scriptList, selectedFilters, stats, searchRequest]);

  // 处理 URL 传参打开配置
  useEffect(() => {
    const openId = usp.get("userConfig");
    if (openId) {
      new ScriptDAO().get(openId).then((script) => {
        if (script?.config) {
          new ValueClient(message)
            .getScriptValue(script)
            .then((values) => setUserConfig({ script, userConfig: script.config!, values }));
        }
      });
    }
  }, []);

  return (
    <Card id="script-list" className="script-list" style={{ height: "100%", overflowY: "auto" }}>
      <div className="tw-flex tw-flex-col">
        <div className="tw-flex tw-flex-row tw-relative">
          <ScriptListSidebar
            open={sidebarOpen}
            filterItems={filterItems}
            selectedFilters={selectedFilters}
            setSelectedFilters={setSelectedFilters}
          />
          <div className="tw-flex-1">
            <MainContent
              viewMode={viewMode}
              loadingList={loadingList}
              scriptList={filterScriptList}
              scriptListSortOrderMove={scriptListSortOrderMove}
              scriptListSortOrderSwap={scriptListSortOrderSwap}
              updateScripts={updateScripts}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              setViewMode={setViewMode}
              setUserConfig={setUserConfig}
              setCloudScript={setCloudScript}
              handleDelete={handleDelete}
              handleConfig={handleConfig}
              handleRunStop={handleRunStop}
              searchRequest={searchRequest} // Card 模式需要
              setSearchRequest={setSearchRequest}
            />
          </div>
        </div>

        {userConfig && (
          <UserConfigPanel script={userConfig.script} userConfig={userConfig.userConfig} values={userConfig.values} />
        )}
        <CloudScriptPlan script={cloudScript} onClose={() => setCloudScript(undefined)} />
      </div>
    </Card>
  );
}

export default ScriptList;

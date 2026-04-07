import { useCallback, useEffect, useState, memo } from "react";
import { arrayMove, arraySwap } from "@dnd-kit/sortable";
import {
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import {
  requestDeleteScripts,
  requestEnableScript,
  requestRunScript,
  requestStopScript,
  scriptClient,
  sortScript,
} from "@App/pages/store/features/script";
import type { ScriptLoading } from "@App/pages/store/features/script";

import ScriptTable from "./ScriptTable";
import type { ScriptTableProps } from "./ScriptTable";
import ScriptCard from "./ScriptCard";
import type { ScriptCardProps } from "./ScriptCard";
import { SearchFilter, type SearchFilterRequest } from "./SearchFilter";
import { type TSelectFilter, useScriptDataManagement, useScriptFilters } from "./hooks";
import type { FilterBarProps } from "./FilterBar";
import type { BatchActionsBarProps } from "./BatchActionsBar";

type SelectionProps = {
  selectedUuids: Set<string>;
  toggleSelect: (uuid: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
};

type BatchProps = Pick<
  BatchActionsBarProps,
  "onBatchEnable" | "onBatchDisable" | "onBatchExport" | "onBatchDelete" | "onBatchPinTop" | "onBatchCheckUpdate"
>;

type ContentProps = { viewMode: "table" | "card" } & ScriptTableProps &
  Pick<ScriptCardProps, "scriptListSortOrderSwap"> &
  FilterBarProps &
  SelectionProps &
  BatchProps;

/**
 * 子组件: 内容区域（memo 防止弹窗状态引起列表重绘）
 */
const MainContent = memo(({ viewMode, scriptListSortOrderSwap, ...rest }: ContentProps) => {
  if (viewMode === "card") {
    return <ScriptCard {...rest} scriptListSortOrderSwap={scriptListSortOrderSwap} />;
  }
  return <ScriptTable {...rest} />;
});
MainContent.displayName = "MainContent";

/**
 * 脚本列表主组件
 */
export default function ScriptList() {
  // 1. UI 状态
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

  // 2. 数据 Hook
  const { scriptList, setScriptList, loadingList } = useScriptDataManagement();
  const { stats, filterItems } = useScriptFilters(scriptList, selectedFilters, searchRequest);
  const [filterScriptList, setFilterScriptList] = useState<ScriptLoading[]>([]);

  // 3. 持久化视图切换
  const handleSetViewMode = useCallback((mode: "table" | "card") => {
    localStorage.setItem("script-list-view-mode", mode);
    setViewMode(mode);
  }, []);

  // 4. 更新脚本（useCallback 保证引用稳定）
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
              if ((s as unknown as Record<string, unknown>)[k] !== v) {
                hasDiff = true;
                (next as unknown as Record<string, unknown>)[k] = v;
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

  // 5. 选择状态
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((uuid: string) => {
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedUuids((prev) => {
      if (prev.size === filterScriptList.length && prev.size > 0) return new Set();
      return new Set(filterScriptList.map((s) => s.uuid));
    });
  }, [filterScriptList]);

  const clearSelection = useCallback(() => setSelectedUuids(new Set()), []);

  // 6. 业务操作
  const handleDelete = useCallback(
    (item: ScriptLoading) => {
      updateScripts([item.uuid], { actionLoading: true });
      requestDeleteScripts([item.uuid]);
    },
    [updateScripts]
  );

  const handleRunStop = useCallback(
    async (item: ScriptLoading) => {
      const isRunning = item.runStatus === SCRIPT_RUN_STATUS_RUNNING;
      updateScripts([item.uuid], { actionLoading: true });
      try {
        if (isRunning) await requestStopScript(item.uuid);
        else await requestRunScript(item.uuid);
      } catch {
        // TODO: toast 错误提示
      } finally {
        updateScripts([item.uuid], { actionLoading: false });
      }
    },
    [updateScripts]
  );

  // 7. 批量操作（操作后保留选中状态）
  const handleBatchEnable = useCallback(() => {
    selectedUuids.forEach((uuid) => requestEnableScript({ uuid, enable: true }));
  }, [selectedUuids]);

  const handleBatchDisable = useCallback(() => {
    selectedUuids.forEach((uuid) => requestEnableScript({ uuid, enable: false }));
  }, [selectedUuids]);

  const handleBatchDelete = useCallback(() => {
    requestDeleteScripts([...selectedUuids]);
  }, [selectedUuids]);

  const handleBatchCheckUpdate = useCallback(() => {
    selectedUuids.forEach((uuid) => scriptClient.requestCheckUpdate(uuid));
  }, [selectedUuids]);

  const handleBatchExport = useCallback(() => {
    // TODO: 导出功能
  }, []);

  const handleBatchPinTop = useCallback(() => {
    // TODO: 置顶功能
  }, []);

  // 6. 拖拽排序
  const scriptListSortOrderMove = useCallback(
    ({ active, over }: { active: string; over: string }) => {
      setFilterScriptList((prev) => {
        const before = prev.map((s) => s.uuid);
        const oldIdx = before.indexOf(active);
        const newIdx = before.indexOf(over);
        if (oldIdx === -1 || newIdx === -1) return prev;
        const next = arrayMove(prev, oldIdx, newIdx);
        const after = next.map((s) => s.uuid);
        sortScript({ before, after });
        next.forEach((s, i) => (s.sort = i));
        return next;
      });
    },
    [setFilterScriptList]
  );

  const scriptListSortOrderSwap = useCallback(
    ({ active, over }: { active: string; over: string }) => {
      setFilterScriptList((prev) => {
        const before = prev.map((s) => s.uuid);
        const oldIdx = before.indexOf(active);
        const newIdx = before.indexOf(over);
        if (oldIdx === -1 || newIdx === -1) return prev;
        const next = arraySwap(prev, oldIdx, newIdx);
        const after = next.map((s) => s.uuid);
        sortScript({ before, after });
        next.forEach((s, i) => (s.sort = i));
        return next;
      });
    },
    [setFilterScriptList]
  );

  // 7. 过滤逻辑
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
        if (!enableKeywordSearch) return;
        setFilterScriptList(list.filter((s) => SearchFilter.checkByUUID(s.uuid)));
      });
    } else {
      setFilterScriptList(list);
    }
    return () => {
      enableKeywordSearch = false;
    };
  }, [scriptList, selectedFilters, stats, searchRequest]);

  return (
    <div className="flex flex-col h-full">
      <MainContent
        viewMode={viewMode}
        scriptList={filterScriptList}
        loadingList={loadingList}
        updateScripts={updateScripts}
        handleDelete={handleDelete}
        handleRunStop={handleRunStop}
        setViewMode={handleSetViewMode}
        searchRequest={searchRequest}
        setSearchRequest={setSearchRequest}
        totalCount={scriptList.length}
        scriptListSortOrderMove={scriptListSortOrderMove}
        scriptListSortOrderSwap={scriptListSortOrderSwap}
        filterItems={filterItems}
        selectedFilters={selectedFilters}
        setSelectedFilters={setSelectedFilters}
        selectedUuids={selectedUuids}
        toggleSelect={toggleSelect}
        toggleSelectAll={toggleSelectAll}
        clearSelection={clearSelection}
        onBatchEnable={handleBatchEnable}
        onBatchDisable={handleBatchDisable}
        onBatchExport={handleBatchExport}
        onBatchDelete={handleBatchDelete}
        onBatchPinTop={handleBatchPinTop}
        onBatchCheckUpdate={handleBatchCheckUpdate}
      />
    </div>
  );
}

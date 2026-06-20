import { useCallback, useEffect, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { arrayMove } from "@dnd-kit/sortable";
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
  synchronizeClient,
  pinToTop,
  sortScript,
} from "@App/pages/store/features/script";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { useSearchParams } from "react-router-dom";
import type { Script } from "@App/app/repo/scripts";
import UserConfigPanel from "@App/pages/components/UserConfigPanel";
import CloudScriptPlan from "@App/pages/components/CloudScriptPlan";

import ScriptTable from "./ScriptTable";
import type { ScriptTableProps } from "./ScriptTable";
import ScriptCard from "./ScriptCard";
import { SearchFilter, type SearchFilterRequest } from "./SearchFilter";
import { type TSelectFilter, useScriptDataManagement, useScriptFilters } from "./hooks";
import type { FilterBarProps } from "./FilterBar";
import type { BatchActionsBarProps } from "./BatchActionsBar";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import ScriptListMobile from "./ScriptListMobile";
import { toast } from "sonner";
import { useUserConfigPreload } from "./preload";

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

type ContentProps = { viewMode: "table" | "card" } & ScriptTableProps & FilterBarProps & SelectionProps & BatchProps;

/**
 * 子组件: 内容区域（memo 防止弹窗状态引起列表重绘）
 */
const MainContent = memo(({ viewMode, ...rest }: ContentProps) => {
  if (viewMode === "card") {
    return <ScriptCard {...rest} />;
  }
  return <ScriptTable {...rest} />;
});
MainContent.displayName = "MainContent";

function PreloadedUserConfigPanel({ script, onClose }: { script: Script; onClose: () => void }) {
  const { t } = useTranslation();
  const query = useUserConfigPreload(script);

  useEffect(() => {
    if (!query.isError) return;
    toast.error(`${t("script:operation_failed")}: ${query.error instanceof Error ? query.error.message : query.error}`);
  }, [query.error, query.isError, t]);

  if (!query.data) return null;
  return (
    <UserConfigPanel
      open
      onOpenChange={(open) => !open && onClose()}
      script={query.data.script}
      userConfig={query.data.userConfig}
      values={query.data.values}
    />
  );
}

/**
 * 脚本列表主组件
 */
export default function ScriptList() {
  const { t } = useTranslation();
  // 1. UI 状态
  const [viewMode, setViewMode] = useState<"table" | "card">(() => {
    const saved = localStorage.getItem("script-list-view-mode");
    return saved === "table" || saved === "card" ? saved : "table";
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
  const isMobile = useIsMobile();
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
  // 删除脚本（二次确认由行内 / 批量栏的 Popconfirm 气泡完成，此处直接执行删除）
  const deleteScripts = useCallback(
    async (uuids: string[]) => {
      updateScripts(uuids, { actionLoading: true });
      try {
        await requestDeleteScripts(uuids);
        toast.success(t("delete_success"));
      } catch (e) {
        updateScripts(uuids, { actionLoading: false });
        toast.error(`${t("script:delete_failed")}: ${e}`);
      }
    },
    [updateScripts, t]
  );

  const handleDelete = useCallback((item: ScriptLoading) => deleteScripts([item.uuid]), [deleteScripts]);

  const handleRunStop = useCallback(
    async (item: ScriptLoading) => {
      const isRunning = item.runStatus === SCRIPT_RUN_STATUS_RUNNING;
      updateScripts([item.uuid], { actionLoading: true });
      try {
        if (isRunning) await requestStopScript(item.uuid);
        else await requestRunScript(item.uuid);
      } catch (e) {
        toast.error(`${t("script:operation_failed")}: ${e}`);
      } finally {
        updateScripts([item.uuid], { actionLoading: false });
      }
    },
    [updateScripts, t]
  );

  // 7. 批量操作（操作后保留选中状态）
  const handleBatchEnable = useCallback(() => {
    selectedUuids.forEach((uuid) => requestEnableScript({ uuid, enable: true }));
  }, [selectedUuids]);

  const handleBatchDisable = useCallback(() => {
    selectedUuids.forEach((uuid) => requestEnableScript({ uuid, enable: false }));
  }, [selectedUuids]);

  const handleBatchDelete = useCallback(() => {
    if (selectedUuids.size === 0) return;
    deleteScripts([...selectedUuids]);
  }, [selectedUuids, deleteScripts]);

  const handleBatchCheckUpdate = useCallback(() => {
    selectedUuids.forEach((uuid) => scriptClient.requestCheckUpdate(uuid));
  }, [selectedUuids]);

  // 按列表中的 sort 升序取出选中脚本的 uuid（导出/置顶均需保持显示顺序）
  const selectedUuidsBySort = useCallback(() => {
    return scriptList
      .filter((s) => selectedUuids.has(s.uuid))
      .sort((a, b) => a.sort - b.sort)
      .map((s) => s.uuid);
  }, [scriptList, selectedUuids]);

  // 用户配置面板：通过 ?userConfig=<uuid> 打开（菜单项 navigate 到该地址，外部也可深链）
  const [usp, setUsp] = useSearchParams();
  const userConfigUuid = usp.get("userConfig");
  const userConfigScript = userConfigUuid ? scriptList.find((script) => script.uuid === userConfigUuid) : undefined;

  const closeUserConfig = useCallback(() => {
    if (userConfigUuid) {
      const next = new URLSearchParams(usp);
      next.delete("userConfig");
      setUsp(next, { replace: true });
    }
  }, [usp, setUsp, userConfigUuid]);

  // 云端面板：通过 ?cloud=<uuid> 打开（即「上传到云端」，与脚本同步功能无关）
  const [cloudScript, setCloudScript] = useState<Script | null>(null);

  useEffect(() => {
    const uuid = usp.get("cloud");
    if (!uuid) return;
    if (cloudScript?.uuid === uuid) return;
    const script = scriptList.find((s) => s.uuid === uuid);
    if (script) setCloudScript(script);
  }, [usp, scriptList, cloudScript]);

  const closeCloud = useCallback(() => {
    setCloudScript(null);
    if (usp.get("cloud")) {
      const next = new URLSearchParams(usp);
      next.delete("cloud");
      setUsp(next, { replace: true });
    }
  }, [usp, setUsp]);

  const handleBatchExport = useCallback(() => {
    const uuids = selectedUuidsBySort();
    if (uuids.length === 0) return;
    const id = toast.loading(t("editor:exporting"));
    synchronizeClient.export(uuids).then(() => {
      toast.success(t("settings:export_success"), { id });
    });
  }, [selectedUuidsBySort, t]);

  const handleBatchPinTop = useCallback(() => {
    const uuids = selectedUuidsBySort();
    if (uuids.length === 0) return;
    pinToTop(uuids).then(() => {
      toast.success(t("script:scripts_pinned_to_top"));
    });
  }, [selectedUuidsBySort, t]);

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

  // 用户配置面板（桌面端 / 移动端共用）
  const userConfigDialog = userConfigScript?.config && (
    <PreloadedUserConfigPanel script={userConfigScript} onClose={closeUserConfig} />
  );

  // 云端面板（桌面端 / 移动端共用）
  const cloudDialog = cloudScript && (
    <CloudScriptPlan open onOpenChange={(o) => !o && closeCloud()} script={cloudScript} />
  );

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <ScriptListMobile
          scriptList={filterScriptList}
          loadingList={loadingList}
          updateScripts={updateScripts}
          handleDelete={handleDelete}
          handleRunStop={handleRunStop}
          searchRequest={searchRequest}
          setSearchRequest={setSearchRequest}
          scriptListSortOrderMove={scriptListSortOrderMove}
          filterItems={filterItems}
          selectedFilters={selectedFilters}
          setSelectedFilters={setSelectedFilters}
        />
        {userConfigDialog}
        {cloudDialog}
      </div>
    );
  }

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
      {userConfigDialog}
      {cloudDialog}
    </div>
  );
}

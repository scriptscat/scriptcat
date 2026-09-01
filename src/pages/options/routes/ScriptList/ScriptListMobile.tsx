import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckSquare } from "lucide-react";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";
import { MobileBatchBar, MobileBatchBarButton, MobileSelectionHeader } from "@App/pages/components/ui/mobile-list";
import type { ScriptLoading } from "@App/pages/store/features/script";
import type { SearchFilterRequest } from "./SearchFilter";
import type { FilterBarProps } from "./FilterBar";
import FilterBar from "./FilterBar";
import { MobileSearchBar } from "./MobileSearchBar";
import ScriptRowsMobile from "./ScriptRowsMobile";
import TrashListMobile from "./TrashListMobile";
import { useTrashCount } from "./hooks";

export interface ScriptListMobileProps extends FilterBarProps {
  scriptList: ScriptLoading[];
  loadingList: boolean;
  updateScripts: (uuids: string[], data: Partial<ScriptLoading>) => void;
  handleDelete: (script: ScriptLoading) => void;
  handleRunStop: (script: ScriptLoading) => void;
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
  scriptListSortOrderMove: (params: { active: string; over: string }) => void;
  selectedUuids: Set<string>;
  toggleSelect: (uuid: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  onBatchEnable: () => void;
  onBatchDisable: () => void;
  onBatchExport: () => void;
  onBatchDelete: () => void;
}

function ScriptListMobile({
  scriptList,
  loadingList,
  updateScripts,
  handleDelete,
  handleRunStop,
  searchRequest,
  setSearchRequest,
  scriptListSortOrderMove,
  filterItems,
  selectedFilters,
  setSelectedFilters,
  selectedUuids,
  toggleSelect,
  toggleSelectAll,
  clearSelection,
  onBatchEnable,
  onBatchDisable,
  onBatchExport,
  onBatchDelete,
}: ScriptListMobileProps) {
  const { t } = useTranslation();
  const [selectionMode, setSelectionMode] = useState(false);
  const [trashEnabled] = useSystemConfig("trash_enabled");

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    clearSelection();
  }, [clearSelection]);

  // 长按进入多选：先亮起模式，再把被长按的那一行选上
  const enterSelectionWith = useCallback(
    (uuid: string) => {
      setSelectionMode(true);
      if (!selectedUuids.has(uuid)) toggleSelect(uuid);
    },
    [selectedUuids, toggleSelect]
  );
  const [activeTab, setActiveTab] = useState<"installed" | "trash">("installed");
  const [trashSearchRequest, setTrashSearchRequest] = useState<SearchFilterRequest>({ keyword: "", type: "auto" });
  const isTrash = activeTab === "trash";

  const [trashCount, setTrashCount] = useTrashCount();
  const showTrashTab = trashCount > 0;

  // 回落：showTrashTab 转 false 时若仍停留在 trash tab，跳回 installed。用「渲染期比较」模式
  // （见 Logger/hooks.ts 同类写法）而非 effect 内同步 setState，避免级联渲染告警。
  const [lastShowTrashTab, setLastShowTrashTab] = useState(showTrashTab);
  if (lastShowTrashTab !== showTrashTab) {
    setLastShowTrashTab(showTrashTab);
    if (!showTrashTab && activeTab === "trash") setActiveTab("installed");
  }

  // 列表在多选期间被清空（删除完/筛选变化）时退回普通视图，否则只剩一条批量操作条悬在空屏上
  if (selectionMode && !isTrash && scriptList.length > 0) {
    return (
      <div className="flex flex-col h-full">
        <MobileSelectionHeader
          selectedCount={selectedUuids.size}
          allSelected={scriptList.length > 0 && selectedUuids.size === scriptList.length}
          onCancel={exitSelection}
          onToggleSelectAll={toggleSelectAll}
        />
        <ScriptRowsMobile
          scriptList={scriptList}
          loadingList={loadingList}
          updateScripts={updateScripts}
          handleDelete={handleDelete}
          handleRunStop={handleRunStop}
          scriptListSortOrderMove={scriptListSortOrderMove}
          selectionMode
          selectedUuids={selectedUuids}
          toggleSelect={toggleSelect}
          onEnterSelectionMode={enterSelectionWith}
        />
        <MobileBatchBar>
          <MobileBatchBarButton onClick={onBatchEnable}>{t("enable")}</MobileBatchBarButton>
          <MobileBatchBarButton onClick={onBatchDisable}>{t("disable")}</MobileBatchBarButton>
          <MobileBatchBarButton onClick={onBatchExport}>{t("export")}</MobileBatchBarButton>
          <Popconfirm
            description={
              (trashEnabled ?? true)
                ? t("script:confirm_delete_scripts_trash_content", { count: selectedUuids.size })
                : t("script:confirm_delete_scripts_content", { count: selectedUuids.size })
            }
            destructive
            confirmText={t("delete")}
            cancelText={t("editor:cancel")}
            onConfirm={() => {
              onBatchDelete();
              exitSelection();
            }}
          >
            <MobileBatchBarButton destructive>{t("delete")}</MobileBatchBarButton>
          </Popconfirm>
        </MobileBatchBar>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {showTrashTab && (
        <div className="flex items-center px-4 py-1.5 shrink-0">
          <div className="flex items-center flex-1 gap-0.5 p-[3px] rounded-md bg-muted">
            {(["installed", "trash"] as const).map((tab) => {
              const active = activeTab === tab;
              const count = tab === "installed" ? scriptList.length : trashCount;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center justify-center flex-1 gap-1.5 h-7 rounded-sm text-sm ${
                    active ? "bg-background font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {tab === "installed" ? t("script:tab_installed") : t("script:trash_tab")}
                  <span
                    className={`rounded-full px-1.5 text-[11px] font-medium tabular-nums ${
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 pr-4 shrink-0">
        <div className="min-w-0 flex-1">
          <MobileSearchBar
            searchRequest={isTrash ? trashSearchRequest : searchRequest}
            setSearchRequest={isTrash ? setTrashSearchRequest : setSearchRequest}
            placeholder={isTrash ? t("script:trash_search_placeholder") : undefined}
          />
        </div>
        {/* 长按不可发现，多选必须另有一个看得见的门（规格决策 7） */}
        {!isTrash && (
          <button
            type="button"
            onClick={() => setSelectionMode(true)}
            disabled={scriptList.length === 0}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-40"
          >
            <CheckSquare className="w-3 h-3" />
            {t("script:multi_select")}
          </button>
        )}
      </div>
      {isTrash ? (
        <TrashListMobile keyword={trashSearchRequest.keyword} onCountChange={setTrashCount} />
      ) : (
        <>
          <FilterBar
            filterItems={filterItems}
            selectedFilters={selectedFilters}
            setSelectedFilters={setSelectedFilters}
          />
          <ScriptRowsMobile
            scriptList={scriptList}
            loadingList={loadingList}
            updateScripts={updateScripts}
            handleDelete={handleDelete}
            handleRunStop={handleRunStop}
            scriptListSortOrderMove={scriptListSortOrderMove}
            selectionMode={false}
            selectedUuids={selectedUuids}
            toggleSelect={toggleSelect}
            onEnterSelectionMode={enterSelectionWith}
          />
        </>
      )}
    </div>
  );
}

export default React.memo(ScriptListMobile);

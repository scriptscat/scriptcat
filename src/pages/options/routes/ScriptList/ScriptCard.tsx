import React from "react";
import type { ScriptLoading } from "@App/pages/store/features/script";
import type { SearchFilterRequest } from "./SearchFilter";
import FilterBar from "./FilterBar";
import type { FilterBarProps } from "./FilterBar";
import { Toolbar } from "./Toolbar";
import ScriptCardGrid from "./ScriptCardGrid";

export interface ScriptCardProps extends FilterBarProps {
  /** 顶栏最左侧内容（tabs），透传给 Toolbar 取代标题槽位 */
  leading?: React.ReactNode;
  scriptList: ScriptLoading[];
  loadingList: boolean;
  updateScripts: (uuids: string[], data: Partial<ScriptLoading>) => void;
  handleDelete: (script: ScriptLoading) => void;
  handleRunStop: (script: ScriptLoading) => void;
  setViewMode: (mode: "table" | "card") => void;
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
  totalCount: number;
  scriptListSortOrderMove: (params: { active: string; over: string }) => void;
}

function ScriptCard({
  scriptList,
  loadingList,
  updateScripts,
  handleDelete,
  handleRunStop,
  setViewMode,
  searchRequest,
  setSearchRequest,
  totalCount,
  scriptListSortOrderMove,
  filterItems,
  selectedFilters,
  setSelectedFilters,
  leading,
}: ScriptCardProps) {
  return (
    <div className="flex flex-col h-full">
      <Toolbar
        leading={leading}
        totalCount={totalCount}
        viewMode="card"
        setViewMode={setViewMode}
        searchRequest={searchRequest}
        setSearchRequest={setSearchRequest}
      />
      <FilterBar filterItems={filterItems} selectedFilters={selectedFilters} setSelectedFilters={setSelectedFilters} />
      <ScriptCardGrid
        scriptList={scriptList}
        loadingList={loadingList}
        updateScripts={updateScripts}
        handleDelete={handleDelete}
        handleRunStop={handleRunStop}
        scriptListSortOrderMove={scriptListSortOrderMove}
      />
    </div>
  );
}

export default React.memo(ScriptCard, (prev, next) => {
  return (
    prev.loadingList === next.loadingList &&
    prev.scriptList === next.scriptList &&
    prev.searchRequest.keyword === next.searchRequest.keyword &&
    prev.searchRequest.type === next.searchRequest.type &&
    prev.totalCount === next.totalCount &&
    prev.selectedFilters === next.selectedFilters
  );
});

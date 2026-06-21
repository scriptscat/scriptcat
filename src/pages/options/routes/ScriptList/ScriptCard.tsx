import { memo } from "react";
import type { ScriptLoading } from "@App/pages/store/features/script";
import type { SearchFilterRequest } from "./SearchFilter";
import FilterBar from "./FilterBar";
import type { FilterBarProps } from "./FilterBar";
import { Toolbar } from "./Toolbar";
import ScriptCardGrid from "./ScriptCardGrid";

export interface ScriptCardProps extends FilterBarProps {
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
}: ScriptCardProps) {
  return (
    <div className="flex flex-col h-full">
      <Toolbar
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

export default memo(ScriptCard, (prev, next) => {
  return (
    prev.loadingList === next.loadingList &&
    prev.scriptList === next.scriptList &&
    prev.searchRequest.keyword === next.searchRequest.keyword &&
    prev.searchRequest.type === next.searchRequest.type &&
    prev.totalCount === next.totalCount &&
    prev.selectedFilters === next.selectedFilters
  );
});

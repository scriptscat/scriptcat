import React from "react";
import type { ScriptLoading } from "@App/pages/store/features/script";
import type { SearchFilterRequest } from "./SearchFilter";
import type { FilterBarProps } from "./FilterBar";
import FilterBar from "./FilterBar";
import { MobileSearchBar } from "./MobileSearchBar";
import ScriptCardGrid from "./ScriptCardGrid";

export interface ScriptListMobileProps extends FilterBarProps {
  scriptList: ScriptLoading[];
  loadingList: boolean;
  updateScripts: (uuids: string[], data: Partial<ScriptLoading>) => void;
  handleDelete: (script: ScriptLoading) => void;
  handleRunStop: (script: ScriptLoading) => void;
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
  scriptListSortOrderMove: (params: { active: string; over: string }) => void;
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
}: ScriptListMobileProps) {
  return (
    <div className="flex flex-col h-full">
      <MobileSearchBar searchRequest={searchRequest} setSearchRequest={setSearchRequest} />
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

export default React.memo(ScriptListMobile);

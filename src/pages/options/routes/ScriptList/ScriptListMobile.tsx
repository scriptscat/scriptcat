import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScriptLoading } from "@App/pages/store/features/script";
import type { SearchFilterRequest } from "./SearchFilter";
import type { FilterBarProps } from "./FilterBar";
import FilterBar from "./FilterBar";
import { MobileSearchBar } from "./MobileSearchBar";
import ScriptCardGrid from "./ScriptCardGrid";
import TrashCardGrid from "./TrashCardGrid";

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
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"installed" | "trash">("installed");
  const isTrash = activeTab === "trash";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-1.5 shrink-0">
        <div className="flex items-center flex-1 gap-0.5 p-[3px] rounded-md bg-muted">
          {(["installed", "trash"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 h-7 rounded-sm text-sm ${
                activeTab === tab ? "bg-background font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {tab === "installed" ? t("script:tab_installed") : t("script:trash_tab")}
            </button>
          ))}
        </div>
      </div>
      <MobileSearchBar
        searchRequest={searchRequest}
        setSearchRequest={setSearchRequest}
        placeholder={isTrash ? t("script:trash_search_placeholder") : undefined}
      />
      {isTrash ? (
        <TrashCardGrid keyword={searchRequest.keyword} />
      ) : (
        <>
          <FilterBar
            filterItems={filterItems}
            selectedFilters={selectedFilters}
            setSelectedFilters={setSelectedFilters}
          />
          <ScriptCardGrid
            scriptList={scriptList}
            loadingList={loadingList}
            updateScripts={updateScripts}
            handleDelete={handleDelete}
            handleRunStop={handleRunStop}
            scriptListSortOrderMove={scriptListSortOrderMove}
          />
        </>
      )}
    </div>
  );
}

export default React.memo(ScriptListMobile);

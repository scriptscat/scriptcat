import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SearchFilterRequest } from "./SearchFilter";

export function MobileSearchBar({
  searchRequest,
  setSearchRequest,
}: {
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-1.5 shrink-0">
      <div data-testid="mobile-search" className="flex items-center gap-2 rounded-md bg-muted/50 px-3 h-9">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          placeholder={t("script:search_scripts")}
          value={searchRequest.keyword}
          onChange={(e) => setSearchRequest({ ...searchRequest, keyword: e.target.value })}
        />
      </div>
    </div>
  );
}

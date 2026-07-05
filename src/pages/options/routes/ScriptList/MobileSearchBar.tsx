import { useTranslation } from "react-i18next";
import { SearchInput } from "@App/pages/components/ui/search-input";
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
      <div data-testid="mobile-search">
        <SearchInput
          inputClassName="text-sm"
          aria-label={t("script:search_scripts")}
          placeholder={t("script:search_scripts")}
          value={searchRequest.keyword}
          onChange={(e) => setSearchRequest({ ...searchRequest, keyword: e.target.value })}
        />
      </div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { SearchInput } from "@App/pages/components/ui/search-input";
import type { SearchFilterRequest } from "./SearchFilter";

export function MobileSearchBar({
  searchRequest,
  setSearchRequest,
  placeholder,
}: {
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const label = placeholder ?? t("script:search_scripts");
  return (
    <div className="px-4 py-1.5 shrink-0">
      <div data-testid="mobile-search">
        <SearchInput
          inputClassName="text-sm"
          aria-label={label}
          placeholder={label}
          value={searchRequest.keyword}
          onChange={(e) => setSearchRequest({ ...searchRequest, keyword: e.target.value })}
        />
      </div>
    </div>
  );
}

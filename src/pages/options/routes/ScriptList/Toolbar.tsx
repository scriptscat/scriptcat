import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { cn } from "@App/pkg/utils/cn";
import type { SearchFilterRequest } from "./SearchFilter";
import { CreateScriptMenu } from "./CreateScriptMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { SearchInput } from "@App/pages/components/ui/search-input";
import { SortMenu } from "./SortMenu";
import type { SortKey, SortState } from "./sort";

// 搜索范围：auto = 名称 + 代码
const scopeOptions: {
  type: SearchFilterRequest["type"];
  label: (t: TFunction) => string;
  desc?: (t: TFunction) => string;
}[] = [
  {
    type: "auto",
    label: (t: TFunction) => t("auto"),
    desc: (t: TFunction) => `${t("name")} + ${t("editor:script_code")}`,
  },
  { type: "name", label: (t: TFunction) => t("name") },
  { type: "script_code", label: (t: TFunction) => t("editor:script_code") },
];

function scopeLabelOf(type: SearchFilterRequest["type"], t: TFunction): string {
  return (scopeOptions.find((o) => o.type === type) ?? scopeOptions[0]).label(t);
}

export interface ToolbarProps {
  totalCount: number;
  sortState: SortState;
  setSortState: (next: SortState) => void;
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
  /** 顶栏最左侧的内容；传入时取代「标题 + 数量」（回收站 tab 引入后由 tabs 占据该槽位） */
  leading?: React.ReactNode;
}

/** 脚本列表顶栏：标题+数量（或 leading 槽位）、搜索框、排序、新建脚本。 */
export function Toolbar({
  totalCount,
  sortState,
  setSortState,
  searchRequest,
  setSearchRequest,
  leading,
}: ToolbarProps) {
  const { t } = useTranslation();
  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "status", label: t("script:script_list.sidebar.status") },
    { key: "name", label: t("name") },
    { key: "updatetime", label: t("logs:last_updated") },
  ];
  return (
    <div className="flex items-center gap-4 h-14 px-6 shrink-0 bg-card">
      {leading ?? (
        // 标题 + 数量
        <div className="flex items-center gap-2 shrink-0">
          <h1 className="text-base font-semibold">{t("script:installed_scripts")}</h1>
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium font-mono text-primary tabular-nums">
            {totalCount}
          </span>
        </div>
      )}

      {/* 搜索框 */}
      <SearchInput
        data-testid="script-search"
        className="flex-1 rounded-lg pr-1.5"
        inputClassName="text-[13px]"
        aria-label={t("script:search_scripts")}
        placeholder={t("script:search_scripts")}
        value={searchRequest.keyword}
        onChange={(e) => setSearchRequest({ ...searchRequest, keyword: e.target.value })}
        trailing={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {scopeLabelOf(searchRequest.type, t)}
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {scopeOptions.map((o) => (
                <DropdownMenuItem
                  key={o.type}
                  onClick={() => setSearchRequest({ ...searchRequest, type: o.type })}
                  className="flex items-start gap-2"
                >
                  <Check
                    className={cn(
                      "w-3.5 h-3.5 mt-0.5 shrink-0",
                      searchRequest.type === o.type ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex flex-col">
                    <span className="text-[13px]">{o.label(t)}</span>
                    {o.desc && <span className="text-[11px] text-muted-foreground">{o.desc(t)}</span>}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* 排序（表头消失后的排序入口） */}
      <SortMenu options={sortOptions} value={sortState} onChange={setSortState} />

      {/* 新建脚本 */}
      <CreateScriptMenu />
    </div>
  );
}

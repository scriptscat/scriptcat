import { Table2, LayoutGrid, ChevronDown, Check } from "lucide-react";
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

// ========== 视图切换按钮 ==========
function ViewToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center px-2.5 h-full transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/50"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export interface ToolbarProps {
  totalCount: number;
  viewMode: "table" | "card";
  setViewMode: (mode: "table" | "card") => void;
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
}

/**
 * 脚本列表顶栏：标题+数量、搜索框、视图切换、新建脚本。
 * 表格视图与卡片视图共用本组件，仅 viewMode 决定激活态，避免两份顶栏代码分叉
 * （此前卡片视图的顶栏漏掉了「新建脚本」按钮即源于此类重复）。
 */
export function Toolbar({ totalCount, viewMode, setViewMode, searchRequest, setSearchRequest }: ToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-4 h-14 px-6 shrink-0 border-b border-border bg-card">
      {/* 标题 + 数量 */}
      <div className="flex items-center gap-2 shrink-0">
        <h1 className="text-base font-semibold">{t("script:installed_scripts")}</h1>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium font-mono text-primary tabular-nums">
          {totalCount}
        </span>
      </div>

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

      {/* 视图切换 */}
      <div data-testid="view-toggle" className="flex items-center border border-border rounded-lg h-8 overflow-hidden">
        <ViewToggleButton active={viewMode === "table"} onClick={() => setViewMode("table")} label="Table view">
          <Table2 className="w-4 h-4" />
        </ViewToggleButton>
        <ViewToggleButton active={viewMode === "card"} onClick={() => setViewMode("card")} label="Card view">
          <LayoutGrid className="w-4 h-4" />
        </ViewToggleButton>
      </div>

      {/* 新建脚本 */}
      <CreateScriptMenu />
    </div>
  );
}

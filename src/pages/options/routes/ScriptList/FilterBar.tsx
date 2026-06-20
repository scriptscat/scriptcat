import { SlidersHorizontal, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import type { FilterItem, TFilterKey, TSelectFilter, TSelectFilterKeys } from "./hooks";

export interface FilterBarProps {
  filterItems: {
    statusItems: FilterItem[];
    typeItems: FilterItem[];
    tagItems: FilterItem[];
    sourceItems: FilterItem[];
  };
  selectedFilters: TSelectFilter;
  setSelectedFilters: React.Dispatch<React.SetStateAction<TSelectFilter>>;
}

export default function FilterBar({ filterItems, selectedFilters, setSelectedFilters }: FilterBarProps) {
  const { t } = useTranslation();
  const hasActiveFilter = Object.values(selectedFilters).some((v) => v !== null);

  const handleSelect = (group: TSelectFilterKeys, key: TFilterKey) => {
    setSelectedFilters((prev) => ({
      ...prev,
      [group]: prev[group] === key ? null : key,
    }));
  };

  const handleClear = () => {
    setSelectedFilters({ status: null, type: null, tags: null, source: null });
  };

  return (
    <div className="flex items-center gap-2 h-11 px-6 border-b border-border shrink-0">
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto scrollbar-custom">
        <FilterChip
          group="status"
          label={t("script:script_list.sidebar.status")}
          items={filterItems.statusItems}
          selectedKey={selectedFilters.status}
          onSelect={(key) => handleSelect("status", key)}
        />
        <FilterChip
          group="type"
          label={t("type")}
          items={filterItems.typeItems}
          selectedKey={selectedFilters.type}
          onSelect={(key) => handleSelect("type", key)}
        />
        <FilterChip
          group="tags"
          label={t("script:tags")}
          items={filterItems.tagItems}
          selectedKey={selectedFilters.tags}
          onSelect={(key) => handleSelect("tags", key)}
        />
        <FilterChip
          group="source"
          label={t("source")}
          items={filterItems.sourceItems}
          selectedKey={selectedFilters.source}
          onSelect={(key) => handleSelect("source", key)}
        />
      </div>
      {hasActiveFilter && (
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {t("clear_filter")}
        </button>
      )}
    </div>
  );
}

// ========== 筛选 Chip ==========
function FilterChip({
  group: _group,
  label,
  items,
  selectedKey,
  onSelect,
}: {
  group: string;
  label: string;
  items: FilterItem[];
  selectedKey: TFilterKey;
  onSelect: (key: TFilterKey) => void;
}) {
  const activeItem = selectedKey !== null ? items.find((i) => i.key === selectedKey) : null;
  const isActive = activeItem !== null && activeItem !== undefined;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors shrink-0",
            isActive
              ? "bg-primary text-primary-foreground font-medium"
              : "border border-border text-muted-foreground hover:bg-accent/50"
          )}
        >
          {isActive && <SlidersHorizontal className="w-3 h-3" />}
          <span>{isActive ? `${label}: ${activeItem.label}` : label}</span>
          {!isActive && <ChevronDown className="w-3 h-3" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40 max-h-60 overflow-auto scrollbar-custom">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={String(item.key)}
              onClick={() => onSelect(item.key)}
              className={cn(selectedKey === item.key && "bg-accent font-medium")}
            >
              <Icon className={cn("w-3.5 h-3.5 shrink-0", item.color)} />
              <span className="flex-1 truncate">{item.label}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{item.count}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

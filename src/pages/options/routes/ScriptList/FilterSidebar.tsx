import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@App/pages/components/ui/collapsible";
import { cn } from "@App/pkg/utils/cn";
import { t } from "@App/locales/locales";
import type { FilterItem, TFilterKey, TSelectFilter, TSelectFilterKeys } from "./hooks";

interface FilterSidebarProps {
  open: boolean;
  filterItems: {
    statusItems: FilterItem[];
    typeItems: FilterItem[];
    tagItems: FilterItem[];
    sourceItems: FilterItem[];
  };
  selectedFilters: TSelectFilter;
  setSelectedFilters: React.Dispatch<React.SetStateAction<TSelectFilter>>;
}

export default function FilterSidebar({ open, filterItems, selectedFilters, setSelectedFilters }: FilterSidebarProps) {
  if (!open) return null;

  const handleSelect = (group: TSelectFilterKeys, key: TFilterKey) => {
    setSelectedFilters((prev) => ({
      ...prev,
      [group]: prev[group] === key ? null : key,
    }));
  };

  return (
    <aside className="w-[200px] shrink-0 border-r border-border pr-2 mr-4">
      <div className="flex flex-col gap-1 py-2">
        <FilterGroup
          title={t("script_list.sidebar.status")}
          items={filterItems.statusItems}
          selectedKey={selectedFilters.status}
          onSelect={(key) => handleSelect("status", key)}
        />
        <FilterGroup
          title={t("type")}
          items={filterItems.typeItems}
          selectedKey={selectedFilters.type}
          onSelect={(key) => handleSelect("type", key)}
        />
        <FilterGroup
          title={t("script:tags")}
          items={filterItems.tagItems}
          selectedKey={selectedFilters.tags}
          onSelect={(key) => handleSelect("tags", key)}
          defaultOpen={false}
        />
        <FilterGroup
          title={t("source")}
          items={filterItems.sourceItems}
          selectedKey={selectedFilters.source}
          onSelect={(key) => handleSelect("source", key)}
          defaultOpen={false}
        />
      </div>
    </aside>
  );
}

// ========== 筛选分组 ==========
function FilterGroup({
  title,
  items,
  selectedKey,
  onSelect,
  defaultOpen = true,
}: {
  title: string;
  items: FilterItem[];
  selectedKey: TFilterKey;
  onSelect: (key: TFilterKey) => void;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
        <span>{title}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 mt-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const isSelected = selectedKey === item.key;
            return (
              <button
                key={String(item.key)}
                type="button"
                onClick={() => onSelect(item.key)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors w-full text-left",
                  isSelected
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5 shrink-0", item.color)} />
                <span className="truncate flex-1">{item.label}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{item.count}</span>
              </button>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

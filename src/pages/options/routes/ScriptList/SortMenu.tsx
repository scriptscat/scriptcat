import { ArrowUpDown, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { nextSortState } from "./sort";
import type { SortOrder } from "./sort";

export interface SortMenuOption<K extends string> {
  key: K;
  label: string;
}

export interface SortMenuProps<K extends string> {
  options: SortMenuOption<K>[];
  value: { key: K | null; order: SortOrder };
  onChange: (next: { key: K | null; order: SortOrder }) => void;
  className?: string;
}

/**
 * 排序入口。列表行取代表格后没有可点的表头，排序改由本下拉承载；
 * 三态循环仍复用 sort.ts 的 nextSortState，避免规则在两处各写一份而漂移。
 */
export function SortMenu<K extends string>({ options, value, onChange, className }: SortMenuProps<K>) {
  const { t } = useTranslation();
  const active = options.find((o) => o.key === value.key);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="sort-menu"
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] text-foreground",
            className
          )}
        >
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{`${t("script:sort_by")}：${active ? active.label : t("script:sort_default")}`}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {/* 三态循环要点两次才回得到自然顺序，给它一个一步可达的入口 */}
        <DropdownMenuItem
          onClick={() => onChange({ key: null, order: "asc" })}
          className="flex items-center justify-between gap-2"
        >
          <span>{t("script:sort_default")}</span>
          {value.key === null && <Check className="h-3.5 w-3.5 shrink-0" />}
        </DropdownMenuItem>
        {options.map((o) => {
          const isActive = o.key === value.key;
          return (
            <DropdownMenuItem
              key={o.key}
              onClick={() => onChange(nextSortState(value, o.key))}
              className="flex items-center justify-between gap-2"
            >
              <span>{o.label}</span>
              {isActive &&
                (value.order === "asc" ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-label={t("script:sort_ascending")} />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-label={t("script:sort_descending")} />
                ))}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

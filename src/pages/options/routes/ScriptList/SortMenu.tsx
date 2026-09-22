import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronUp, X } from "lucide-react";
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

  const reset = () => onChange({ key: null, order: "asc" });

  return (
    <DropdownMenu>
      {/* 排序状态会跨会话持久化，激活态必须一眼可辨：否则用户忘了排序开着，会误以为拖拽手柄消失是功能坏了（#1751） */}
      <div
        className={cn(
          "flex h-8 shrink-0 items-stretch overflow-hidden rounded-md border text-[13px] transition-colors",
          active ? "border-primary/40 bg-primary-light text-primary" : "border-border text-foreground",
          className
        )}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="sort-menu"
            data-active={active ? "true" : undefined}
            className={cn(
              "flex items-center gap-1.5 px-2.5 transition-colors",
              active ? "hover:bg-primary/10" : "hover:bg-accent"
            )}
          >
            <ArrowUpDown className={cn("h-3.5 w-3.5", !active && "text-muted-foreground")} />
            <span>{`${t("script:sort_by")}：${active ? active.label : t("script:sort_default")}`}</span>
            {active &&
              (value.order === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5" aria-label={t("script:sort_ascending")} />
              ) : (
                <ArrowDown className="h-3.5 w-3.5" aria-label={t("script:sort_descending")} />
              ))}
            <ChevronDown className={cn("h-3 w-3", !active && "text-muted-foreground")} />
          </button>
        </DropdownMenuTrigger>
        {active && (
          <button
            type="button"
            aria-label={t("script:sort_reset")}
            title={t("script:sort_reset")}
            onClick={reset}
            className="flex items-center border-l border-primary/40 px-2 transition-colors hover:bg-primary/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <DropdownMenuContent align="end" className="w-40">
        {/* 三态循环要点两次才回得到自然顺序，给它一个一步可达的入口 */}
        <DropdownMenuItem onClick={reset} className="flex items-center justify-between gap-2">
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

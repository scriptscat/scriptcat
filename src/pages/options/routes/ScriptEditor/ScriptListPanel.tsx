import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import type { Script } from "@App/app/repo/scripts";
import { i18nName, t } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";
import { Input } from "@App/pages/components/ui/input";
import { filterScripts } from "./filterScripts";

export interface ScriptListPanelProps {
  scripts: Script[];
  activeUuid: string | null;
  openUuids: Set<string>;
  changedUuids: Set<string>;
  scriptListCollapsed: boolean;
  onOpen: (uuid: string) => void;
  onDelete: (script: Script) => void;
}

export default function ScriptListPanel({
  scripts,
  activeUuid,
  openUuids,
  changedUuids,
  scriptListCollapsed,
  onOpen,
  onDelete,
}: ScriptListPanelProps) {
  const [keyword, setKeyword] = useState("");

  const list = useMemo(() => filterScripts(scripts, keyword), [scripts, keyword]);

  return (
    <div
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r border-border bg-card",
        scriptListCollapsed ? "absolute z-8 left-0 opacity-0 ml-6 -translate-x-full" : "",
        scriptListCollapsed
          ? "hover:transition-all hover:duration-220 hover:ease-in hover:opacity-100 hover:ml-0 hover:translate-x-0"
          : ""
      )}
    >
      {/* 标题 + 总数 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-medium text-foreground">{t("editor:script_list")}</span>
        <span className="text-xs text-muted-foreground">{scripts.length}</span>
      </div>

      {/* 搜索 */}
      <div className="shrink-0 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t("editor:search_scripts")}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-custom px-2 pb-2">
        {list.map((script) => {
          const isActive = script.uuid === activeUuid;
          const isOpen = openUuids.has(script.uuid);
          const isChanged = changedUuids.has(script.uuid);
          return (
            <div key={script.uuid} className="group/item relative">
              <button
                type="button"
                onClick={() => onOpen(script.uuid)}
                className={cn(
                  "flex w-full items-center rounded px-2 py-1.5 pr-7 text-left text-xs",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-accent text-foreground",
                  !isOpen && !isActive && "text-muted-foreground"
                )}
              >
                <span className={cn("truncate", isChanged && "text-warning")} title={i18nName(script)}>
                  {i18nName(script)}
                </span>
              </button>
              <button
                type="button"
                aria-label={t("delete")}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(script);
                }}
                className="absolute right-1 top-1/2 hidden size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-destructive group-hover/item:flex"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

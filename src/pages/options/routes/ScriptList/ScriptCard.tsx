import React, { createContext, useCallback, useContext, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Table2,
  LayoutGrid,
  GripVertical,
  Pencil,
  Play,
  Square,
  Trash2,
  Settings,
  RefreshCw,
  Loader2,
  Ellipsis,
} from "lucide-react";
import {
  SCRIPT_STATUS_DISABLE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
} from "@App/app/repo/scripts";
import { requestEnableScript, scriptClient } from "@App/pages/store/features/script";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { parseTags } from "@App/app/repo/metadata";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import type { SCMetadata } from "@App/app/repo/scripts";
import { Button } from "@App/pages/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { cn } from "@App/pkg/utils/cn";
import { t, i18nName } from "@App/locales/locales";
import {
  EnableSwitch,
  ScriptIcon,
  FaviconDots,
  RunStatusBadge,
  UpdateTimeCell,
  scriptTypeLabel,
  getTagColor,
} from "./components";
import type { SearchFilterRequest } from "./SearchFilter";
import FilterBar from "./FilterBar";
import type { FilterBarProps } from "./FilterBar";

import type { DragEndEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { rectSwappingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ========== 拖拽上下文 ==========
type DragCtx = Pick<ReturnType<typeof useSortable>, "listeners" | "setActivatorNodeRef"> | null;
const SortableDragCtx = createContext<DragCtx>(null);

function DraggableCard({
  id,
  children,
}: {
  id: string;
  children: React.ReactElement<{ style?: React.CSSProperties; ref?: React.Ref<HTMLDivElement> }>;
}) {
  const { setNodeRef, transform, transition, listeners, setActivatorNodeRef, isDragging, attributes } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : ("auto" as const),
  };

  const ctxValue = useMemo(() => ({ listeners, setActivatorNodeRef }), [listeners, setActivatorNodeRef]);

  return (
    <SortableDragCtx.Provider value={ctxValue}>
      {React.cloneElement(children, {
        ...attributes,
        ref: setNodeRef,
        style: { ...children.props.style, ...style },
      })}
    </SortableDragCtx.Provider>
  );
}

function DragHandle() {
  const sortable = useContext(SortableDragCtx);
  if (!sortable) return <GripVertical className="w-4 h-4 text-muted-foreground" />;
  return (
    <span ref={sortable.setActivatorNodeRef} {...sortable.listeners} className="cursor-move">
      <GripVertical className="w-4 h-4 text-muted-foreground" />
    </span>
  );
}

// ========== Props ==========
export interface ScriptCardProps extends FilterBarProps {
  scriptList: ScriptLoading[];
  loadingList: boolean;
  updateScripts: (uuids: string[], data: Partial<ScriptLoading>) => void;
  handleDelete: (script: ScriptLoading) => void;
  handleRunStop: (script: ScriptLoading) => void;
  setViewMode: (mode: "table" | "card") => void;
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
  totalCount: number;
  scriptListSortOrderSwap: (params: { active: string; over: string }) => void;
}

// ========== 卡片视图主组件 ==========
function ScriptCard({
  scriptList,
  loadingList,
  updateScripts,
  handleDelete,
  handleRunStop,
  setViewMode,
  searchRequest,
  setSearchRequest,
  totalCount,
  scriptListSortOrderSwap,
  filterItems,
  selectedFilters,
  setSelectedFilters,
}: ScriptCardProps) {
  const navigate = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortableIds = useMemo(() => scriptList.map((s) => s.uuid), [scriptList]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        scriptListSortOrderSwap({ active: `${active.id}`, over: `${over.id}` });
      }
    },
    [scriptListSortOrderSwap]
  );

  const handleEnable = useCallback(
    (script: ScriptLoading, checked: boolean) => {
      updateScripts([script.uuid], { enableLoading: true });
      requestEnableScript({ uuid: script.uuid, enable: checked }).catch(() => {
        updateScripts([script.uuid], { enableLoading: false });
      });
    },
    [updateScripts]
  );

  const a11y = useMemo(() => ({ container: document.body }), []);

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="flex items-center gap-4 h-14 px-6 shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 shrink-0">
          <h1 className="text-base font-semibold">{t("script:installed_scripts")}</h1>
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium font-mono text-primary tabular-nums">
            {totalCount}
          </span>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 rounded-lg bg-muted/50 px-3 h-9">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            className="flex-1 min-w-0 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
            placeholder={t("script:search_scripts")}
            value={searchRequest.keyword}
            onChange={(e) => setSearchRequest({ ...searchRequest, keyword: e.target.value })}
          />
          <kbd className="hidden sm:inline-flex items-center rounded bg-border/60 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
            {"⌘K"}
          </kbd>
        </div>
        <div className="flex items-center border border-border rounded-lg h-8 overflow-hidden">
          <button
            type="button"
            className="flex items-center justify-center px-2.5 h-full text-muted-foreground hover:bg-accent/50 transition-colors"
            onClick={() => setViewMode("table")}
          >
            <Table2 className="w-4 h-4" />
          </button>
          <button type="button" className="flex items-center justify-center px-2.5 h-full bg-primary/10 text-primary">
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <FilterBar filterItems={filterItems} selectedFilters={selectedFilters} setSelectedFilters={setSelectedFilters} />

      {/* 卡片网格 */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {loadingList && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">{t("loading", { defaultValue: "加载中..." })}</span>
          </div>
        )}
        {!loadingList && scriptList.length === 0 && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <span className="text-sm">{t("no_scripts", { defaultValue: "暂无脚本" })}</span>
          </div>
        )}
        {!loadingList && scriptList.length > 0 && (
          <DndContext
            sensors={sensors}
            onDragEnd={handleDragEnd}
            collisionDetection={closestCenter}
            accessibility={a11y}
          >
            <SortableContext items={sortableIds} strategy={rectSwappingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {scriptList.map((script) => (
                  <DraggableCard key={script.uuid} id={script.uuid}>
                    <CardItem
                      script={script}
                      onEnable={handleEnable}
                      onDelete={handleDelete}
                      onRunStop={handleRunStop}
                      navigate={navigate}
                    />
                  </DraggableCard>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

// ========== 单个卡片 ==========
const CardItem = React.memo(
  React.forwardRef<
    HTMLDivElement,
    {
      script: ScriptLoading;
      onEnable: (script: ScriptLoading, checked: boolean) => void;
      onDelete: (script: ScriptLoading) => void;
      onRunStop: (script: ScriptLoading) => void;
      navigate: ReturnType<typeof useNavigate>;
      style?: React.CSSProperties;
    }
  >(({ script, onEnable, onDelete, onRunStop, navigate, style, ...attrs }, ref) => {
    const isDisabled = script.status === SCRIPT_STATUS_DISABLE;
    const isBackground = script.type === SCRIPT_TYPE_BACKGROUND || script.type === SCRIPT_TYPE_CRONTAB;
    const isRunning = script.runStatus === SCRIPT_RUN_STATUS_RUNNING;
    const name = i18nName(script);
    const version = script.metadata?.version?.[0] || "";
    const author = script.metadata?.author?.[0] || "";

    return (
      <div
        ref={ref}
        style={style}
        {...attrs}
        className={cn(
          "group/card rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md",
          isDisabled && "opacity-60"
        )}
      >
        {/* 头部: 图标 + 名称 + 开关 + 拖拽 */}
        <div className="flex items-start gap-2.5 mb-3">
          <ScriptIcon name={name} metadata={script.metadata} className="mt-0.5" />
          <div className="flex-1 min-w-0">
            <Link
              to={`/script/editor/${script.uuid}`}
              className="text-sm font-semibold leading-tight hover:underline line-clamp-2"
            >
              {name}
            </Link>
            <span className="text-[11px] text-muted-foreground block mt-0.5 truncate">
              {[version && `v${version}`, scriptTypeLabel(script.type), author].filter(Boolean).join(" · ")}
            </span>
          </div>
          <EnableSwitch
            status={script.status}
            enableLoading={script.enableLoading}
            onCheckedChange={(checked) => onEnable(script, checked)}
          />
          <DragHandle />
        </div>

        {/* 标签 + 状态 */}
        <div className="flex items-center gap-2 mb-3 min-h-[20px]">
          <CardTagBadges metadata={script.metadata} selfMetadata={script.selfMetadata} />
          {isBackground ? <RunStatusBadge runStatus={script.runStatus} /> : <FaviconDots favorites={script.favorite} />}
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-border mb-3" />

        {/* 底部: 更新时间 + 操作 */}
        <div className="flex items-center justify-between">
          <UpdateTimeCell script={script} />
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => navigate(`/script/editor/${script.uuid}`)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("edit")}</TooltipContent>
            </Tooltip>
            {isBackground && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7",
                      isRunning ? "text-red-500 hover:text-red-600" : "text-primary hover:text-primary/80"
                    )}
                    onClick={() => onRunStop(script)}
                    disabled={script.actionLoading}
                  >
                    {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isRunning ? t("script:stopping_script") : t("script:starting_script")}</TooltipContent>
              </Tooltip>
            )}
            <CardMoreMenu script={script} onDelete={onDelete} navigate={navigate} />
          </div>
        </div>
      </div>
    );
  }),
  (prev, next) =>
    prev.script.uuid === next.script.uuid &&
    prev.script.status === next.script.status &&
    prev.script.enableLoading === next.script.enableLoading &&
    prev.script.actionLoading === next.script.actionLoading &&
    prev.script.runStatus === next.script.runStatus &&
    prev.script.updatetime === next.script.updatetime &&
    prev.script.favorite === next.script.favorite
);
CardItem.displayName = "CardItem";

// ========== 卡片标签 ==========
function CardTagBadges({ metadata, selfMetadata }: { metadata: SCMetadata; selfMetadata?: SCMetadata }) {
  const meta = selfMetadata ? getCombinedMeta(metadata, selfMetadata) : metadata;
  const tags = parseTags(meta);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => {
        const color = getTagColor(tag);
        return (
          <span
            key={tag}
            className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium", color.bg, color.text)}
          >
            {tag}
          </span>
        );
      })}
      {tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
    </div>
  );
}

// ========== 卡片更多菜单 ==========
function CardMoreMenu({
  script,
  onDelete,
  navigate,
}: {
  script: ScriptLoading;
  onDelete: (script: ScriptLoading) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Ellipsis className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => navigate(`/script/editor/${script.uuid}`)}>
          <Pencil className="w-4 h-4" />
          {t("edit")}
        </DropdownMenuItem>
        {script.config && (
          <DropdownMenuItem onClick={() => navigate(`/?userConfig=${script.uuid}`)}>
            <Settings className="w-4 h-4" />
            {t("settings")}
          </DropdownMenuItem>
        )}
        {script.checkUpdateUrl && (
          <DropdownMenuItem onClick={() => scriptClient.requestCheckUpdate(script.uuid)}>
            <RefreshCw className="w-4 h-4" />
            {t("check_update")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(script)}>
          <Trash2 className="w-4 h-4" />
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default React.memo(ScriptCard, (prev, next) => {
  return (
    prev.loadingList === next.loadingList &&
    prev.scriptList === next.scriptList &&
    prev.searchRequest.keyword === next.searchRequest.keyword &&
    prev.searchRequest.type === next.searchRequest.type &&
    prev.totalCount === next.totalCount &&
    prev.selectedFilters === next.selectedFilters
  );
});

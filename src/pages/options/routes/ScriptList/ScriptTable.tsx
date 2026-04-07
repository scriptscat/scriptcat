import React, { createContext, useCallback, useContext, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Table2,
  LayoutGrid,
  Plus,
  ChevronDown,
  GripVertical,
  Pencil,
  Play,
  Square,
  Ellipsis,
  Trash2,
  Settings,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { DragEndEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
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
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { useHoverMenu } from "@App/pages/components/ui/use-hover-menu";
import { cn } from "@App/pkg/utils/cn";
import { t } from "@App/locales/locales";
import { i18nName } from "@App/locales/locales";

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
import BatchActionsBar from "./BatchActionsBar";

// ========== 拖拽上下文 ==========
type DragCtx = Pick<ReturnType<typeof useSortable>, "listeners" | "setActivatorNodeRef"> | null;
const SortableDragCtx = createContext<DragCtx>(null);

function DraggableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, transform, transition, listeners, setActivatorNodeRef, isDragging, attributes } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };
  const ctxValue = useMemo(() => ({ listeners, setActivatorNodeRef }), [listeners, setActivatorNodeRef]);
  return (
    <SortableDragCtx.Provider value={ctxValue}>
      <div ref={setNodeRef} style={style} {...attributes}>
        {children}
      </div>
    </SortableDragCtx.Provider>
  );
}

function RowDragHandle() {
  const sortable = useContext(SortableDragCtx);
  if (!sortable) return <GripVertical className="w-4 h-4 text-muted-foreground opacity-0" />;
  return (
    <span
      ref={sortable.setActivatorNodeRef}
      {...sortable.listeners}
      className="cursor-grab opacity-0 group-hover/row:opacity-50"
    >
      <GripVertical className="w-4 h-4 text-muted-foreground" />
    </span>
  );
}

export interface ScriptTableProps extends FilterBarProps {
  scriptList: ScriptLoading[];
  loadingList: boolean;
  updateScripts: (uuids: string[], data: Partial<ScriptLoading>) => void;
  handleDelete: (script: ScriptLoading) => void;
  handleRunStop: (script: ScriptLoading) => void;
  setViewMode: (mode: "table" | "card") => void;
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
  totalCount: number;
  scriptListSortOrderMove: (params: { active: string; over: string }) => void;
  selectedUuids: Set<string>;
  toggleSelect: (uuid: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  onBatchEnable: () => void;
  onBatchDisable: () => void;
  onBatchExport: () => void;
  onBatchDelete: () => void;
  onBatchPinTop: () => void;
  onBatchCheckUpdate: () => void;
}

export default function ScriptTable({
  scriptList,
  loadingList,
  updateScripts,
  handleDelete,
  handleRunStop,
  setViewMode,
  searchRequest,
  setSearchRequest,
  totalCount,
  scriptListSortOrderMove,
  filterItems,
  selectedFilters,
  setSelectedFilters,
  selectedUuids,
  toggleSelect,
  toggleSelectAll,
  clearSelection,
  onBatchEnable,
  onBatchDisable,
  onBatchExport,
  onBatchDelete,
  onBatchPinTop,
  onBatchCheckUpdate,
}: ScriptTableProps) {
  const navigate = useNavigate();

  const handleEnable = useCallback(
    (script: ScriptLoading, checked: boolean) => {
      updateScripts([script.uuid], { enableLoading: true });
      requestEnableScript({ uuid: script.uuid, enable: checked }).catch(() => {
        updateScripts([script.uuid], { enableLoading: false });
      });
    },
    [updateScripts]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortableIds = useMemo(() => scriptList.map((s) => s.uuid), [scriptList]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        scriptListSortOrderMove({ active: `${active.id}`, over: `${over.id}` });
      }
    },
    [scriptListSortOrderMove]
  );

  const a11y = useMemo(() => ({ container: document.body }), []);

  const isAllSelected = scriptList.length > 0 && selectedUuids.size === scriptList.length;
  const isIndeterminate = selectedUuids.size > 0 && selectedUuids.size < scriptList.length;

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <Toolbar
        totalCount={totalCount}
        setViewMode={setViewMode}
        searchRequest={searchRequest}
        setSearchRequest={setSearchRequest}
        navigate={navigate}
      />

      {/* 筛选栏 */}
      <FilterBar filterItems={filterItems} selectedFilters={selectedFilters} setSelectedFilters={setSelectedFilters} />

      {/* 批量操作栏 */}
      <BatchActionsBar
        selectedCount={selectedUuids.size}
        onBatchEnable={onBatchEnable}
        onBatchDisable={onBatchDisable}
        onBatchExport={onBatchExport}
        onBatchDelete={onBatchDelete}
        onBatchPinTop={onBatchPinTop}
        onBatchCheckUpdate={onBatchCheckUpdate}
        onClose={clearSelection}
      />

      {/* 表格 */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {/* 表头 */}
        <div className="flex items-center h-10 px-3 text-xs font-medium text-muted-foreground border-b border-border sticky top-0 bg-background z-10">
          <div className="w-8 flex justify-center">
            <Checkbox
              checked={isAllSelected ? true : isIndeterminate ? "indeterminate" : false}
              onCheckedChange={toggleSelectAll}
            />
          </div>
          <div className="w-8" />
          <div className="w-12">{t("script_list.sidebar.status")}</div>
          <div className="flex-1 min-w-0">{t("name")}</div>
          <div className="w-[100px]">{t("tags")}</div>
          <div className="w-[140px]">{t("apply_to_run_status")}</div>
          <div className="w-[100px]">{t("last_updated")}</div>
          <div className="w-[120px] text-right">{t("action")}</div>
        </div>

        {/* 加载状态 */}
        {loadingList && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">{t("loading", { defaultValue: "加载中..." })}</span>
          </div>
        )}

        {/* 空状态 */}
        {!loadingList && scriptList.length === 0 && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <span className="text-sm">{t("no_scripts", { defaultValue: "暂无脚本" })}</span>
          </div>
        )}

        {/* 脚本行（带拖拽排序） */}
        {!loadingList && scriptList.length > 0 && (
          <DndContext
            sensors={sensors}
            onDragEnd={handleDragEnd}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            accessibility={a11y}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {scriptList.map((script) => (
                <DraggableRow key={script.uuid} id={script.uuid}>
                  <ScriptRow
                    script={script}
                    selected={selectedUuids.has(script.uuid)}
                    onSelect={toggleSelect}
                    onEnable={handleEnable}
                    onDelete={handleDelete}
                    onRunStop={handleRunStop}
                    navigate={navigate}
                  />
                </DraggableRow>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

// ========== 新建脚本下拉菜单（hover 触发） ==========
function CreateScriptMenu({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu();

  const handleCreate = (path: string) => {
    close();
    navigate(path);
  };

  return (
    <DropdownMenu {...rootProps}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5 h-[34px] px-4" {...hoverProps}>
          <Plus className="w-4 h-4" />
          <span className="text-[13px] font-medium">{t("create_script")}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" {...contentProps}>
        <DropdownMenuItem onClick={() => handleCreate("/script/editor")}>
          {t("create_user_script")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCreate("/script/editor?template=background")}>
          {t("create_background_script")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCreate("/script/editor?template=crontab")}>
          {t("create_scheduled_script")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ========== 顶栏 ==========
function Toolbar({
  totalCount,
  setViewMode,
  searchRequest,
  setSearchRequest,
  navigate,
}: {
  totalCount: number;
  setViewMode: (mode: "table" | "card") => void;
  searchRequest: SearchFilterRequest;
  setSearchRequest: (req: SearchFilterRequest) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="flex items-center gap-4 h-14 px-6 shrink-0 border-b border-border bg-card">
      {/* 标题 + 数量 */}
      <div className="flex items-center gap-2 shrink-0">
        <h1 className="text-base font-semibold">{t("installed_scripts")}</h1>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium font-mono text-primary tabular-nums">
          {totalCount}
        </span>
      </div>

      {/* 搜索框 */}
      <div className="flex-1 min-w-0 flex items-center gap-2 rounded-lg bg-muted/50 px-3 h-9">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          className="flex-1 min-w-0 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
          placeholder={t("search_scripts")}
          value={searchRequest.keyword}
          onChange={(e) => setSearchRequest({ ...searchRequest, keyword: e.target.value })}
        />
        <kbd className="hidden sm:inline-flex items-center rounded bg-border/60 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
          {"⌘K"}
        </kbd>
      </div>

      {/* 视图切换 */}
      <div className="flex items-center border border-border rounded-lg h-8 overflow-hidden">
        <button type="button" className="flex items-center justify-center px-2.5 h-full bg-primary/10 text-primary">
          <Table2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="flex items-center justify-center px-2.5 h-full text-muted-foreground hover:bg-accent/50 transition-colors"
          onClick={() => setViewMode("card")}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
      </div>

      {/* 新建脚本 */}
      <CreateScriptMenu navigate={navigate} />
    </div>
  );
}

// ========== 脚本行 ==========
interface ScriptRowProps {
  script: ScriptLoading;
  selected: boolean;
  onSelect: (uuid: string) => void;
  onEnable: (script: ScriptLoading, checked: boolean) => void;
  onDelete: (script: ScriptLoading) => void;
  onRunStop: (script: ScriptLoading) => void;
  navigate: ReturnType<typeof useNavigate>;
}

function ScriptRowInner({ script, selected, onSelect, onEnable, onDelete, onRunStop, navigate }: ScriptRowProps) {
    const isDisabled = script.status === SCRIPT_STATUS_DISABLE;
    const isBackground = script.type === SCRIPT_TYPE_BACKGROUND || script.type === SCRIPT_TYPE_CRONTAB;
    const isRunning = script.runStatus === SCRIPT_RUN_STATUS_RUNNING;
    const version = script.metadata?.version?.[0] || "";
    const author = script.metadata?.author?.[0] || "";
    const name = i18nName(script);

    return (
      <div
        className={cn(
          "group/row flex items-center h-[52px] px-3 rounded-lg transition-colors hover:bg-primary/[0.08]",
          isDisabled && "opacity-60"
        )}
      >
        {/* 复选框 */}
        <div className="w-8 flex justify-center">
          <Checkbox checked={selected} onCheckedChange={() => onSelect(script.uuid)} />
        </div>

        {/* 拖拽手柄 */}
        <div className="w-8 flex justify-center">
          <RowDragHandle />
        </div>

        {/* 开关 */}
        <div className="w-12 flex justify-center">
          <EnableSwitch
            status={script.status}
            enableLoading={script.enableLoading}
            onCheckedChange={(checked) => onEnable(script, checked)}
          />
        </div>

        {/* 脚本名称 + 元信息 */}
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <ScriptIcon name={name} metadata={script.metadata} />
          <div className="min-w-0 flex flex-col gap-px">
            <Link to={`/script/editor/${script.uuid}`} className="text-sm font-medium truncate hover:underline">
              {name}
            </Link>
            <span className="text-[11px] text-muted-foreground truncate">
              {[version && `v${version}`, scriptTypeLabel(script.type), author].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>

        {/* 标签 */}
        <div className="w-[100px]">
          <TagBadges metadata={script.metadata} selfMetadata={script.selfMetadata} />
        </div>

        {/* 应用至 / 运行状态 */}
        <div className="w-[140px]">
          {isBackground ? <RunStatusBadge runStatus={script.runStatus} /> : <FaviconDots favorites={script.favorite} />}
        </div>

        {/* 最后更新 */}
        <div className="w-[100px]">
          <UpdateTimeCell script={script} />
        </div>

        {/* 操作 */}
        <div className="w-[120px] flex items-center justify-end gap-1 opacity-[0.55] group-hover/row:opacity-100">
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
                    isRunning
                      ? "group-hover/row:text-red-500 hover:text-red-600"
                      : "group-hover/row:text-primary group-hover/row:bg-primary/10 hover:bg-primary/15 hover:text-primary"
                  )}
                  onClick={() => onRunStop(script)}
                  disabled={script.actionLoading}
                >
                  {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isRunning ? t("stopping_script") : t("starting_script")}</TooltipContent>
            </Tooltip>
          )}

          <MoreMenu script={script} onDelete={onDelete} navigate={navigate} />
        </div>
      </div>
    );
}

const ScriptRow = React.memo(ScriptRowInner, (prev, next) => {
  return (
    prev.script.uuid === next.script.uuid &&
    prev.script.status === next.script.status &&
    prev.script.enableLoading === next.script.enableLoading &&
    prev.script.actionLoading === next.script.actionLoading &&
    prev.script.runStatus === next.script.runStatus &&
    prev.script.updatetime === next.script.updatetime &&
    prev.script.favorite === next.script.favorite &&
    prev.selected === next.selected
  );
});

// ========== 标签 ==========
function TagBadges({ metadata, selfMetadata }: { metadata: SCMetadata; selfMetadata?: SCMetadata }) {
  const meta = selfMetadata ? getCombinedMeta(metadata, selfMetadata) : metadata;
  const tags = parseTags(meta);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 2).map((tag) => {
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
      {tags.length > 2 && <span className="text-[10px] text-muted-foreground">+{tags.length - 2}</span>}
    </div>
  );
}

// ========== 更多菜单 ==========
function MoreMenu({
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

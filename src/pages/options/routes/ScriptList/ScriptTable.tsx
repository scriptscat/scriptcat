import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ChevronsUpDown, GripVertical, Loader2 } from "lucide-react";
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
import { SCRIPT_STATUS_DISABLE, SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB } from "@App/app/repo/scripts";
import { requestEnableScript } from "@App/pages/store/features/script";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { parseTags } from "@App/app/repo/metadata";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import type { SCMetadata } from "@App/app/repo/scripts";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { cn } from "@App/pkg/utils/cn";
import { t } from "@App/locales/locales";
import { i18nName } from "@App/locales/locales";

import {
  EnableSwitch,
  ScriptIcon,
  FaviconDots,
  RunStatusBadge,
  UpdateTimeCell,
  SourceTag,
  scriptTypeLabel,
  getTagColor,
  ScriptRowActions,
} from "./components";
import type { SearchFilterRequest } from "./SearchFilter";
import { nextSortState, sortScriptList } from "./sort";
import type { SortKey, SortState } from "./sort";
import FilterBar from "./FilterBar";
import type { FilterBarProps } from "./FilterBar";
import BatchActionsBar from "./BatchActionsBar";
import { Toolbar } from "./Toolbar";
import { versionDisplay } from "@App/pages/utils";

// ========== 拖拽上下文 ==========
type DragCtx = Pick<ReturnType<typeof useSortable>, "listeners" | "setActivatorNodeRef"> | null;
const SortableDragCtx = createContext<DragCtx>(null);

function DraggableRow({ id, disabled, children }: { id: string; disabled?: boolean; children: React.ReactNode }) {
  const { setNodeRef, transform, transition, listeners, setActivatorNodeRef, isDragging, attributes } = useSortable({
    id,
    disabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };
  // 排序激活时禁用拖拽：ctx 置空，RowDragHandle 渲染不可拖拽的占位手柄
  const ctxValue = useMemo(
    () => (disabled ? null : { listeners, setActivatorNodeRef }),
    [disabled, listeners, setActivatorNodeRef]
  );
  return (
    <SortableDragCtx.Provider value={ctxValue}>
      <div
        ref={setNodeRef}
        className={isDragging ? "group/dr drag-on" : "group/dr drag-off"}
        style={style}
        {...attributes}
      >
        {children}
      </div>
    </SortableDragCtx.Provider>
  );
}

function RowDragHandle() {
  const sortable = useContext(SortableDragCtx);
  return !sortable ? (
    <GripVertical className="w-8 h-8 p-1 text-muted-foreground collapse" />
  ) : (
    <span
      ref={sortable.setActivatorNodeRef}
      {...sortable.listeners}
      className="cursor-grab opacity-0 group-hover/row:opacity-50"
    >
      <GripVertical className="w-8 h-8 p-1 text-muted-foreground" />
    </span>
  );
}

// ========== 可排序表头 ==========
function SortHeader({
  label,
  sortKey,
  sortState,
  onSort,
  className,
  leftPad,
}: {
  label: string;
  sortKey: SortKey;
  sortState: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
  leftPad?: boolean;
}) {
  const active = sortState.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 max-w-full hover:text-foreground transition-colors",
        active && "text-foreground",
        className
      )}
    >
      {leftPad && <span className="inline-flex w-3">{/*fixed-width*/}</span>}
      <span className="truncate">{label}</span>
      <span className="inline-flex w-3">
        {active ? (
          sortState.order === "asc" ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          )
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-30" />
        )}
      </span>
    </button>
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

  // 列头点击排序（瞬时视图排序，不持久化；激活时禁用手动拖拽）
  const [sortState, setSortState] = useState<SortState>({ key: null, order: "asc" });
  const handleSort = useCallback((key: SortKey) => setSortState((s) => nextSortState(s, key)), []);
  const isSorted = sortState.key !== null;
  const displayList = useMemo(() => sortScriptList(scriptList, sortState), [scriptList, sortState]);

  const sortableIds = useMemo(() => displayList.map((s) => s.uuid), [displayList]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (isSorted) return;
      const { active, over } = event;
      if (over && active.id !== over.id) {
        scriptListSortOrderMove({ active: `${active.id}`, over: `${over.id}` });
      }
    },
    [scriptListSortOrderMove, isSorted]
  );

  const a11y = useMemo(() => ({ container: document.body }), []);

  const isAllSelected = scriptList.length > 0 && selectedUuids.size === scriptList.length;
  const isIndeterminate = selectedUuids.size > 0 && selectedUuids.size < scriptList.length;

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <Toolbar
        totalCount={totalCount}
        viewMode="table"
        setViewMode={setViewMode}
        searchRequest={searchRequest}
        setSearchRequest={setSearchRequest}
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
      <div className="flex-1 overflow-auto scrollbar-custom px-6 pb-6">
        {/* 表头 */}
        <div className="flex items-center h-10 px-3 text-xs font-medium text-muted-foreground border-b border-border sticky top-0 bg-background z-10">
          <div className="w-8 flex justify-center">
            <Checkbox
              checked={isAllSelected ? true : isIndeterminate ? "indeterminate" : false}
              onCheckedChange={toggleSelectAll}
            />
          </div>
          <div className="w-24 flex justify-center">
            <SortHeader
              label={t("script:script_list.sidebar.status")}
              sortKey="status"
              sortState={sortState}
              onSort={handleSort}
              leftPad={true}
            />
          </div>
          <div className="flex-1 min-w-0">
            <SortHeader label={t("name")} sortKey="name" sortState={sortState} onSort={handleSort} />
          </div>
          <div className="w-[76px]">{t("source")}</div>
          <div className="w-[100px]">{t("script:tags")}</div>
          <div className="w-[140px]">{t("script:apply_to_run_status")}</div>
          <div className="w-[132px] justify-items-center">
            <SortHeader
              label={t("logs:last_updated")}
              sortKey="updatetime"
              sortState={sortState}
              onSort={handleSort}
              leftPad={true}
            />
          </div>
          <div className="w-[192px] text-right">{t("action")}</div>
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
          <div data-testid="script-list-empty" className="flex items-center justify-center py-20 text-muted-foreground">
            <span className="text-sm">{t("no_scripts", { defaultValue: "暂无脚本" })}</span>
          </div>
        )}

        {/* 脚本行（带拖拽排序） */}
        {!loadingList && displayList.length > 0 && (
          <DndContext
            sensors={sensors}
            onDragEnd={handleDragEnd}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            accessibility={a11y}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {displayList.map((script) => (
                <DraggableRow key={script.uuid} id={script.uuid} disabled={isSorted}>
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

      {/* 开关 */}
      <div className="w-24 flex justify-center">
        <EnableSwitch
          status={script.status}
          enableLoading={script.enableLoading}
          onCheckedChange={(checked) => onEnable(script, checked)}
        />
      </div>

      {/* 脚本名称 + 元信息 */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <div className="w-8 self-stretch inline-flex justify-center items-center">
          {/* fixed-width; absolute layout with collapse to avoid layout reflow */}
          <div className="absolute collapse group-hover/row:visible group-[.drag-on]/dr:visible">
            {/* 拖拽手柄 */}
            <RowDragHandle />
          </div>
          <div className="absolute visible group-hover/row:collapse group-[.drag-on]/dr:collapse">
            <ScriptIcon name={name} metadata={script.metadata} />
          </div>
        </div>
        <div className="min-w-0 flex flex-col gap-px">
          <Link to={`/script/editor/${script.uuid}`} className="text-sm font-medium truncate hover:underline">
            {name}
          </Link>
          <span className="text-[11px] text-muted-foreground truncate">
            {[versionDisplay(version), scriptTypeLabel(script.type), author].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>

      {/* 来源 */}
      <div className="w-[76px]">
        <SourceTag script={script} />
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
      <div className="w-[132px] justify-items-center">
        <UpdateTimeCell script={script} />
      </div>

      {/* 操作（行内图标按钮，已去掉 ⋯ 更多菜单） */}
      <ScriptRowActions
        script={script}
        navigate={navigate}
        onDelete={onDelete}
        onRunStop={onRunStop}
        className="w-[192px] justify-end opacity-[0.55] group-hover/row:opacity-100"
      />
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
      {tags.length > 2 && <span className="text-[10px] text-muted-foreground">{`+${tags.length - 2}`}</span>}
    </div>
  );
}

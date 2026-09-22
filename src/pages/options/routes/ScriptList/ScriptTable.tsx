import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { GripVertical } from "lucide-react";
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
import type { ScriptLoading } from "@App/pages/store/features/script";
import { requestEnableScript } from "@App/pages/store/features/script";
import { parseTags } from "@App/app/repo/metadata";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import type { SCMetadata } from "@App/app/repo/scripts";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import {
  ListRow,
  ListRowActions,
  ListRowLeading,
  ListRowMain,
  ListRowTrailing,
} from "@App/pages/components/ui/list-row";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import { EmptyState } from "@App/pages/components/ui/empty-state";
import { LoadingState } from "@App/pages/components/ui/loading-state";
import { cn } from "@App/pkg/utils/cn";
import { i18nName } from "@App/locales/locales";
import { notify } from "@App/pages/components/ui/toast";

import {
  EnableSwitch,
  ScriptIcon,
  FaviconDots,
  RunStatusBadge,
  ScheduleNextRun,
  UpdateTimeCell,
  SourceTag,
  scriptTypeLabel,
  getTagColor,
  ScriptRowActionSlots,
} from "./components";
import type { SearchFilterRequest } from "./SearchFilter";
import { scriptSortOptions, sortScriptList } from "./sort";
import type { SortState } from "./sort";
import FilterBar from "./FilterBar";
import type { FilterBarProps } from "./FilterBar";
import BatchActionsBar from "./BatchActionsBar";
import { Toolbar } from "./Toolbar";
import { versionDisplay } from "@App/pages/utils";

// ========== 拖拽上下文 ==========
// 把「手柄元素」作为已渲染节点经 context 下传：ref/listeners 仅在 useSortable 所在的
// DraggableRow 渲染期被应用（同 setNodeRef），RowDragHandle 只消费节点，不在自身渲染期读取 ref 值。
type DragHandleNode = React.ReactNode;
const SortableDragCtx = createContext<DragHandleNode>(null);

function StaticRow({ handle, children }: { handle: React.ReactNode; children: React.ReactNode }) {
  return (
    <SortableDragCtx.Provider value={handle}>
      <div className="cursor-auto">{children}</div>
    </SortableDragCtx.Provider>
  );
}

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
  const handle = (
    <span ref={setActivatorNodeRef} {...listeners} className="cursor-grab opacity-0 group-hover/row:opacity-50">
      <GripVertical className="w-4 h-4 text-muted-foreground" />
    </span>
  );
  return (
    <SortableDragCtx.Provider value={handle}>
      <div className="cursor-auto" ref={setNodeRef} style={style} {...attributes}>
        {children}
      </div>
    </SortableDragCtx.Provider>
  );
}

function RowDragHandle() {
  return useContext(SortableDragCtx);
}

// 排序时手柄保留但锁定：直接隐藏会让人以为拖拽功能坏了（#1751）。
// 按下即给出原因与切回默认顺序的出口；键盘用户按 Enter/空格得到同样的提示。
function LockedDragHandle({ label, onAttempt }: { label: string; onAttempt: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          aria-label={label}
          onPointerDown={onAttempt}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            onAttempt();
          }}
          className="flex cursor-not-allowed opacity-0 transition-opacity group-hover/row:opacity-30 focus-visible:opacity-60"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export interface ScriptTableProps extends FilterBarProps {
  /** 顶栏最左侧内容（tabs），透传给 Toolbar 取代标题槽位 */
  leading?: React.ReactNode;
  scriptList: ScriptLoading[];
  loadingList: boolean;
  updateScripts: (uuids: string[], data: Partial<ScriptLoading>) => void;
  handleDelete: (script: ScriptLoading) => void;
  handleRunStop: (script: ScriptLoading) => void;
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
  sortState: SortState;
  setSortState: React.Dispatch<React.SetStateAction<SortState>>;
}

export default function ScriptTable({
  leading,
  scriptList,
  loadingList,
  updateScripts,
  handleDelete,
  handleRunStop,
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
  sortState,
  setSortState,
}: ScriptTableProps) {
  const { t } = useTranslation();
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

  // 排序激活时禁用手动拖拽，状态由脚本列表偏好持久化。
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

  const lockedHandle = useMemo(() => {
    if (!isSorted) return undefined;
    const field = scriptSortOptions(t).find((o) => o.key === sortState.key)?.label ?? "";
    const onAttempt = () =>
      // 固定 id：连按多次只刷新同一条提示，不会堆叠
      notify.info(t("script:drag_locked_toast", { field }), {
        id: "script-list-drag-locked",
        action: { label: t("script:drag_locked_action"), onClick: () => setSortState({ key: null, order: "asc" }) },
      });
    return <LockedDragHandle label={t("script:drag_locked_by_sort", { field })} onAttempt={onAttempt} />;
  }, [isSorted, sortState.key, setSortState, t]);

  const isAllSelected = scriptList.length > 0 && selectedUuids.size === scriptList.length;

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <Toolbar
        leading={leading}
        totalCount={totalCount}
        sortState={sortState}
        setSortState={setSortState}
        searchRequest={searchRequest}
        setSearchRequest={setSearchRequest}
      />

      <div className="h-11 overflow-hidden contain-layout">
        {/* 批量操作栏 */}
        <BatchActionsBar
          selectedCount={selectedUuids.size}
          allSelected={isAllSelected}
          onToggleSelectAll={toggleSelectAll}
          onBatchEnable={onBatchEnable}
          onBatchDisable={onBatchDisable}
          onBatchExport={onBatchExport}
          onBatchDelete={onBatchDelete}
          onBatchPinTop={onBatchPinTop}
          onBatchCheckUpdate={onBatchCheckUpdate}
          onClose={clearSelection}
        />
        {/* 筛选栏 */}
        <FilterBar
          filterItems={filterItems}
          selectedFilters={selectedFilters}
          setSelectedFilters={setSelectedFilters}
        />
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-auto scrollbar-custom px-6 pb-6">
        {/* 加载状态 */}
        {loadingList && <LoadingState label={t("loading")} />}

        {/* 空状态 */}
        {!loadingList && scriptList.length === 0 && (
          <EmptyState data-testid="script-list-empty" title={t("no_scripts")} compact />
        )}

        {/* 脚本行：排序时只渲染普通行；默认顺序下才挂载 dnd-kit。 */}
        {!loadingList &&
          displayList.length > 0 &&
          (isSorted ? (
            displayList.map((script) => (
              <StaticRow key={script.uuid} handle={lockedHandle}>
                <ScriptRow
                  script={script}
                  selected={selectedUuids.has(script.uuid)}
                  emphasizeUpdateTime={sortState.key === "updatetime"}
                  onSelect={toggleSelect}
                  onEnable={handleEnable}
                  onDelete={handleDelete}
                  onRunStop={handleRunStop}
                  navigate={navigate}
                />
              </StaticRow>
            ))
          ) : (
            <DndContext
              sensors={sensors}
              onDragEnd={handleDragEnd}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              accessibility={a11y}
            >
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                {displayList.map((script) => (
                  <DraggableRow key={script.uuid} id={script.uuid}>
                    <ScriptRow
                      script={script}
                      selected={selectedUuids.has(script.uuid)}
                      emphasizeUpdateTime={false}
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
          ))}
      </div>
    </div>
  );
}

// ========== 脚本行 ==========
interface ScriptRowProps {
  script: ScriptLoading;
  selected: boolean;
  /** 按「最后更新」排序时强调时间列，让排序依据在行内可见 */
  emphasizeUpdateTime: boolean;
  onSelect: (uuid: string) => void;
  onEnable: (script: ScriptLoading, checked: boolean) => void;
  onDelete: (script: ScriptLoading) => void;
  onRunStop: (script: ScriptLoading) => void;
  navigate: ReturnType<typeof useNavigate>;
}

function ScriptRowInner({
  script,
  selected,
  emphasizeUpdateTime,
  onSelect,
  onEnable,
  onDelete,
  onRunStop,
  navigate,
}: ScriptRowProps) {
  const { t } = useTranslation();
  const isDisabled = script.status === SCRIPT_STATUS_DISABLE;
  const isBackground = script.type === SCRIPT_TYPE_BACKGROUND || script.type === SCRIPT_TYPE_CRONTAB;
  const typeTooltip =
    script.type === SCRIPT_TYPE_CRONTAB ? t("script:scheduled_script_tooltip") : t("script:background_script_tooltip");
  const version = script.metadata?.version?.[0] || "";
  const author = script.metadata?.author?.[0] || "";
  const name = i18nName(script);

  return (
    <ListRow disabled={isDisabled} selected={selected}>
      <ListRowLeading className="w-28">
        <span className="flex w-8 justify-center">
          <Checkbox checked={selected} onCheckedChange={() => onSelect(script.uuid)} />
        </span>
        <span className="flex w-8 justify-center">
          <RowDragHandle />
        </span>
        <span className="flex w-12" data-tour="row-enable">
          <EnableSwitch
            status={script.status}
            enableLoading={script.enableLoading}
            onCheckedChange={(checked) => onEnable(script, checked)}
          />
        </span>
      </ListRowLeading>

      <ListRowMain>
        <ScriptIcon name={name} metadata={script.metadata} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link to={`/script/editor/${script.uuid}`} className="truncate text-sm font-medium hover:underline">
            {name}
          </Link>
          {/* 来源与标签降级为元信息行的行内徽章：原来的两个固定列在多数脚本上半空，占着名称列的宽度 */}
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            <span className="truncate text-[11px] text-muted-foreground">
              {[versionDisplay(version), scriptTypeLabel(script.type, t), author].filter(Boolean).join(" · ")}
            </span>
            <SourceTag script={script} />
            <TagBadges metadata={script.metadata} selfMetadata={script.selfMetadata} />
          </span>
        </div>
      </ListRowMain>

      <ListRowTrailing className="gap-3">
        {/* 窄窗口下整槽让位给名称：运行状态仍可从操作区的运行/停止图标读出，
            这里只在 900px 以下藏掉站点点与下次运行时间。整槽同进同退，右缘对齐不受影响。 */}
        <div className="hidden w-[104px] min-w-0 min-[900px]:block">
          {isBackground ? (
            <div className="flex min-w-0 flex-col gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-fit">
                    <RunStatusBadge runStatus={script.runStatus} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{typeTooltip}</TooltipContent>
              </Tooltip>
              <ScheduleNextRun script={script} />
            </div>
          ) : (
            <FaviconDots favorites={script.favorite} />
          )}
        </div>
        <div className="flex w-[92px] justify-end whitespace-nowrap">
          <UpdateTimeCell script={script} emphasized={emphasizeUpdateTime} />
        </div>
      </ListRowTrailing>

      {/* 槽位数固定为三，宽度随之恒定，右缘不再随脚本类型参差 */}
      <ListRowActions data-tour="row-action">
        <ScriptRowActionSlots script={script} navigate={navigate} onDelete={onDelete} onRunStop={onRunStop} />
      </ListRowActions>
    </ListRow>
  );
}

// store 会保留未变更脚本的对象引用；其余交互回调和状态也必须参与浅比较，
// 否则配置变化后行可能继续持有旧的 onDelete/onEnable/onRunStop 等闭包。
const ScriptRow = React.memo(ScriptRowInner);

// ========== 标签 ==========
function TagBadges({ metadata, selfMetadata }: { metadata: SCMetadata; selfMetadata?: SCMetadata }) {
  const meta = selfMetadata ? getCombinedMeta(metadata, selfMetadata) : metadata;
  const tags = parseTags(meta);
  if (tags.length === 0) return null;
  return (
    <div className="flex shrink-0 gap-1">
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

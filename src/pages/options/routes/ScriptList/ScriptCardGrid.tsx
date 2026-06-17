import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GripVertical, Loader2 } from "lucide-react";
import { SCRIPT_STATUS_DISABLE, SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB } from "@App/app/repo/scripts";
import { requestEnableScript } from "@App/pages/store/features/script";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { parseTags } from "@App/app/repo/metadata";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import type { SCMetadata } from "@App/app/repo/scripts";
import { cn } from "@App/pkg/utils/cn";
import { t, i18nName } from "@App/locales/locales";
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

import type { DragEndEvent, DragStartEvent, DropAnimation } from "@dnd-kit/core";
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 拖拽放下时的动画：浮层卡片平滑落回目标位置，原位占位卡片淡出
const dropAnimation: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

// ========== 拖拽上下文 ==========
type DragCtx = Pick<ReturnType<typeof useSortable>, "listeners" | "setActivatorNodeRef"> | null;
const SortableDragCtx = createContext<DragCtx>(null);

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, transform, transition, listeners, setActivatorNodeRef, isDragging, attributes } = useSortable({
    id,
  });

  // 拖拽样式必须挂在这个非 memo 的包裹层上：dnd-kit 每帧更新 transform，
  // 若挂到 memo 化的 CardItem 上会被它的比较函数吞掉，导致拖拽时没有任何位移动画。
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // 拖拽中原位卡片淡出为占位幽灵，真正跟随指针的是 DragOverlay 浮层
    opacity: isDragging ? 0.4 : 1,
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
export interface ScriptCardGridProps {
  scriptList: ScriptLoading[];
  loadingList: boolean;
  updateScripts: (uuids: string[], data: Partial<ScriptLoading>) => void;
  handleDelete: (script: ScriptLoading) => void;
  handleRunStop: (script: ScriptLoading) => void;
  scriptListSortOrderMove: (params: { active: string; over: string }) => void;
}

// ========== 卡片网格主组件 ==========
function ScriptCardGrid({
  scriptList,
  loadingList,
  updateScripts,
  handleDelete,
  handleRunStop,
  scriptListSortOrderMove,
}: ScriptCardGridProps) {
  const navigate = useNavigate();

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortableIds = useMemo(() => scriptList.map((s) => s.uuid), [scriptList]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(`${event.active.id}`);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (over && active.id !== over.id) {
        scriptListSortOrderMove({ active: `${active.id}`, over: `${over.id}` });
      }
    },
    [scriptListSortOrderMove]
  );

  const handleDragCancel = useCallback(() => setActiveId(null), []);

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

  const activeScript = useMemo(
    () => (activeId ? (scriptList.find((s) => s.uuid === activeId) ?? null) : null),
    [activeId, scriptList]
  );

  return (
    <div className="flex-1 overflow-auto scrollbar-custom px-6 pt-4 pb-6">
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
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          collisionDetection={closestCenter}
          accessibility={a11y}
        >
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
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
          <DragOverlay dropAnimation={dropAnimation}>
            {activeScript ? (
              <div className="rounded-xl shadow-2xl ring-1 ring-primary/30 scale-[1.03] cursor-grabbing">
                <CardItem
                  script={activeScript}
                  onEnable={handleEnable}
                  onDelete={handleDelete}
                  onRunStop={handleRunStop}
                  navigate={navigate}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

// ========== 单个卡片 ==========
interface CardItemProps {
  script: ScriptLoading;
  onEnable: (script: ScriptLoading, checked: boolean) => void;
  onDelete: (script: ScriptLoading) => void;
  onRunStop: (script: ScriptLoading) => void;
  navigate: ReturnType<typeof useNavigate>;
}

const CardItem = React.memo(
  ({ script, onEnable, onDelete, onRunStop, navigate }: CardItemProps) => {
    const isDisabled = script.status === SCRIPT_STATUS_DISABLE;
    const isBackground = script.type === SCRIPT_TYPE_BACKGROUND || script.type === SCRIPT_TYPE_CRONTAB;
    const name = i18nName(script);
    const version = script.metadata?.version?.[0] || "";
    const author = script.metadata?.author?.[0] || "";

    return (
      <div
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

        {/* 来源 + 标签 + 状态 */}
        <div className="flex items-center gap-2 mb-3 min-h-[20px]">
          <SourceTag script={script} />
          <CardTagBadges metadata={script.metadata} selfMetadata={script.selfMetadata} />
          {isBackground ? <RunStatusBadge runStatus={script.runStatus} /> : <FaviconDots favorites={script.favorite} />}
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-border mb-3" />

        {/* 底部: 更新时间 + 行内操作（已去掉 ⋯ 更多菜单） */}
        <div className="flex items-center justify-between">
          <UpdateTimeCell script={script} />
          <ScriptRowActions script={script} navigate={navigate} onDelete={onDelete} onRunStop={onRunStop} />
        </div>
      </div>
    );
  },
  (prev: CardItemProps, next: CardItemProps) =>
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

export default React.memo(ScriptCardGrid);

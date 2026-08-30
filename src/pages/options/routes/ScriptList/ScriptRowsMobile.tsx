import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { GripVertical } from "lucide-react";
import {
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { requestEnableScript, scriptClient, synchronizeClient } from "@App/pages/store/features/script";
import { EmptyState } from "@App/pages/components/ui/empty-state";
import { LoadingState } from "@App/pages/components/ui/loading-state";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { notify } from "@App/pages/components/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@App/pages/components/ui/alert-dialog";
import {
  MobileActionSheet,
  MobileActionSheetItem,
  MobileListRow,
  MobileListRowLeading,
  MobileListRowMain,
  MobileListRowTrailing,
  MobileSwipeRow,
  useLongPress,
} from "@App/pages/components/ui/mobile-list";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";
import { i18nName } from "@App/locales/locales";
import { versionDisplay } from "@App/pages/utils";
import {
  EnableSwitch,
  RunStatusBadge,
  ScheduleNextRun,
  ScriptIcon,
  getScriptHomePage,
  openExternalUrl,
  scriptTypeLabel,
} from "./components";

import type { DragEndEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ========== 拖拽上下文 ==========
type DragCtx = Pick<ReturnType<typeof useSortable>, "listeners" | "setActivatorNodeRef"> | null;
const SortableDragCtx = createContext<DragCtx>(null);

function DraggableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, transform, transition, listeners, setActivatorNodeRef, isDragging, attributes } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
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
  if (!sortable) return null;
  const { setActivatorNodeRef, listeners } = sortable;
  return (
    <span ref={setActivatorNodeRef} {...listeners} className="flex size-5 items-center justify-center">
      <GripVertical className="size-4 text-muted-foreground" />
    </span>
  );
}

export interface ScriptRowsMobileProps {
  scriptList: ScriptLoading[];
  loadingList: boolean;
  updateScripts: (uuids: string[], data: Partial<ScriptLoading>) => void;
  handleDelete: (script: ScriptLoading) => void;
  handleRunStop: (script: ScriptLoading) => void;
  scriptListSortOrderMove: (params: { active: string; over: string }) => void;
  selectionMode: boolean;
  selectedUuids: Set<string>;
  toggleSelect: (uuid: string) => void;
  onEnterSelectionMode: (uuid: string) => void;
}

export default function ScriptRowsMobile({
  scriptList,
  loadingList,
  updateScripts,
  handleDelete,
  handleRunStop,
  scriptListSortOrderMove,
  selectionMode,
  selectedUuids,
  toggleSelect,
  onEnterSelectionMode,
}: ScriptRowsMobileProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sheetUuid, setSheetUuid] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScriptLoading | null>(null);
  const [trashEnabled] = useSystemConfig("trash_enabled");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortableIds = useMemo(() => scriptList.map((s) => s.uuid), [scriptList]);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (over && active.id !== over.id) {
        scriptListSortOrderMove({ active: `${active.id}`, over: `${over.id}` });
      }
    },
    [scriptListSortOrderMove]
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

  const sheetScript = sheetUuid ? (scriptList.find((s) => s.uuid === sheetUuid) ?? null) : null;

  if (loadingList) {
    return (
      <div className="flex-1 overflow-y-auto">
        <LoadingState label={t("loading")} />
      </div>
    );
  }

  if (scriptList.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyState data-testid="script-list-empty" title={t("no_scripts")} compact />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" data-tour="m-card-list">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {scriptList.map((script) => (
            <DraggableRow key={script.uuid} id={script.uuid}>
              <ScriptRowMobile
                script={script}
                selectionMode={selectionMode}
                selected={selectedUuids.has(script.uuid)}
                onEnable={handleEnable}
                onOpenActions={setSheetUuid}
                onToggleSelect={toggleSelect}
                onEnterSelectionMode={onEnterSelectionMode}
                onDelete={setPendingDelete}
                navigate={navigate}
              />
            </DraggableRow>
          ))}
        </SortableContext>
      </DndContext>

      {sheetScript && (
        <ScriptActionSheet
          script={sheetScript}
          onOpenChange={(open) => !open && setSheetUuid(null)}
          navigate={navigate}
          onRunStop={handleRunStop}
          onDelete={setPendingDelete}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete &&
                ((trashEnabled ?? true)
                  ? t("script:confirm_delete_script_trash_content", { name: i18nName(pendingDelete) })
                  : t("script:confirm_delete_script_content", { name: i18nName(pendingDelete) }))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("editor:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) handleDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ========== 单行 ==========
interface ScriptRowMobileProps {
  script: ScriptLoading;
  selectionMode: boolean;
  selected: boolean;
  onEnable: (script: ScriptLoading, checked: boolean) => void;
  onOpenActions: (uuid: string) => void;
  onToggleSelect: (uuid: string) => void;
  onEnterSelectionMode: (uuid: string) => void;
  onDelete: (script: ScriptLoading) => void;
  navigate: ReturnType<typeof useNavigate>;
}

const ScriptRowMobile = React.memo(
  ({
    script,
    selectionMode,
    selected,
    onEnable,
    onOpenActions,
    onToggleSelect,
    onEnterSelectionMode,
    onDelete,
    navigate,
  }: ScriptRowMobileProps) => {
    const { t } = useTranslation();
    const name = i18nName(script);
    const isBackground = script.type === SCRIPT_TYPE_BACKGROUND || script.type === SCRIPT_TYPE_CRONTAB;
    const siteCount = script.favorite?.length ?? 0;
    const meta = [
      versionDisplay(script.metadata?.version?.[0]),
      scriptTypeLabel(script.type, t),
      script.type === SCRIPT_TYPE_NORMAL ? t("script:site_count", { count: siteCount }) : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const longPress = useLongPress(
      useCallback(() => onEnterSelectionMode(script.uuid), [onEnterSelectionMode, script])
    );

    return (
      <MobileSwipeRow
        {...(selectionMode ? {} : longPress)}
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate(`/script/editor/${script.uuid}`)}
              className="flex w-16 items-center justify-center bg-primary text-xs font-medium text-primary-foreground"
            >
              {t("edit")}
            </button>
            <button
              type="button"
              onClick={() => onDelete(script)}
              className="flex w-16 items-center justify-center bg-destructive text-xs font-medium text-destructive-foreground"
            >
              {t("delete")}
            </button>
          </>
        }
      >
        <MobileListRow selected={selected} disabled={script.status === SCRIPT_STATUS_DISABLE}>
          <MobileListRowLeading className="gap-2">
            {selectionMode ? (
              <Checkbox
                aria-label={name}
                checked={selected}
                onCheckedChange={() => onToggleSelect(script.uuid)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <DragHandle />
            )}
            <ScriptIcon name={name} metadata={script.metadata} />
          </MobileListRowLeading>

          <MobileListRowMain onClick={() => (selectionMode ? onToggleSelect(script.uuid) : onOpenActions(script.uuid))}>
            <span className="w-full truncate text-sm font-medium">{name}</span>
            <span className="flex w-full min-w-0 items-center gap-1.5">
              <span className="truncate text-[11px] text-muted-foreground">{meta}</span>
              {isBackground && <RunStatusBadge runStatus={script.runStatus} />}
              <ScheduleNextRun script={script} />
            </span>
          </MobileListRowMain>

          {!selectionMode && (
            <MobileListRowTrailing>
              <EnableSwitch
                status={script.status}
                enableLoading={script.enableLoading}
                onCheckedChange={(checked) => onEnable(script, checked)}
              />
            </MobileListRowTrailing>
          )}
        </MobileListRow>
      </MobileSwipeRow>
    );
  },
  (prev, next) =>
    prev.script.uuid === next.script.uuid &&
    prev.script.status === next.script.status &&
    prev.script.enableLoading === next.script.enableLoading &&
    prev.script.actionLoading === next.script.actionLoading &&
    prev.script.runStatus === next.script.runStatus &&
    prev.script.updatetime === next.script.updatetime &&
    prev.script.favorite === next.script.favorite &&
    prev.selectionMode === next.selectionMode &&
    prev.selected === next.selected
);
ScriptRowMobile.displayName = "ScriptRowMobile";

// ========== 底部操作面板 ==========
function ScriptActionSheet({
  script,
  onOpenChange,
  navigate,
  onRunStop,
  onDelete,
}: {
  script: ScriptLoading;
  onOpenChange: (open: boolean) => void;
  navigate: ReturnType<typeof useNavigate>;
  onRunStop: (script: ScriptLoading) => void;
  onDelete: (script: ScriptLoading) => void;
}) {
  const { t } = useTranslation();
  const name = i18nName(script);
  const home = getScriptHomePage(script.metadata);
  const isBackground = script.type !== SCRIPT_TYPE_NORMAL;
  const isRunning = script.runStatus === SCRIPT_RUN_STATUS_RUNNING;

  return (
    <MobileActionSheet
      open
      onOpenChange={onOpenChange}
      title={name}
      description={[versionDisplay(script.metadata?.version?.[0]), scriptTypeLabel(script.type, t)]
        .filter(Boolean)
        .join(" · ")}
      icon={<ScriptIcon name={name} metadata={script.metadata} />}
    >
      <MobileActionSheetItem onSelect={() => navigate(`/script/editor/${script.uuid}`)}>
        {t("edit")}
      </MobileActionSheetItem>
      {script.config && (
        <MobileActionSheetItem onSelect={() => navigate(`/?userConfig=${script.uuid}`)}>
          {t("editor:user_config")}
        </MobileActionSheetItem>
      )}
      {script.metadata?.cloudcat && (
        <MobileActionSheetItem onSelect={() => navigate(`/?cloud=${script.uuid}`)}>
          {t("editor:upload_to_cloud")}
        </MobileActionSheetItem>
      )}
      {home && (
        <MobileActionSheetItem onSelect={() => openExternalUrl(home)}>{t("script:homepage")}</MobileActionSheetItem>
      )}
      {isBackground && (
        <MobileActionSheetItem onSelect={() => onRunStop(script)}>
          {isRunning ? t("stop") : t("editor:run")}
        </MobileActionSheetItem>
      )}
      <MobileActionSheetItem onSelect={() => void scriptClient.requestCheckUpdate(script.uuid)}>
        {t("check_update")}
      </MobileActionSheetItem>
      <MobileActionSheetItem
        onSelect={() => {
          const id = notify.loading(t("editor:exporting"));
          void synchronizeClient.export([script.uuid]).then(() => notify.success(t("settings:export_success"), { id }));
        }}
      >
        {t("export")}
      </MobileActionSheetItem>
      <MobileActionSheetItem destructive onSelect={() => onDelete(script)}>
        {t("delete")}
      </MobileActionSheetItem>
    </MobileActionSheet>
  );
}

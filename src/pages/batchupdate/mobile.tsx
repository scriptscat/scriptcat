import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BellOff, ChevronRight, Download, PackageCheck, RefreshCw, RotateCcw, X } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@App/pages/components/ui/collapsible";
import { Surface } from "@App/pages/components/ui/surface";
import { splitBySite, type RowState, type UpdateItem } from "./logic";
import {
  BatchSummary,
  CHECKBOX_HIT,
  ConnectBadge,
  EmptyState,
  LoadErrorScreen,
  RecordExpiredNotice,
  RestoreAllAction,
  RiskBadge,
  RowStatus,
  RowWorkingBar,
  rowPhaseClass,
  SelectAllCheckbox,
  SelectAllLabel,
  ScriptAvatar,
  ScriptName,
  showSkeleton,
  SkeletonBar,
  SourceCell,
  StatusBadge,
  TopProgressBar,
  UpdateGroupHeader,
  VersionDiff,
  type BatchUpdateViewProps,
} from "./components";

/** 移动端检查中的骨架卡片：三行对齐真实卡片（名称行 / 版本行 / 来源+操作行），取代冻结的空状态/大转圈 */
function SkeletonCards() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="update-skeleton"
      role="status"
      aria-busy="true"
      aria-label={t("install:updatepage.loading_list")}
      className="flex flex-col gap-2.5 p-4"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <Surface key={i} padding="compact" className="gap-2.5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <SkeletonBar className="size-7 shrink-0 rounded-md" />
            <SkeletonBar className="h-4 w-32" />
            <div className="flex-1" />
            <SkeletonBar className="h-5 w-12 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBar className="h-4 w-24" />
            <div className="flex-1" />
            <SkeletonBar className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBar className="h-4 w-16" />
            <div className="flex-1" />
            <SkeletonBar className="h-6 w-14 rounded-md" />
            <SkeletonBar className="h-6 w-14 rounded-md" />
          </div>
        </Surface>
      ))}
    </div>
  );
}

/**
 * 顶部选择栏与底部操作栏的骨架占位。
 * 这两条都在滚动区之外，真实数据到达时会同时从上下挤压列表，只给列表画骨架挡不住这次跳动。
 */
function SkeletonSelectBar() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border bg-card px-4">
      <SkeletonBar className="size-4 rounded-md" />
      <SkeletonBar className="h-4 w-24" />
    </div>
  );
}

function SkeletonActionBar() {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-4 pt-2.5 pb-6">
      <SkeletonBar className="h-10 flex-1 rounded-md" />
      <SkeletonBar className="h-10 flex-1 rounded-md" />
    </div>
  );
}

/**
 * 卡片内文字按钮的触控区：撑到 44px 高、左右各 12px，再用负外边距抵消纵向占位，
 * 外观和卡片高度都不变；两个按钮的触控区以分隔线为界，不会互相覆盖。
 */
const TAP = "-my-3 flex h-11 items-center px-3";

/** 移动端单卡（待更新或已忽略） */
function MobileCard({
  item,
  state,
  selected,
  opening,
  batchBusy,
  onToggle,
  onOpen,
  onUpdate,
  onIgnore,
  onRestore,
  ignoredCard,
}: {
  item: UpdateItem;
  state?: RowState;
  selected?: boolean;
  opening?: boolean;
  batchBusy?: boolean;
  onToggle?: (uuid: string) => void;
  onOpen: (uuid: string) => void;
  onUpdate?: (item: UpdateItem) => void;
  onIgnore?: (item: UpdateItem) => void;
  onRestore?: (item: UpdateItem) => void;
  ignoredCard?: boolean;
}) {
  const { t } = useTranslation();
  const dim = item.enabled ? "" : "opacity-55";
  const primaryAction = () => (ignoredCard ? onRestore?.(item) : onUpdate?.(item));
  return (
    <Surface
      data-testid={ignoredCard ? "ignored-update-card" : "update-card"}
      padding="compact"
      className={cn("relative gap-2.5 shadow-sm", rowPhaseClass(state))}
    >
      <div className="flex items-center gap-2.5">
        {ignoredCard ? (
          <BellOff className="size-[18px] shrink-0 text-muted-foreground" />
        ) : (
          <Checkbox
            checked={!!selected}
            disabled={batchBusy}
            onCheckedChange={() => onToggle?.(item.uuid)}
            className={CHECKBOX_HIT}
          />
        )}
        <span className={cn("flex min-w-0 flex-1 items-center gap-2.5", dim)}>
          <ScriptAvatar name={item.name} iconUrl={item.iconUrl} />
          <ScriptName name={item.name} uuid={item.uuid} loading={opening} onClick={() => onOpen(item.uuid)} />
        </span>
        <StatusBadge enabled={item.enabled} />
      </div>
      <div className={cn("flex flex-col gap-1.5", dim)}>
        <VersionDiff oldVersion={item.oldVersion} newVersion={item.newVersion} wrap />
        <div className="flex flex-wrap items-center gap-1.5">
          <RiskBadge risk={item.risk} similarity={item.similarity} />
          {item.withNewConnect && <ConnectBadge newConnects={item.newConnects} />}
        </div>
      </div>
      <div className="flex items-center">
        <span className={cn("min-w-0", dim)}>
          <SourceCell source={item.source} />
        </span>
        <div className="flex-1" />
        <RowStatus item={item} state={state} onRetry={primaryAction}>
          {ignoredCard ? (
            <button
              type="button"
              onClick={() => onRestore?.(item)}
              className={cn(
                "flex items-center gap-1 text-[13px] font-medium text-primary hover:underline",
                TAP,
                "-mr-3"
              )}
            >
              <RotateCcw className="size-3.5" />
              {t("install:updatepage.restore")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onUpdate?.(item)}
                className={cn("text-[13px] font-medium text-primary hover:underline", TAP)}
              >
                {t("install:updatepage.update")}
              </button>
              <span className="h-3 w-px bg-border" />
              <button
                type="button"
                onClick={() => onIgnore?.(item)}
                className={cn("text-[13px] text-muted-foreground hover:underline", TAP, "-mr-3")}
              >
                {t("install:updatepage.ignore")}
              </button>
            </>
          )}
        </RowStatus>
      </div>
      {state?.phase === "working" && <RowWorkingBar />}
    </Surface>
  );
}

function MobileIgnored({ view }: { view: BatchUpdateViewProps }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex h-12 items-center justify-between rounded-xl border border-border bg-card px-3.5">
        <CollapsibleTrigger data-testid="ignored-toggle" className="group flex flex-1 items-center gap-2">
          <ChevronRight className="size-[18px] text-fg-secondary transition-transform group-data-[state=open]:rotate-90" />
          <span className="text-sm font-medium text-foreground">{t("install:updatepage.ignored_section")}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {view.ignored.length}
          </span>
        </CollapsibleTrigger>
        {open ? (
          <RestoreAllAction view={view} />
        ) : (
          <span data-testid="ignored-expand-hint" className="text-xs text-muted-foreground">
            {t("install:updatepage.tap_to_expand")}
          </span>
        )}
      </div>
      <CollapsibleContent className="flex flex-col gap-2.5 pt-2.5">
        {view.ignored.map((item) => (
          <MobileCard
            key={item.uuid}
            item={item}
            state={view.rowStates[item.uuid]}
            ignoredCard
            opening={view.opening.has(item.uuid)}
            onOpen={view.onOpen}
            onRestore={view.onRestore}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 移动端整页视图 */
export function MobileView({ view }: { view: BatchUpdateViewProps }) {
  const { t } = useTranslation();
  const selectedCount = view.updates.filter((u) => view.selected.has(u.uuid)).length;
  const groups = splitBySite(view.updates);
  const cards = (items: UpdateItem[]) =>
    items.map((item) => (
      <MobileCard
        key={item.uuid}
        item={item}
        state={view.rowStates[item.uuid]}
        selected={view.selected.has(item.uuid)}
        opening={view.opening.has(item.uuid)}
        batchBusy={view.batchBusy}
        onToggle={view.onToggle}
        onOpen={view.onOpen}
        onUpdate={view.onUpdate}
        onIgnore={view.onIgnore}
      />
    ));
  const empty = view.updates.length === 0 && view.ignored.length === 0;
  const skeleton = view.loadError === null && showSkeleton(view, empty);

  const subtitle = view.checking
    ? t("install:updatepage.status_checking_updates")
    : [
        view.updates.length > 0 ? t("install:updatepage.updates_available", { count: view.updates.length }) : "",
        view.checktime
          ? t("install:updatepage.last_check", { time: formatUnixTime(Math.floor(view.checktime / 1000)) })
          : "",
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-[62px] shrink-0 items-center gap-1 border-b border-border bg-card pr-1.5 pl-4">
        <PackageCheck className="mr-2 size-[22px] shrink-0 text-primary" />
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-semibold leading-tight text-foreground">{t("install:updatepage.title")}</span>
          {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
        </div>
        <div className="flex-1" />
        <Button
          variant={view.recordExpired ? "default" : "ghost"}
          size="icon"
          disabled={view.checking}
          aria-label={t("install:updatepage.main_header")}
          onClick={view.onCheckNow}
          className={cn("size-11", !view.recordExpired && "text-fg-secondary")}
        >
          <RefreshCw className={cn(view.checking && "animate-spin")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 text-fg-secondary"
          aria-label={t("common:close")}
          onClick={() => window.close()}
        >
          <X />
        </Button>
      </header>

      {view.checking && <TopProgressBar />}
      {view.recordExpired && <RecordExpiredNotice onCheckNow={view.onCheckNow} className="px-4" />}
      {view.batchProgress && (
        <BatchSummary progress={view.batchProgress} onOpenScriptList={view.onOpenScriptList} className="px-4" />
      )}

      {skeleton && <SkeletonSelectBar />}

      {!skeleton && !empty && view.updates.length > 0 && (
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-2.5">
            <SelectAllCheckbox view={view} className={CHECKBOX_HIT} />
            <span className="text-[13px] font-medium text-foreground">
              <SelectAllLabel view={view} />
            </span>
          </div>
          {view.ignored.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("install:updatepage.ignored_count", { count: view.ignored.length })}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto scrollbar-custom">
        {view.loadError !== null ? (
          <LoadErrorScreen error={view.loadError} onRetry={view.onRetryLoad} onOpenScriptList={view.onOpenScriptList} />
        ) : skeleton ? (
          <SkeletonCards />
        ) : empty ? (
          <EmptyState totalChecked={view.totalChecked} checking={view.checking} onCheckNow={view.onCheckNow} />
        ) : (
          <div className="flex flex-col gap-2.5 p-4">
            {groups ? (
              <>
                <UpdateGroupHeader kind="site" items={groups.site} view={view} className="pt-1" />
                {cards(groups.site)}
                {groups.other.length > 0 && (
                  <>
                    <UpdateGroupHeader kind="other" items={groups.other} view={view} className="pt-1" />
                    {cards(groups.other)}
                  </>
                )}
              </>
            ) : (
              cards(view.updates)
            )}
            {view.ignored.length > 0 && <MobileIgnored view={view} />}
          </div>
        )}
      </div>

      {skeleton && <SkeletonActionBar />}

      {!skeleton && !empty && view.updates.length > 0 && (
        <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-4 pt-2.5 pb-6">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            disabled={selectedCount === 0 || view.batchBusy}
            onClick={view.onIgnoreSelected}
          >
            <BellOff />
            {t("install:updatepage.ignore_selected")}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={selectedCount === 0 || view.batchBusy}
            onClick={view.onUpdateSelected}
          >
            <Download />
            {t("install:updatepage.update_selected", { count: selectedCount })}
          </Button>
        </div>
      )}
    </div>
  );
}

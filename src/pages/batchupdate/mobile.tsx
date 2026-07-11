import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BellOff, ChevronRight, Download, PackageCheck, RefreshCw, RotateCcw, X } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@App/pages/components/ui/collapsible";
import { Surface } from "@App/pages/components/ui/surface";
import type { UpdateItem } from "./logic";
import {
  AutoCloseChip,
  ConnectBadge,
  EmptyState,
  RiskBadge,
  ScriptAvatar,
  ScriptName,
  SkeletonBar,
  SourceCell,
  StatusBadge,
  TopProgressBar,
  VersionDiff,
  type BatchUpdateViewProps,
} from "./components";

/** 移动端检查中的骨架卡片：取代冻结的空状态/大转圈 */
function SkeletonCards() {
  return (
    <div data-testid="update-skeleton" className="flex flex-col gap-2.5 p-4">
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
        </Surface>
      ))}
    </div>
  );
}

/** 移动端单卡（待更新或已忽略） */
function MobileCard({
  item,
  selected,
  onToggle,
  onOpen,
  onUpdate,
  onIgnore,
  onRestore,
  ignoredCard,
}: {
  item: UpdateItem;
  selected?: boolean;
  onToggle?: (uuid: string) => void;
  onOpen: (uuid: string) => void;
  onUpdate?: (item: UpdateItem) => void;
  onIgnore?: (item: UpdateItem) => void;
  onRestore?: (item: UpdateItem) => void;
  ignoredCard?: boolean;
}) {
  const { t } = useTranslation();
  const dim = item.enabled ? "" : "opacity-55";
  return (
    <Surface
      data-testid={ignoredCard ? "ignored-update-card" : "update-card"}
      padding="compact"
      className="gap-2.5 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        {ignoredCard ? (
          <BellOff className="size-[18px] shrink-0 text-muted-foreground" />
        ) : (
          <Checkbox checked={!!selected} onCheckedChange={() => onToggle?.(item.uuid)} />
        )}
        <span className={cn("flex min-w-0 flex-1 items-center gap-2.5", dim)}>
          <ScriptAvatar name={item.name} iconUrl={item.iconUrl} />
          <ScriptName name={item.name} onClick={() => onOpen(item.uuid)} />
        </span>
        <StatusBadge enabled={item.enabled} />
      </div>
      <div className={cn("flex items-center gap-2", dim)}>
        <VersionDiff oldVersion={item.oldVersion} newVersion={item.newVersion} />
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <RiskBadge risk={item.risk} similarity={item.similarity} />
          {item.withNewConnect && <ConnectBadge newConnects={item.newConnects} />}
        </div>
      </div>
      <div className="flex items-center">
        <span className={dim}>
          <SourceCell source={item.source} />
        </span>
        <div className="flex-1" />
        {ignoredCard ? (
          <button
            type="button"
            onClick={() => onRestore?.(item)}
            className="flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
          >
            <RotateCcw className="size-3.5" />
            {t("install:updatepage.restore")}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdate?.(item)}
              className="text-[13px] font-medium text-primary hover:underline"
            >
              {t("install:updatepage.update")}
            </button>
            <span className="h-3 w-px bg-border" />
            <button
              type="button"
              onClick={() => onIgnore?.(item)}
              className="text-[13px] text-muted-foreground hover:underline"
            >
              {t("install:updatepage.ignore")}
            </button>
          </div>
        )}
      </div>
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
          <button
            type="button"
            data-testid="ignored-restore-all"
            onClick={view.onRestoreAll}
            className="text-[13px] font-medium text-primary hover:underline"
          >
            {t("install:updatepage.restore_all")}
          </button>
        ) : (
          <span data-testid="ignored-expand-hint" className="text-xs text-muted-foreground">
            {t("install:updatepage.tap_to_expand")}
          </span>
        )}
      </div>
      <CollapsibleContent className="flex flex-col gap-2.5 pt-2.5">
        {view.ignored.map((item) => (
          <MobileCard key={item.uuid} item={item} ignoredCard onOpen={view.onOpen} onRestore={view.onRestore} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 移动端整页视图 */
export function MobileView({ view }: { view: BatchUpdateViewProps }) {
  const { t } = useTranslation();
  const selectedCount = view.updates.filter((u) => view.selected.has(u.uuid)).length;
  const allSelected = view.updates.length > 0 && selectedCount === view.updates.length;
  const empty = view.updates.length === 0 && view.ignored.length === 0;

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
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-[62px] shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <PackageCheck className="size-[22px] shrink-0 text-primary" />
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-semibold leading-tight text-foreground">{t("install:updatepage.title")}</span>
          {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="icon-sm"
          disabled={view.checking}
          aria-label={t("install:updatepage.main_header")}
          onClick={view.onCheckNow}
        >
          <RefreshCw className={cn(view.checking && "animate-spin")} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-fg-secondary"
          aria-label={t("common:close")}
          onClick={() => window.close()}
        >
          <X />
        </Button>
      </header>

      {view.checking && <TopProgressBar />}

      {!empty && view.updates.length > 0 && (
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-2.5">
            <Checkbox checked={allSelected} onCheckedChange={view.onToggleAll} />
            <span className="text-[13px] font-medium text-foreground">
              {t("install:updatepage.selected_count", { selected: selectedCount, total: view.updates.length })}
            </span>
          </div>
          {view.autoClose !== null ? (
            <AutoCloseChip seconds={view.autoClose} />
          ) : (
            view.ignored.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {t("install:updatepage.ignored_count", { count: view.ignored.length })}
              </span>
            )
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto scrollbar-custom">
        {view.loading || (view.checking && empty) ? (
          <SkeletonCards />
        ) : empty ? (
          <EmptyState totalChecked={view.totalChecked} onCheckNow={view.onCheckNow} />
        ) : (
          <div className="flex flex-col gap-2.5 p-4">
            {view.updates.map((item) => (
              <MobileCard
                key={item.uuid}
                item={item}
                selected={view.selected.has(item.uuid)}
                onToggle={view.onToggle}
                onOpen={view.onOpen}
                onUpdate={view.onUpdate}
                onIgnore={view.onIgnore}
              />
            ))}
            {view.ignored.length > 0 && <MobileIgnored view={view} />}
          </div>
        )}
      </div>

      {!empty && view.updates.length > 0 && (
        <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-4 pt-2.5 pb-6">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            disabled={selectedCount === 0}
            onClick={view.onIgnoreSelected}
          >
            <BellOff />
            {t("install:updatepage.ignore_selected")}
          </Button>
          <Button size="lg" className="flex-1" disabled={selectedCount === 0} onClick={view.onUpdateSelected}>
            <Download />
            {t("install:updatepage.update_selected", { count: selectedCount })}
          </Button>
        </div>
      )}
    </div>
  );
}

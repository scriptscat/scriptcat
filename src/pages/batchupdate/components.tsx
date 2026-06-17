import {
  ArrowRight,
  BellOff,
  ChevronDown,
  CircleCheckBig,
  Download,
  FileCode,
  Globe,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { t } from "@App/locales/locales";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@App/pages/components/ui/collapsible";
import type { UpdateItem, UpdateRisk } from "./logic";

/** install:updatepage 命名空间下的翻译快捷方法 */
export const tk = (key: string, opt?: Record<string, unknown>): string => t(`install:updatepage.${key}`, opt);

/** 批量更新视图（桌面/移动共用）所需的数据与回调 */
export interface BatchUpdateViewProps {
  updates: UpdateItem[];
  ignored: UpdateItem[];
  /** 本次检查覆盖的脚本总数（用于空状态文案） */
  totalChecked: number;
  checktime: number;
  checking: boolean;
  loading: boolean;
  selected: Set<string>;
  /** 自动关闭剩余秒数；为 null 表示不自动关闭 */
  autoClose: number | null;
  onToggle: (uuid: string) => void;
  onToggleAll: () => void;
  onUpdate: (item: UpdateItem) => void;
  onIgnore: (item: UpdateItem) => void;
  onRestore: (item: UpdateItem) => void;
  onUpdateSelected: () => void;
  onIgnoreSelected: () => void;
  onRestoreAll: () => void;
  onCheckNow: () => void;
  onClose: () => void;
}

const PILL = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const RISK_CLASS: Record<UpdateRisk, string> = {
  major: "bg-destructive/10 text-destructive",
  noticeable: "bg-primary/10 text-primary",
  tiny: "bg-success-bg text-success-fg",
};
const RISK_KEY: Record<UpdateRisk, string> = {
  major: "codechange_major",
  noticeable: "codechange_noticeable",
  tiny: "codechange_tiny",
};

export function RiskBadge({ risk }: { risk: UpdateRisk }) {
  return <span className={cn(PILL, RISK_CLASS[risk])}>{tk(RISK_KEY[risk])}</span>;
}

export function ConnectBadge() {
  return (
    <span className={cn(PILL, "bg-warning-bg text-warning-fg")}>
      <ShieldAlert className="size-3" />
      {tk("tag_new_connect")}
    </span>
  );
}

export function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={cn(PILL, enabled ? "bg-success-bg text-success-fg" : "bg-muted text-muted-foreground")}>
      {enabled ? tk("enabled") : tk("disabled")}
    </span>
  );
}

export function VersionDiff({ oldVersion, newVersion }: { oldVersion: string; newVersion: string }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[13px]">
      <span className="text-muted-foreground">{`v${oldVersion}`}</span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="font-semibold text-primary">{`v${newVersion}`}</span>
    </div>
  );
}

export function SourceCell({ source }: { source: string }) {
  if (!source) return <span className="text-muted-foreground">{"—"}</span>;
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-fg-secondary min-w-0">
      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{source}</span>
    </span>
  );
}

/** 脚本图标占位贴片 */
export function ScriptTile() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
      <FileCode className="size-4 text-fg-secondary" />
    </span>
  );
}

/** 行内文字按钮（更新 / 忽略 / 恢复） */
function LinkAction({ label, onClick, muted }: { label: string; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-[13px] font-medium hover:underline",
        muted ? "text-muted-foreground font-normal" : "text-primary"
      )}
    >
      {label}
    </button>
  );
}

const COL = {
  version: "w-[170px] shrink-0",
  change: "w-[210px] shrink-0",
  source: "w-[150px] shrink-0",
  action: "w-[120px] shrink-0",
};

/** 桌面端单行（待更新或已忽略） */
function DesktopRow({
  item,
  selected,
  onToggle,
  onUpdate,
  onIgnore,
  onRestore,
  ignoredRow,
}: {
  item: UpdateItem;
  selected?: boolean;
  onToggle?: (uuid: string) => void;
  onUpdate?: (item: UpdateItem) => void;
  onIgnore?: (item: UpdateItem) => void;
  onRestore?: (item: UpdateItem) => void;
  ignoredRow?: boolean;
}) {
  const dim = item.enabled ? "" : "opacity-55";
  return (
    <div className="flex h-14 items-center px-4 border-b border-border last:border-b-0 hover:bg-accent/40 transition-colors">
      <div className="flex w-9 shrink-0 items-center">
        {ignoredRow ? (
          <BellOff className="size-3.5 text-muted-foreground" />
        ) : (
          <Checkbox checked={!!selected} onCheckedChange={() => onToggle?.(item.uuid)} />
        )}
      </div>
      <div className={cn("flex flex-1 items-center gap-2.5 min-w-0", dim)}>
        <ScriptTile />
        <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
        <StatusBadge enabled={item.enabled} />
      </div>
      <div className={cn(COL.version, dim)}>
        <VersionDiff oldVersion={item.oldVersion} newVersion={item.newVersion} />
      </div>
      <div className={cn(COL.change, "flex items-center gap-1.5 flex-wrap", dim)}>
        <RiskBadge risk={item.risk} />
        {item.withNewConnect && <ConnectBadge />}
      </div>
      <div className={cn(COL.source, dim)}>
        <SourceCell source={item.source} />
      </div>
      <div className={cn(COL.action, "flex items-center justify-end gap-2")}>
        {ignoredRow ? (
          <LinkAction label={tk("restore")} onClick={() => onRestore?.(item)} />
        ) : (
          <>
            <LinkAction label={tk("update")} onClick={() => onUpdate?.(item)} />
            <span className="h-3 w-px bg-border" />
            <LinkAction label={tk("ignore")} onClick={() => onIgnore?.(item)} muted />
          </>
        )}
      </div>
    </div>
  );
}

function DesktopTable({ view }: { view: BatchUpdateViewProps }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex h-10 items-center px-4 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
        <div className="w-9 shrink-0" />
        <div className="flex-1">{tk("col_script")}</div>
        <div className={COL.version}>{tk("col_version")}</div>
        <div className={COL.change}>{tk("col_change")}</div>
        <div className={COL.source}>{tk("col_source")}</div>
        <div className={cn(COL.action, "text-right")}>{tk("col_action")}</div>
      </div>
      {view.updates.map((item) => (
        <DesktopRow
          key={item.uuid}
          item={item}
          selected={view.selected.has(item.uuid)}
          onToggle={view.onToggle}
          onUpdate={view.onUpdate}
          onIgnore={view.onIgnore}
        />
      ))}
    </div>
  );
}

function DesktopIgnored({ view }: { view: BatchUpdateViewProps }) {
  return (
    <Collapsible defaultOpen>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex h-12 items-center justify-between px-4 border-b border-border">
          <CollapsibleTrigger className="group flex items-center gap-2">
            <ChevronDown className="size-[18px] text-fg-secondary transition-transform group-data-[state=closed]:-rotate-90" />
            <span className="text-sm font-medium text-foreground">{tk("ignored_section")}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {view.ignored.length}
            </span>
          </CollapsibleTrigger>
          <LinkAction label={tk("restore_all")} onClick={view.onRestoreAll} />
        </div>
        <CollapsibleContent>
          {view.ignored.map((item) => (
            <DesktopRow key={item.uuid} item={item} ignoredRow onRestore={view.onRestore} />
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function DesktopToolbar({ view }: { view: BatchUpdateViewProps }) {
  const selectedCount = view.updates.filter((u) => view.selected.has(u.uuid)).length;
  const allSelected = view.updates.length > 0 && selectedCount === view.updates.length;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Checkbox checked={allSelected} onCheckedChange={view.onToggleAll} />
        <span className="text-sm font-medium text-foreground">
          {tk("selected_count", { selected: selectedCount, total: view.updates.length })}
        </span>
        {view.ignored.length > 0 && (
          <>
            <span className="text-muted-foreground">{"·"}</span>
            <span className="text-[13px] text-muted-foreground">
              {tk("ignored_count", { count: view.ignored.length })}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <Button variant="outline" size="sm" disabled={selectedCount === 0} onClick={view.onIgnoreSelected}>
          <BellOff />
          {tk("ignore_selected")}
        </Button>
        <Button size="sm" disabled={selectedCount === 0} onClick={view.onUpdateSelected}>
          <Download />
          {tk("update_selected", { count: selectedCount })}
        </Button>
      </div>
    </div>
  );
}

/** 空状态：所有脚本均为最新 */
export function EmptyState({ totalChecked, onCheckNow }: { totalChecked: number; onCheckNow: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="flex size-[72px] items-center justify-center rounded-full bg-primary-light">
        <CircleCheckBig className="size-9 text-primary" />
      </span>
      <div className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold text-foreground">{tk("empty_title")}</span>
        <span className="text-[13px] text-muted-foreground">{tk("empty_desc", { count: totalChecked })}</span>
      </div>
      <Button onClick={onCheckNow}>
        <RefreshCw />
        {tk("main_header")}
      </Button>
    </div>
  );
}

/** 顶部状态/自动关闭信息条 */
function HeaderStatus({ view }: { view: BatchUpdateViewProps }) {
  const text = view.checking
    ? tk("status_checking_updates")
    : view.checktime
      ? tk("last_check", { time: formatUnixTime(Math.floor(view.checktime / 1000)) })
      : "";
  if (!text) return null;
  return (
    <>
      <span className="text-muted-foreground">{"·"}</span>
      <span className="truncate text-[13px] text-muted-foreground">{text}</span>
    </>
  );
}

/** 自动关闭倒计时小药丸 */
export function AutoCloseChip({ seconds }: { seconds: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      <Timer className="size-3.5" />
      {tk("auto_close", { count: seconds })}
    </span>
  );
}

/** 桌面端整页视图 */
export function DesktopView({ view }: { view: BatchUpdateViewProps }) {
  const empty = view.updates.length === 0 && view.ignored.length === 0;
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex min-w-0 items-center gap-3">
          <PackageCheck className="size-[22px] shrink-0 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">{tk("title")}</h1>
          <HeaderStatus view={view} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button variant="outline" size="sm" disabled={view.checking} onClick={view.onCheckNow}>
            <RefreshCw className={cn(view.checking && "animate-spin")} />
            {tk("main_header")}
          </Button>
          {view.autoClose !== null && <AutoCloseChip seconds={view.autoClose} />}
          <Button variant="ghost" size="icon-sm" onClick={view.onClose}>
            <X />
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-auto scrollbar-custom">
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 px-6 py-6">
          {view.loading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : empty ? (
            <EmptyState totalChecked={view.totalChecked} onCheckNow={view.onCheckNow} />
          ) : (
            <>
              {view.updates.length > 0 && (
                <>
                  <DesktopToolbar view={view} />
                  <DesktopTable view={view} />
                </>
              )}
              {view.ignored.length > 0 && <DesktopIgnored view={view} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

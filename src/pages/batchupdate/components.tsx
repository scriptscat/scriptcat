import { useState, type ReactElement, type ReactNode } from "react";
import {
  ArrowRight,
  BellOff,
  ChevronDown,
  CircleCheckBig,
  Download,
  Globe,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
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
  /** 打开单个脚本的更新详情页 */
  onOpen: (uuid: string) => void;
}

/** 悬停 tooltip：用于展示过长被截断的内容（脚本名、来源）或附加信息（相似度、新增连接） */
export function HoverTip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-[320px] break-all">{content}</TooltipContent>
    </Tooltip>
  );
}

/** 脚本图标：有 @icon 时显示图片，失败或缺省时回退为首字母方块 */
export function ScriptAvatar({ name, iconUrl, size = 28 }: { name: string; iconUrl: string; size?: number }) {
  const [error, setError] = useState(false);
  if (iconUrl && !error) {
    return (
      <img
        src={iconUrl}
        alt={name}
        onError={() => setError(true)}
        className="shrink-0 rounded-md object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-fg-secondary"
      style={{ width: size, height: size }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
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

export function RiskBadge({ risk, similarity }: { risk: UpdateRisk; similarity: number }) {
  return (
    <HoverTip content={`${tk("similarity")} ${Math.round(similarity * 100)}%`}>
      <span className={cn(PILL, RISK_CLASS[risk], "cursor-default")}>{tk(RISK_KEY[risk])}</span>
    </HoverTip>
  );
}

export function ConnectBadge({ newConnects }: { newConnects: string[] }) {
  const content = newConnects.length > 0 ? `${tk("new_connects")}: ${newConnects.join(", ")}` : tk("tag_new_connect");
  return (
    <HoverTip content={content}>
      <span className={cn(PILL, "bg-warning-bg text-warning-fg cursor-default")}>
        <ShieldAlert className="size-3" />
        {tk("tag_new_connect")}
      </span>
    </HoverTip>
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
    <HoverTip content={source}>
      <span className="flex min-w-0 cursor-default items-center gap-1.5 text-[13px] text-fg-secondary">
        <Globe className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{source}</span>
      </span>
    </HoverTip>
  );
}

/** 可点击跳转更新详情页的脚本名（过长时 tooltip 显示全名） */
export function ScriptName({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <HoverTip content={name}>
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
      >
        {name}
      </button>
    </HoverTip>
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
  change: "w-[230px] shrink-0",
  source: "w-[160px] shrink-0",
  action: "w-[110px] shrink-0",
};

/** 桌面端单行（待更新或已忽略） */
function DesktopRow({
  item,
  selected,
  onToggle,
  onOpen,
  onUpdate,
  onIgnore,
  onRestore,
  ignoredRow,
}: {
  item: UpdateItem;
  selected?: boolean;
  onToggle?: (uuid: string) => void;
  onOpen: (uuid: string) => void;
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
        <ScriptAvatar name={item.name} iconUrl={item.iconUrl} />
        <ScriptName name={item.name} onClick={() => onOpen(item.uuid)} />
        <StatusBadge enabled={item.enabled} />
      </div>
      <div className={cn(COL.version, dim)}>
        <VersionDiff oldVersion={item.oldVersion} newVersion={item.newVersion} />
      </div>
      <div className={cn(COL.change, "flex items-center gap-1.5 flex-wrap", dim)}>
        <RiskBadge risk={item.risk} similarity={item.similarity} />
        {item.withNewConnect && <ConnectBadge newConnects={item.newConnects} />}
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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
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
          onOpen={view.onOpen}
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
      <div className="overflow-hidden rounded-xl border border-border bg-card">
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
            <DesktopRow key={item.uuid} item={item} ignoredRow onOpen={view.onOpen} onRestore={view.onRestore} />
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

/** 顶部不确定进度条：检查更新进行中时的即时反馈信号（贴在 header 下方，不随内容滚动） */
export function TopProgressBar() {
  return (
    <div
      role="progressbar"
      aria-label={tk("status_checking_updates")}
      className="h-0.5 w-full shrink-0 overflow-hidden bg-primary/15"
    >
      <div className="h-full w-1/3 animate-indeterminate-bar bg-primary" />
    </div>
  );
}

/** 骨架占位灰条 */
export function SkeletonBar({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded bg-muted", className)} />;
}

/** 桌面端检查中的骨架表格：保留表头 + 占位行，取代冻结的空状态/大转圈 */
export function SkeletonTable() {
  return (
    <div data-testid="update-skeleton" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-10 items-center px-4 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
        <div className="w-9 shrink-0" />
        <div className="flex-1">{tk("col_script")}</div>
        <div className={COL.version}>{tk("col_version")}</div>
        <div className={COL.change}>{tk("col_change")}</div>
        <div className={COL.source}>{tk("col_source")}</div>
        <div className={cn(COL.action, "text-right")}>{tk("col_action")}</div>
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex h-14 items-center px-4 border-b border-border last:border-b-0">
          <div className="w-9 shrink-0">
            <SkeletonBar className="size-4 rounded-md" />
          </div>
          <div className="flex flex-1 items-center gap-2.5 min-w-0">
            <SkeletonBar className="size-7 shrink-0 rounded-md" />
            <SkeletonBar className="h-4 w-40 max-w-[55%]" />
          </div>
          <div className={COL.version}>
            <SkeletonBar className="h-4 w-24" />
          </div>
          <div className={COL.change}>
            <SkeletonBar className="h-5 w-20 rounded-full" />
          </div>
          <div className={COL.source}>
            <SkeletonBar className="h-4 w-16" />
          </div>
          <div className={cn(COL.action, "flex justify-end")}>
            <SkeletonBar className="h-4 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 空状态：所有脚本均为最新 */
export function EmptyState({ totalChecked, onCheckNow }: { totalChecked: number; onCheckNow: () => void }) {
  return (
    <div data-testid="update-empty" className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="flex size-[72px] items-center justify-center rounded-full bg-primary-light">
        <CircleCheckBig className="size-9 text-primary" />
      </span>
      <div className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold text-foreground">{tk("empty_title")}</span>
        <span className="text-[13px] text-muted-foreground">{tk("empty_desc", { count: totalChecked })}</span>
      </div>
      <Button data-testid="empty-recheck" onClick={onCheckNow}>
        <RefreshCw />
        {tk("recheck")}
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
          <Button variant="ghost" size="icon-sm" className="text-fg-secondary" onClick={() => window.close()}>
            <X />
          </Button>
        </div>
      </header>
      {view.checking && <TopProgressBar />}
      <div className="flex-1 overflow-auto scrollbar-custom">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-6 py-6">
          {view.loading || (view.checking && empty) ? (
            <SkeletonTable />
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

import { useState, type ReactElement, type ReactNode } from "react";
import {
  ArrowRight,
  BellOff,
  Check,
  ChevronDown,
  CircleCheckBig,
  Download,
  Globe,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@App/pages/components/ui/collapsible";
import { Progress } from "@App/pages/components/ui/progress";
import { Skeleton } from "@App/pages/components/ui/skeleton";
import { StateScreen } from "@App/pages/components/ui/state-screen";
import { DataPanel } from "@App/pages/components/ui/data-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import type { BatchProgress, RowState, UpdateItem, UpdateRisk } from "./logic";

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
  /** 自动关闭剩余秒数；为 null 表示不再倒计时 */
  autoClose: number | null;
  /** 倒计时曾存在但已被取消（显式点击或隐式操作都算）；用于把药丸切成「已取消」而不是直接消失 */
  autoCloseCancelled: boolean;
  /** 按 uuid 索引的行内更新状态；不在表内即为初始态 */
  rowStates: Record<string, RowState>;
  /** 批量操作进度；为 null 表示当前没有批量操作 */
  batchProgress: BatchProgress | null;
  /** 服务端检查结果已失效，需重新检查更新 */
  recordExpired: boolean;
  onToggle: (uuid: string) => void;
  onToggleAll: () => void;
  onUpdate: (item: UpdateItem) => void;
  onIgnore: (item: UpdateItem) => void;
  onRestore: (item: UpdateItem) => void;
  onUpdateSelected: () => void;
  onIgnoreSelected: () => void;
  onRestoreAll: () => void;
  onCheckNow: () => void;
  onCancelAutoClose: () => void;
  /** 打开单个脚本的更新详情页 */
  onOpen: (uuid: string) => void;
  /** 打开 options 脚本列表，便于事后核对刚更新了哪些脚本 */
  onOpenScriptList: () => void;
}

/** 悬停 tooltip：用于展示过长被截断的内容（脚本名、来源）或附加信息（相似度、新增连接） */
function HoverTip({ content, children }: { content: ReactNode; children: ReactElement }) {
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
  const { t } = useTranslation();
  return (
    <HoverTip content={`${t("install:updatepage.similarity")} ${Math.round(similarity * 100)}%`}>
      <span className={cn(PILL, RISK_CLASS[risk], "cursor-default")}>{t(`install:updatepage.${RISK_KEY[risk]}`)}</span>
    </HoverTip>
  );
}

export function ConnectBadge({ newConnects }: { newConnects: string[] }) {
  const { t } = useTranslation();
  const content =
    newConnects.length > 0
      ? `${t("install:updatepage.new_connects")}: ${newConnects.join(", ")}`
      : t("install:updatepage.tag_new_connect");
  return (
    <HoverTip content={content}>
      <span className={cn(PILL, "bg-warning-bg text-warning-fg cursor-default")}>
        <ShieldAlert className="size-3" />
        {t("install:updatepage.tag_new_connect")}
      </span>
    </HoverTip>
  );
}

export function StatusBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={cn(PILL, enabled ? "bg-success-bg text-success-fg" : "bg-muted text-muted-foreground")}>
      {enabled ? t("install:updatepage.enabled") : t("install:updatepage.disabled")}
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

/**
 * 行内更新状态区：进行中/成功/失败时接管操作区，初始态才让位给常规操作按钮。
 * 桌面与移动共用，保证两套视图的状态语义完全一致。
 */
export function RowStatus({
  item,
  state,
  onRetry,
  children,
}: {
  item: UpdateItem;
  state: RowState | undefined;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const testId = `row-status-${item.uuid}`;
  const wrap = (phase: string, content: ReactNode) => (
    <span data-testid={testId} data-phase={phase} className="flex items-center justify-end gap-1.5 whitespace-nowrap">
      {content}
    </span>
  );
  switch (state?.phase) {
    case "queued":
      return wrap(
        "queued",
        <span className="text-[13px] text-muted-foreground">{t("install:updatepage.row_queued")}</span>
      );
    case "working":
      return wrap(
        "working",
        <>
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span className="text-[13px] font-medium text-primary">{t("install:updatepage.row_updating")}</span>
        </>
      );
    case "success":
    case "exiting":
      return wrap(
        state.phase,
        <>
          <Check className="size-3.5 text-success-fg animate-in zoom-in-50 duration-300 ease-out" />
          <span className="text-[13px] font-medium text-success-fg">
            {t("install:updatepage.row_updated", { version: item.newVersion })}
          </span>
        </>
      );
    case "fail":
      return wrap(
        "fail",
        <>
          <HoverTip content={state.error || t("install:updatepage.unknown_error")}>
            <span className="cursor-default text-[13px] font-medium text-destructive">
              {t("install:updatepage.row_failed")}
            </span>
          </HoverTip>
          <span className="text-muted-foreground">{"·"}</span>
          <button
            type="button"
            data-testid={`row-retry-${item.uuid}`}
            onClick={onRetry}
            className="text-[13px] font-medium text-primary hover:underline"
          >
            {t("install:updatepage.retry")}
          </button>
        </>
      );
    default:
      return wrap("idle", children);
  }
}

/** 行底 2px 扫光条：更新中的持续信号，复用全局不确定进度条动画 */
export function RowWorkingBar() {
  const { t } = useTranslation();
  return (
    <Progress
      variant="top"
      indeterminate
      className="absolute inset-x-0 bottom-0"
      aria-label={t("install:updatepage.row_updating")}
    />
  );
}

/** 行容器随状态变化的底色与退场动画 */
export function rowPhaseClass(state: RowState | undefined): string {
  switch (state?.phase) {
    case "queued":
    case "working":
      // overflow-hidden：把行底扫光条裁进圆角（移动端卡片是圆角承载面）
      return "bg-primary/5 overflow-hidden";
    case "success":
      return "bg-success-bg/70";
    case "exiting":
      return "bg-success-bg/70 overflow-hidden translate-x-6 transition-transform duration-200 ease-out animate-collapse-bar";
    case "fail":
      return "bg-destructive/10";
    default:
      return "";
  }
}

/** 已忽略分组的「全部恢复并更新」：批量安装且不可撤销，必须先确认后果 */
export function RestoreAllAction({ view, className }: { view: BatchUpdateViewProps; className?: string }) {
  const { t } = useTranslation();
  const connectCount = view.ignored.filter((item) => item.withNewConnect).length;
  const description = [
    t("install:updatepage.restore_all_confirm", { count: view.ignored.length }),
    connectCount > 0 ? t("install:updatepage.restore_all_confirm_connect", { count: connectCount }) : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Popconfirm description={description} onConfirm={view.onRestoreAll} side="bottom" align="end">
      <Button
        variant="link"
        size="sm"
        data-testid="ignored-restore-all"
        className={cn("h-auto p-0 text-[13px]", className)}
      >
        {t("install:updatepage.restore_all")}
      </Button>
    </Popconfirm>
  );
}

/** 批量进度与收尾汇总：确定性进度条 + 一条汇总文案 + 事后核对入口 */
export function BatchSummary({
  progress,
  onOpenScriptList,
  className,
}: {
  progress: BatchProgress;
  onOpenScriptList: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { done, total, failed, finished } = progress;
  const updated = done - failed;
  const succeeded = finished && failed === 0;
  const text = !finished
    ? t("install:updatepage.batch_progress", { done, total })
    : failed > 0
      ? t("install:updatepage.batch_done_partial", { updated, failed })
      : t("install:updatepage.batch_done", { count: updated });
  return (
    <div data-testid="batch-summary" className="shrink-0 border-b border-border bg-card">
      <Progress
        variant="top"
        value={done}
        max={total}
        aria-label={text}
        indicatorClassName={succeeded ? "bg-success" : failed > 0 ? "bg-warning" : undefined}
      />
      <div className={cn("flex items-center justify-between gap-3 py-1.5", className)}>
        <span
          className={cn(
            "truncate text-[13px]",
            succeeded ? "text-success-fg" : failed > 0 && finished ? "text-warning-fg" : "text-fg-secondary"
          )}
        >
          {text}
        </span>
        {finished && updated > 0 && (
          <button
            type="button"
            data-testid="batch-open-scripts"
            onClick={onOpenScriptList}
            className="shrink-0 text-[13px] font-medium text-primary hover:underline"
          >
            {t("install:updatepage.view_updated_scripts")}
          </button>
        )}
      </div>
    </div>
  );
}

/** 检查结果已随 Service Worker 回收失效：点更新不会有任何效果，必须显式告知 */
export function RecordExpiredNotice({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="record-expired"
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-border bg-warning-bg py-2 text-[13px] text-warning-fg",
        className
      )}
    >
      <TriangleAlert className="size-4 shrink-0" />
      <span>{t("install:updatepage.record_expired")}</span>
    </div>
  );
}

const COL = {
  version: "w-[170px] shrink-0",
  change: "w-[230px] shrink-0",
  source: "w-[160px] shrink-0",
  // 需容纳最宽的行内状态（「更新失败 · 重试」/ 各语言的「已更新 vX.Y.Z」），不能按初始态的两个按钮取宽
  action: "w-[180px] shrink-0",
};

/** 桌面端单行（待更新或已忽略） */
function DesktopRow({
  item,
  state,
  selected,
  onToggle,
  onOpen,
  onUpdate,
  onIgnore,
  onRestore,
  ignoredRow,
}: {
  item: UpdateItem;
  state?: RowState;
  selected?: boolean;
  onToggle?: (uuid: string) => void;
  onOpen: (uuid: string) => void;
  onUpdate?: (item: UpdateItem) => void;
  onIgnore?: (item: UpdateItem) => void;
  onRestore?: (item: UpdateItem) => void;
  ignoredRow?: boolean;
}) {
  const { t } = useTranslation();
  const dim = item.enabled ? "" : "opacity-55";
  const primaryAction = () => (ignoredRow ? onRestore?.(item) : onUpdate?.(item));
  return (
    <div
      className={cn(
        "relative flex h-14 items-center px-4 border-b border-border last:border-b-0 hover:bg-accent/40 transition-colors",
        rowPhaseClass(state)
      )}
    >
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
        <RowStatus item={item} state={state} onRetry={primaryAction}>
          {ignoredRow ? (
            <LinkAction label={t("install:updatepage.restore")} onClick={() => onRestore?.(item)} />
          ) : (
            <>
              <LinkAction label={t("install:updatepage.update")} onClick={() => onUpdate?.(item)} />
              <span className="h-3 w-px bg-border" />
              <LinkAction label={t("install:updatepage.ignore")} onClick={() => onIgnore?.(item)} muted />
            </>
          )}
        </RowStatus>
      </div>
      {state?.phase === "working" && <RowWorkingBar />}
    </div>
  );
}

function DesktopTable({ view }: { view: BatchUpdateViewProps }) {
  const { t } = useTranslation();
  return (
    <DataPanel>
      <div className="flex h-10 items-center px-4 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
        <div className="w-9 shrink-0" />
        <div className="flex-1">{t("install:updatepage.col_script")}</div>
        <div className={COL.version}>{t("install:updatepage.col_version")}</div>
        <div className={COL.change}>{t("install:updatepage.col_change")}</div>
        <div className={COL.source}>{t("install:updatepage.col_source")}</div>
        <div className={cn(COL.action, "text-right")}>{t("install:updatepage.col_action")}</div>
      </div>
      {view.updates.map((item) => (
        <DesktopRow
          key={item.uuid}
          item={item}
          state={view.rowStates[item.uuid]}
          selected={view.selected.has(item.uuid)}
          onToggle={view.onToggle}
          onOpen={view.onOpen}
          onUpdate={view.onUpdate}
          onIgnore={view.onIgnore}
        />
      ))}
    </DataPanel>
  );
}

function DesktopIgnored({ view }: { view: BatchUpdateViewProps }) {
  const { t } = useTranslation();
  return (
    <Collapsible defaultOpen>
      <DataPanel>
        <div className="flex h-12 items-center justify-between px-4 border-b border-border">
          <CollapsibleTrigger className="group flex items-center gap-2">
            <ChevronDown className="size-[18px] text-fg-secondary transition-transform group-data-[state=closed]:-rotate-90" />
            <span className="text-sm font-medium text-foreground">{t("install:updatepage.ignored_section")}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {view.ignored.length}
            </span>
          </CollapsibleTrigger>
          <RestoreAllAction view={view} />
        </div>
        <CollapsibleContent>
          {view.ignored.map((item) => (
            <DesktopRow
              key={item.uuid}
              item={item}
              state={view.rowStates[item.uuid]}
              ignoredRow
              onOpen={view.onOpen}
              onRestore={view.onRestore}
            />
          ))}
        </CollapsibleContent>
      </DataPanel>
    </Collapsible>
  );
}

function DesktopToolbar({ view }: { view: BatchUpdateViewProps }) {
  const { t } = useTranslation();
  const selectedCount = view.updates.filter((u) => view.selected.has(u.uuid)).length;
  const allSelected = view.updates.length > 0 && selectedCount === view.updates.length;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Checkbox checked={allSelected} onCheckedChange={view.onToggleAll} />
        <span className="text-sm font-medium text-foreground">
          {t("install:updatepage.selected_count", { selected: selectedCount, total: view.updates.length })}
        </span>
        {view.ignored.length > 0 && (
          <>
            <span className="text-muted-foreground">{"·"}</span>
            <span className="text-[13px] text-muted-foreground">
              {t("install:updatepage.ignored_count", { count: view.ignored.length })}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <Button variant="outline" size="sm" disabled={selectedCount === 0} onClick={view.onIgnoreSelected}>
          <BellOff />
          {t("install:updatepage.ignore_selected")}
        </Button>
        <Button size="sm" disabled={selectedCount === 0} onClick={view.onUpdateSelected}>
          <Download />
          {t("install:updatepage.update_selected", { count: selectedCount })}
        </Button>
      </div>
    </div>
  );
}

/** 顶部不确定进度条：检查更新进行中时的即时反馈信号（贴在 header 下方，不随内容滚动） */
export function TopProgressBar() {
  const { t } = useTranslation();
  return <Progress variant="top" indeterminate aria-label={t("install:updatepage.status_checking_updates")} />;
}

/** 骨架占位灰条 */
export function SkeletonBar({ className }: { className?: string }) {
  return <Skeleton className={className} />;
}

/** 桌面端检查中的骨架表格：保留表头 + 占位行，取代冻结的空状态/大转圈 */
function SkeletonTable() {
  const { t } = useTranslation();
  return (
    <DataPanel data-testid="update-skeleton">
      <div className="flex h-10 items-center px-4 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
        <div className="w-9 shrink-0" />
        <div className="flex-1">{t("install:updatepage.col_script")}</div>
        <div className={COL.version}>{t("install:updatepage.col_version")}</div>
        <div className={COL.change}>{t("install:updatepage.col_change")}</div>
        <div className={COL.source}>{t("install:updatepage.col_source")}</div>
        <div className={cn(COL.action, "text-right")}>{t("install:updatepage.col_action")}</div>
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
    </DataPanel>
  );
}

/** 空状态：所有脚本均为最新 */
export function EmptyState({ totalChecked, onCheckNow }: { totalChecked: number; onCheckNow: () => void }) {
  const { t } = useTranslation();
  return (
    <StateScreen
      data-testid="update-empty"
      icon={CircleCheckBig}
      tone="primary"
      compact
      className="py-24"
      title={t("install:updatepage.empty_title")}
      description={t("install:updatepage.empty_desc", { count: totalChecked })}
      action={
        <Button data-testid="empty-recheck" onClick={onCheckNow}>
          <RefreshCw />
          {t("install:updatepage.recheck")}
        </Button>
      }
    />
  );
}

/** 顶部状态/自动关闭信息条 */
function HeaderStatus({ view }: { view: BatchUpdateViewProps }) {
  const { t } = useTranslation();
  const text = view.checking
    ? t("install:updatepage.status_checking_updates")
    : view.checktime
      ? t("install:updatepage.last_check", { time: formatUnixTime(Math.floor(view.checktime / 1000)) })
      : "";
  if (!text) return null;
  return (
    <>
      <span className="text-muted-foreground">{"·"}</span>
      <span className="truncate text-[13px] text-muted-foreground">{text}</span>
    </>
  );
}

const CHIP = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs";

/**
 * 自动关闭倒计时小药丸：可点击刹车。
 * 倒计时结束前的最后几秒转警示色并轻微脉冲，避免"一晃神页面没了"；
 * 隐式取消（勾选/更新/忽略等）也会走到已取消态，不让取消这件事无声发生。
 */
export function AutoCloseChip({
  seconds,
  cancelled,
  onCancel,
}: {
  seconds: number | null;
  cancelled: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (seconds === null) {
    if (!cancelled) return null;
    return (
      <span data-testid="auto-close-chip" data-state="cancelled" className={cn(CHIP, "bg-muted text-muted-foreground")}>
        <Timer className="size-3.5" />
        {t("install:updatepage.auto_close_cancelled")}
      </span>
    );
  }
  const urgent = seconds <= 3;
  return (
    <button
      type="button"
      data-testid="auto-close-chip"
      data-state="counting"
      onClick={onCancel}
      className={cn(
        CHIP,
        "group hover:bg-accent hover:text-accent-foreground",
        urgent ? "bg-warning-bg text-warning-fg animate-pulse" : "bg-muted text-muted-foreground"
      )}
    >
      <Timer className="size-3.5" />
      <span className="group-hover:hidden">{t("install:updatepage.auto_close", { count: seconds })}</span>
      <span className="hidden group-hover:inline">{t("install:updatepage.auto_close_cancel_hint")}</span>
    </button>
  );
}

/** 桌面端整页视图 */
export function DesktopView({ view }: { view: BatchUpdateViewProps }) {
  const { t } = useTranslation();
  const empty = view.updates.length === 0 && view.ignored.length === 0;
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex min-w-0 items-center gap-3">
          <PackageCheck className="size-[22px] shrink-0 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">{t("install:updatepage.title")}</h1>
          <HeaderStatus view={view} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant={view.recordExpired ? "default" : "outline"}
            size="sm"
            disabled={view.checking}
            onClick={view.onCheckNow}
          >
            <RefreshCw className={cn(view.checking && "animate-spin")} />
            {t("install:updatepage.main_header")}
          </Button>
          <AutoCloseChip
            seconds={view.autoClose}
            cancelled={view.autoCloseCancelled}
            onCancel={view.onCancelAutoClose}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-fg-secondary"
            aria-label={t("common:close")}
            onClick={() => window.close()}
          >
            <X />
          </Button>
        </div>
      </header>
      {view.checking && <TopProgressBar />}
      {view.recordExpired && <RecordExpiredNotice className="px-6" />}
      {view.batchProgress && (
        <BatchSummary progress={view.batchProgress} onOpenScriptList={view.onOpenScriptList} className="px-6" />
      )}
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

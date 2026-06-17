import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Ban,
  CircleCheck,
  CircleCheckBig,
  CloudOff,
  Database,
  Download,
  FileCode,
  FileX,
  Globe,
  Loader2,
  PackageOpen,
  Pencil,
  Rss,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { t } from "@App/locales/locales";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Switch } from "@App/pages/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import {
  importableScriptIds,
  importableSubscribeIds,
  type ImportOp,
  type ImportSource,
  type ScriptImportItem,
  type SubscribeImportItem,
} from "./logic";

/** install:importpage 命名空间下的翻译快捷方法 */
export const tk = (key: string, opt?: Record<string, unknown>): string => t(`install:importpage.${key}`, opt);

export type ImportPhase = "loading" | "invalid" | "error" | "empty" | "ready" | "importing" | "done";

/** 导入过程中单项的逐行状态 */
export type ImportItemStatus = "pending" | "importing" | "done" | "skipped";

/** 导入页视图(桌面/移动共用)所需的数据与回调 */
export interface ImportView {
  phase: ImportPhase;
  /** 备份文件名(工具栏来源 chip / 加载屏展示) */
  filename: string;
  /** 失败屏展示的错误信息 */
  errorMessage: string;
  scripts: ScriptImportItem[];
  subscribes: SubscribeImportItem[];
  selectedScripts: Set<string>;
  selectedSubscribes: Set<string>;
  /** 导入进行中/完成时,各项的逐行状态(id → status) */
  importStatus: Record<string, ImportItemStatus>;
  doneCount: number;
  totalCount: number;
  /** 完成屏统计(已勾选可导入项) */
  summary: { scripts: number; subscribes: number; values: number };
  onToggleScript: (id: string) => void;
  onToggleAllScripts: () => void;
  onToggleSubscribe: (id: string) => void;
  onToggleAllSubscribes: () => void;
  onSetEnabled: (id: string, enabled: boolean) => void;
  onImport: () => void;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onOpenScriptList: () => void;
}

const PILL = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const COL = {
  version: "w-[150px] shrink-0",
  source: "w-[150px] shrink-0",
  data: "w-24 shrink-0",
  status: "w-[92px] shrink-0",
  enable: "w-[72px] shrink-0",
};

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        {"S"}
      </div>
      <span className="text-[15px] font-semibold text-foreground">{"ScriptCat"}</span>
    </div>
  );
}

/** 顶部不确定进度条:导入进行中时贴在 TopBar 下方,不随内容滚动 */
export function TopProgressBar() {
  return (
    <div
      role="progressbar"
      aria-label={tk("context_importing")}
      className="h-[3px] w-full shrink-0 overflow-hidden bg-primary/15"
    >
      <div className="h-full w-1/3 animate-indeterminate-bar bg-primary" />
    </div>
  );
}

/** 外壳:吸顶 TopBar(含上下文 chip)+ 可选顶部进度条 + 滚动 ContentArea + 可选吸底 ActionBar */
export function ImportLayout({
  title,
  progress,
  actions,
  children,
}: {
  title: string;
  progress?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-testid="import-layout" className="flex h-screen flex-col bg-background text-foreground">
      <header
        data-testid="top-bar"
        className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-card/95 px-6 backdrop-blur"
      >
        <BrandMark />
        <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {title}
        </span>
      </header>
      {progress && <TopProgressBar />}
      <main data-testid="content-area" className="min-h-0 flex-1 overflow-y-auto scrollbar-custom px-6 py-7">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">{children}</div>
      </main>
      {actions && (
        <footer
          data-testid="action-bar"
          className="sticky bottom-0 z-10 flex min-h-[68px] shrink-0 items-center border-t border-border bg-card/95 px-6 py-3 backdrop-blur"
        >
          <div className="mx-auto w-full max-w-[1120px]">{actions}</div>
        </footer>
      )}
    </div>
  );
}

/** 脚本图标:有 @icon 显示图片,失败/缺省回退图标块;解析失败用红色 file-x 块 */
export function ScriptAvatar({ item, size = 32 }: { item: ScriptImportItem; size?: number }) {
  const [error, setError] = useState(false);
  const box = "flex shrink-0 items-center justify-center rounded-md";
  const style = { width: size, height: size };
  if (item.op === "error") {
    return (
      <span className={cn(box, "bg-muted")} style={style}>
        <FileX className="size-[18px] text-destructive" />
      </span>
    );
  }
  if (item.iconUrl && !error) {
    return (
      <img
        src={item.iconUrl}
        alt={item.name}
        onError={() => setError(true)}
        className="shrink-0 rounded-md object-cover"
        style={style}
      />
    );
  }
  return (
    <span className={cn(box, "bg-primary-light")} style={style}>
      <FileCode className="size-[18px] text-primary" />
    </span>
  );
}

const OP_CLASS: Record<ImportOp, string> = {
  add: "bg-success-bg text-success-fg",
  update: "bg-primary/10 text-primary",
  error: "bg-destructive/10 text-destructive",
};
const OP_KEY: Record<ImportOp, string> = { add: "op_add", update: "op_update", error: "op_error" };

export function OpBadge({ op }: { op: ImportOp }) {
  return <span className={cn(PILL, OP_CLASS[op])}>{tk(OP_KEY[op])}</span>;
}

export function VersionCell({ item }: { item: ScriptImportItem }) {
  if (item.op === "error") return <span className="text-muted-foreground">{"—"}</span>;
  if (item.op === "update") {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[13px]">
        <span className="text-muted-foreground line-through">{`v${item.oldVersion}`}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-primary">{`v${item.newVersion}`}</span>
      </div>
    );
  }
  return <span className="font-mono text-[13px] text-foreground">{`v${item.newVersion}`}</span>;
}

export function SourceCell({ source }: { source: ImportSource }) {
  if (source.kind === "none") return <span className="text-muted-foreground">{"—"}</span>;
  if (source.kind === "local") {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
        <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
        {tk("source_local")}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 cursor-default items-center gap-1.5 text-[13px] text-fg-secondary">
          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{source.host}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[320px] break-all">{source.full}</TooltipContent>
    </Tooltip>
  );
}

export function DataCell({ item }: { item: ScriptImportItem }) {
  if (item.op === "error" || (item.valueCount === 0 && !item.hasResources)) {
    return <span className="text-muted-foreground">{"—"}</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
      <Database className="size-3.5 shrink-0 text-muted-foreground" />
      <span>{item.valueCount > 0 ? tk("data_values", { count: item.valueCount }) : tk("data_resources")}</span>
    </span>
  );
}

const STATUS_ICON: Record<ImportItemStatus, ReactNode> = {
  pending: <Timer className="size-4 text-muted-foreground" />,
  importing: <Loader2 className="size-4 animate-spin text-primary" />,
  done: <CircleCheck className="size-4 text-success-fg" />,
  skipped: <Ban className="size-4 text-muted-foreground" />,
};

export function ImportStatusIcon({ status, id }: { status: ImportItemStatus; id: string }) {
  return (
    <span
      data-testid={`status-${status}-${id}`}
      className="flex items-center justify-center"
      aria-label={tk(`status_${status}`)}
    >
      {STATUS_ICON[status]}
    </span>
  );
}

/** 桌面端脚本行 */
function ScriptRow({ item, view }: { item: ScriptImportItem; view: ImportView }) {
  const inProgress = view.phase === "importing" || view.phase === "done";
  const status: ImportItemStatus = view.importStatus[item.id] ?? "pending";
  const dim = item.op === "error" ? "opacity-60" : "";
  return (
    <div className="flex h-14 items-center px-4 border-b border-border last:border-b-0 hover:bg-accent/40 transition-colors">
      <div className="flex w-9 shrink-0 items-center">
        {inProgress ? (
          <ImportStatusIcon status={item.importable ? status : "skipped"} id={item.id} />
        ) : (
          <Checkbox
            data-testid={`script-checkbox-${item.id}`}
            checked={view.selectedScripts.has(item.id)}
            disabled={!item.importable}
            onCheckedChange={() => view.onToggleScript(item.id)}
            className={item.op === "error" ? "opacity-45" : ""}
          />
        )}
      </div>
      <div className={cn("flex flex-1 items-center gap-2.5 min-w-0", dim)}>
        <ScriptAvatar item={item} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{item.name || tk("unknown_script")}</span>
          {item.author && <span className="truncate text-xs text-muted-foreground">{item.author}</span>}
        </div>
      </div>
      <div className={cn(COL.version, dim)}>
        <VersionCell item={item} />
      </div>
      <div className={cn(COL.source, dim)}>
        <SourceCell source={item.source} />
      </div>
      <div className={cn(COL.data, dim)}>
        <DataCell item={item} />
      </div>
      <div className={cn(COL.status, dim)}>
        <OpBadge op={item.op} />
      </div>
      <div className={cn(COL.enable, "flex justify-end")}>
        {item.op === "error" ? (
          <span className="text-muted-foreground">{"—"}</span>
        ) : (
          <Switch
            data-testid={`enable-switch-${item.id}`}
            size="sm"
            checked={item.enabled}
            disabled={inProgress}
            onCheckedChange={(v) => view.onSetEnabled(item.id, v)}
          />
        )}
      </div>
    </div>
  );
}

function ScriptTable({ view }: { view: ImportView }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex h-10 items-center px-4 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
        <div className="w-9 shrink-0" />
        <div className="flex-1">{tk("col_script")}</div>
        <div className={COL.version}>{tk("col_version")}</div>
        <div className={COL.source}>{tk("col_source")}</div>
        <div className={COL.data}>{tk("col_data")}</div>
        <div className={COL.status}>{tk("col_status")}</div>
        <div className={cn(COL.enable, "text-right")}>{tk("col_enabled")}</div>
      </div>
      {view.scripts.map((item) => (
        <ScriptRow key={item.id} item={item} view={view} />
      ))}
    </div>
  );
}

/** 订阅行 */
function SubscribeRow({ item, view }: { item: SubscribeImportItem; view: ImportView }) {
  const inProgress = view.phase === "importing" || view.phase === "done";
  const status: ImportItemStatus = view.importStatus[item.id] ?? "pending";
  const dim = item.op === "error" ? "opacity-60" : "";
  return (
    <div className="flex h-[54px] items-center px-4 border-b border-border last:border-b-0 hover:bg-accent/40 transition-colors">
      <div className="flex w-9 shrink-0 items-center">
        {inProgress ? (
          <ImportStatusIcon status={item.importable ? status : "skipped"} id={item.id} />
        ) : (
          <Checkbox
            data-testid={`sub-checkbox-${item.id}`}
            checked={view.selectedSubscribes.has(item.id)}
            disabled={!item.importable}
            onCheckedChange={() => view.onToggleSubscribe(item.id)}
            className={item.op === "error" ? "opacity-45" : ""}
          />
        )}
      </div>
      <div className={cn("flex flex-1 items-center gap-2.5 min-w-0", dim)}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-light">
          <Rss className="size-4 text-primary" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{item.name || tk("unknown_script")}</span>
          {item.url && <span className="truncate font-mono text-xs text-muted-foreground">{item.url}</span>}
        </div>
      </div>
      <div className={cn(COL.status, dim)}>
        <OpBadge op={item.op} />
      </div>
    </div>
  );
}

function SubscribeSection({ view }: { view: ImportView }) {
  if (view.subscribes.length === 0) return null;
  const importable = importableSubscribeIds(view.subscribes);
  const selectedCount = importable.filter((id) => view.selectedSubscribes.has(id)).length;
  const allSelected = importable.length > 0 && selectedCount === importable.length;
  const reviewing = view.phase === "ready";
  return (
    <div data-testid="subscribe-section" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Rss className="size-[18px] text-fg-secondary" />
          <span className="text-sm font-medium text-foreground">{tk("subscribe_section")}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {view.subscribes.length}
          </span>
        </div>
        {reviewing && (
          <div className="flex items-center gap-2.5">
            <Checkbox
              data-testid="toggle-all-subscribes"
              checked={allSelected}
              onCheckedChange={view.onToggleAllSubscribes}
            />
            <span className="text-[13px] text-muted-foreground">
              {tk("selected_count", { selected: selectedCount, total: importable.length })}
            </span>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {view.subscribes.map((item) => (
          <SubscribeRow key={item.id} item={item} view={view} />
        ))}
      </div>
    </div>
  );
}

function ImportToolbar({ view }: { view: ImportView }) {
  const importable = importableScriptIds(view.scripts);
  const selectedCount = importable.filter((id) => view.selectedScripts.has(id)).length;
  const allSelected = importable.length > 0 && selectedCount === importable.length;
  const unimportable = view.scripts.length - importable.length;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Checkbox data-testid="toggle-all-scripts" checked={allSelected} onCheckedChange={view.onToggleAllScripts} />
        <span className="text-sm font-medium text-foreground">
          {tk("selected_count", { selected: selectedCount, total: importable.length })}
        </span>
        {unimportable > 0 && (
          <>
            <span className="text-muted-foreground">{"·"}</span>
            <span className="text-[13px] text-destructive">{tk("unimportable_count", { count: unimportable })}</span>
          </>
        )}
      </div>
      <span className="inline-flex max-w-[420px] items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <span className="truncate font-mono">{view.filename}</span>
      </span>
    </div>
  );
}

function ImportingToolbar({ view }: { view: ImportView }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      <span className="font-medium text-foreground">
        {tk("importing_progress", { done: view.doneCount, total: view.totalCount })}
      </span>
      <span className="text-muted-foreground">{"·"}</span>
      <span className="text-[13px] text-muted-foreground">{tk("importing_hint")}</span>
    </div>
  );
}

function ReadyActions({ view }: { view: ImportView }) {
  const total = view.selectedScripts.size + view.selectedSubscribes.size;
  return (
    <div className="flex items-center gap-4">
      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <ShieldCheck className="size-4 shrink-0" />
        {tk("trust_hint")}
      </span>
      <div className="ml-auto flex items-center gap-2.5">
        <Button variant="outline" onClick={view.onClose}>
          {t("common:close")}
        </Button>
        <Button data-testid="import-btn" disabled={total === 0} onClick={view.onImport}>
          <Download />
          {tk("import_selected", { count: total })}
        </Button>
      </div>
    </div>
  );
}

function ImportingActions({ view }: { view: ImportView }) {
  return (
    <div className="flex items-center gap-3">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      <span className="text-xs text-muted-foreground">{tk("importing_actionbar_hint")}</span>
      <span className="ml-auto font-mono text-[13px] text-fg-secondary">{`${view.doneCount} / ${view.totalCount}`}</span>
      <Button variant="outline" onClick={view.onCancel}>
        {tk("cancel")}
      </Button>
      <Button disabled>{tk("importing_button")}</Button>
    </div>
  );
}

function StatChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[13px] text-fg-secondary">
      {children}
    </span>
  );
}

function CenteredState({ children, testid }: { children: ReactNode; testid: string }) {
  return (
    <div data-testid={testid} className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      {children}
    </div>
  );
}

export function ImportLoading({ filename }: { filename: string }) {
  return (
    <CenteredState testid="import-loading">
      <Loader2 className="size-12 animate-spin text-primary" />
      <div className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold text-foreground">{tk("loading_title")}</span>
        <span className="text-[13px] text-muted-foreground">{tk("loading_desc")}</span>
      </div>
      {filename && <span className="font-mono text-xs text-muted-foreground">{filename}</span>}
      <div className="h-1 w-56 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-indeterminate-bar bg-primary" />
      </div>
    </CenteredState>
  );
}

export function ImportErrorScreen({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry?: () => void;
  onClose: () => void;
}) {
  return (
    <CenteredState testid="import-error">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <CloudOff className="size-7 text-destructive" />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold text-foreground">{tk("error_title")}</span>
        <span className="text-[13px] text-muted-foreground">{message}</span>
      </div>
      <div className="flex gap-3">
        {onRetry && (
          <Button data-testid="retry-btn" onClick={onRetry} className="min-w-24">
            {tk("retry")}
          </Button>
        )}
        <Button variant="outline" onClick={onClose} className="min-w-24">
          {t("common:close")}
        </Button>
      </div>
    </CenteredState>
  );
}

export function EmptyBackup({ onClose }: { onClose: () => void }) {
  return (
    <CenteredState testid="import-empty">
      <span className="flex size-[72px] items-center justify-center rounded-full bg-muted">
        <PackageOpen className="size-9 text-muted-foreground" />
      </span>
      <div className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold text-foreground">{tk("empty_title")}</span>
        <span className="text-[13px] text-muted-foreground">{tk("empty_desc")}</span>
      </div>
      <Button variant="outline" onClick={onClose} className="min-w-24">
        {t("common:close")}
      </Button>
    </CenteredState>
  );
}

export function ImportComplete({ view }: { view: ImportView }) {
  const { summary } = view;
  return (
    <CenteredState testid="import-complete">
      <span className="flex size-[72px] items-center justify-center rounded-full bg-success-bg">
        <CircleCheckBig className="size-9 text-success-fg" />
      </span>
      <div className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold text-foreground">{tk("done_title")}</span>
        <span className="text-[13px] text-muted-foreground">{tk("done_desc")}</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <StatChip>{tk("done_stat_scripts", { count: summary.scripts })}</StatChip>
        {summary.subscribes > 0 && <StatChip>{tk("done_stat_subscribes", { count: summary.subscribes })}</StatChip>}
        {summary.values > 0 && <StatChip>{tk("done_stat_values", { count: summary.values })}</StatChip>}
      </div>
      <div className="flex gap-3">
        <Button data-testid="view-scripts-btn" onClick={view.onOpenScriptList} className="min-w-24">
          {tk("view_scripts")}
        </Button>
        <Button variant="outline" onClick={view.onClose} className="min-w-24">
          {t("common:close")}
        </Button>
      </div>
    </CenteredState>
  );
}

/** TopBar 上下文 chip 文案 */
export function contextTitle(phase: ImportPhase): string {
  if (phase === "importing") return tk("context_importing");
  if (phase === "done") return tk("context_done");
  return tk("context_review");
}

/** 桌面端整页视图 */
export function DesktopView({ view }: { view: ImportView }) {
  const title = contextTitle(view.phase);

  if (view.phase === "loading") {
    return (
      <ImportLayout title={title}>
        <ImportLoading filename={view.filename} />
      </ImportLayout>
    );
  }
  if (view.phase === "invalid") {
    return (
      <ImportLayout title={title}>
        <ImportErrorScreen message={tk("invalid_desc")} onClose={view.onClose} />
      </ImportLayout>
    );
  }
  if (view.phase === "error") {
    return (
      <ImportLayout title={title}>
        <ImportErrorScreen message={view.errorMessage} onRetry={view.onRetry} onClose={view.onClose} />
      </ImportLayout>
    );
  }
  if (view.phase === "empty") {
    return (
      <ImportLayout title={title}>
        <EmptyBackup onClose={view.onClose} />
      </ImportLayout>
    );
  }
  if (view.phase === "done") {
    return (
      <ImportLayout title={title}>
        <ImportComplete view={view} />
      </ImportLayout>
    );
  }

  // ready / importing
  const importing = view.phase === "importing";
  return (
    <ImportLayout
      title={title}
      progress={importing}
      actions={importing ? <ImportingActions view={view} /> : <ReadyActions view={view} />}
    >
      {importing ? <ImportingToolbar view={view} /> : <ImportToolbar view={view} />}
      <ScriptTable view={view} />
      <SubscribeSection view={view} />
    </ImportLayout>
  );
}

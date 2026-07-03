import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Ban,
  CircleCheck,
  CircleX,
  CloudOff,
  Database,
  Download,
  FileArchive,
  FileCode,
  FileX,
  Globe,
  List,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  ShieldCheck,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { cn } from "@App/pkg/utils/cn";
import { Button } from "@App/pages/components/ui/button";
import { Progress } from "@App/pages/components/ui/progress";
import { StateScreen } from "@App/pages/components/ui/state-screen";
import { DataPanel } from "@App/pages/components/ui/data-panel";
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
  onImport: () => void | Promise<void>;
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
      <img src={chrome.runtime.getURL("assets/logo.png")} alt="ScriptCat" className="size-6 shrink-0" />
      <span className="text-[15px] font-semibold text-foreground">{"ScriptCat"}</span>
    </div>
  );
}

/** 顶部进度条:导入进行中时贴在 TopBar 下方,不随内容滚动;按 done/total 确定填充 */
export function TopProgressBar({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation();
  return (
    <Progress
      variant="top"
      aria-label={t("install:importpage.context_importing")}
      value={done}
      max={total}
      className="h-[3px] bg-primary-light"
    />
  );
}

/** TopBar 上下文 chip:随阶段切换语义色 + 图标(审阅/解析/导入/完成/失败) */
const CHIP: Record<ImportPhase, { cls: string; icon: ReactNode; key: string }> = {
  ready: { cls: "bg-muted text-fg-secondary", icon: <Download className="size-3.5 shrink-0" />, key: "context_review" },
  empty: { cls: "bg-muted text-fg-secondary", icon: <Download className="size-3.5 shrink-0" />, key: "context_review" },
  loading: {
    cls: "bg-primary-light text-primary",
    icon: <Loader2 className="size-3.5 shrink-0 animate-spin" />,
    key: "context_review",
  },
  importing: {
    cls: "bg-primary-light text-primary",
    icon: <Loader2 className="size-3.5 shrink-0 animate-spin" />,
    key: "context_importing",
  },
  done: {
    cls: "bg-success-bg text-success-fg",
    icon: <CircleCheck className="size-3.5 shrink-0" />,
    key: "context_done",
  },
  error: {
    cls: "bg-destructive/10 text-destructive",
    icon: <CircleX className="size-3.5 shrink-0" />,
    key: "context_review",
  },
  invalid: {
    cls: "bg-destructive/10 text-destructive",
    icon: <CircleX className="size-3.5 shrink-0" />,
    key: "context_review",
  },
};

function ContextChip({ phase }: { phase: ImportPhase }) {
  const { t } = useTranslation();
  const c = CHIP[phase];
  return (
    <span
      className={cn("ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", c.cls)}
    >
      {c.icon}
      {t(`install:importpage.${c.key}`)}
    </span>
  );
}

/** 外壳:吸顶 TopBar(含上下文 chip)+ 可选顶部进度条 + 滚动 ContentArea + 可选吸底 ActionBar */
export function ImportLayout({
  phase,
  progress,
  actions,
  children,
}: {
  phase: ImportPhase;
  progress?: { done: number; total: number };
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
        <ContextChip phase={phase} />
      </header>
      {progress && <TopProgressBar done={progress.done} total={progress.total} />}
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
export function ScriptAvatar({ item, size = 30 }: { item: ScriptImportItem; size?: number }) {
  const [error, setError] = useState(false);
  const box = "flex shrink-0 items-center justify-center rounded-lg";
  const style = { width: size, height: size };
  if (item.op === "error") {
    return (
      <span className={cn(box, "bg-muted")} style={style}>
        <FileX className="size-4 text-destructive" />
      </span>
    );
  }
  if (item.iconUrl && !error) {
    return (
      <img
        src={item.iconUrl}
        alt={item.name}
        onError={() => setError(true)}
        className="shrink-0 rounded-lg object-cover"
        style={style}
      />
    );
  }
  return (
    <span className={cn(box, "bg-primary-light")} style={style}>
      <FileCode className="size-4 text-primary" />
    </span>
  );
}

const OP_CLASS: Record<ImportOp, string> = {
  add: "bg-success-bg text-success-fg",
  update: "bg-primary-light text-primary",
  error: "bg-destructive/10 text-destructive",
};
const OP_KEY: Record<ImportOp, string> = { add: "op_add", update: "op_update", error: "op_error" };
const OP_ICON: Record<ImportOp, ReactNode> = {
  add: <Plus className="size-3 shrink-0" />,
  update: <RefreshCw className="size-3 shrink-0" />,
  error: <TriangleAlert className="size-3 shrink-0" />,
};

export function OpBadge({ op }: { op: ImportOp }) {
  const { t } = useTranslation();
  return (
    <span className={cn(PILL, OP_CLASS[op])}>
      {OP_ICON[op]}
      {t(`install:importpage.${OP_KEY[op]}`)}
    </span>
  );
}

function VersionCell({ item }: { item: ScriptImportItem }) {
  if (item.op === "error") return <span className="text-muted-foreground">{"—"}</span>;
  if (item.op === "update") {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[13px]">
        <span className="text-muted-foreground">{`v${item.oldVersion}`}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-primary">{`v${item.newVersion}`}</span>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
      {`v${item.newVersion}`}
    </span>
  );
}

export function SourceCell({ source }: { source: ImportSource }) {
  const { t } = useTranslation();
  if (source.kind === "none") return <span className="text-muted-foreground">{"—"}</span>;
  if (source.kind === "local") {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
        <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
        {t("install:importpage.source_local")}
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
  const { t } = useTranslation();
  if (item.op === "error" || (item.valueCount === 0 && !item.hasResources)) {
    return <span className="text-muted-foreground">{"—"}</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
      <Database className="size-3.5 shrink-0 text-muted-foreground" />
      <span>
        {item.valueCount > 0
          ? t("install:importpage.data_values", { count: item.valueCount })
          : t("install:importpage.data_resources")}
      </span>
    </span>
  );
}

const STATUS_ICON: Record<ImportItemStatus, ReactNode> = {
  pending: <Timer className="size-4 text-muted-foreground" />,
  importing: <Loader2 className="size-4 animate-spin text-primary" />,
  done: <CircleCheck className="size-4 text-success" />,
  skipped: <Ban className="size-4 text-muted-foreground" />,
};

export function ImportStatusIcon({ status, id }: { status: ImportItemStatus; id: string }) {
  const { t } = useTranslation();
  return (
    <span
      data-testid={`status-${status}-${id}`}
      className="flex items-center justify-center"
      aria-label={t(`install:importpage.status_${status}`)}
    >
      {STATUS_ICON[status]}
    </span>
  );
}

/** 桌面端脚本行 */
function ScriptRow({ item, view }: { item: ScriptImportItem; view: ImportView }) {
  const { t } = useTranslation();
  const inProgress = view.phase === "importing" || view.phase === "done";
  const status: ImportItemStatus = view.importStatus[item.id] ?? "pending";
  const dim = item.op === "error" ? "opacity-60" : "";
  return (
    <div className="flex h-14 items-center gap-3.5 px-4 border-b border-border last:border-b-0 hover:bg-accent/40 transition-colors">
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
          <span className="truncate text-sm font-semibold text-foreground">
            {item.name || t("install:importpage.unknown_script")}
          </span>
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
      <div className={cn(COL.enable, "flex justify-center")}>
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
  const { t } = useTranslation();
  return (
    <DataPanel className="rounded-lg">
      <div className="flex h-10 items-center gap-3.5 px-4 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
        <div className="w-9 shrink-0" />
        <div className="flex-1">{t("install:importpage.col_script")}</div>
        <div className={COL.version}>{t("install:importpage.col_version")}</div>
        <div className={COL.source}>{t("install:importpage.col_source")}</div>
        <div className={COL.data}>{t("install:importpage.col_data")}</div>
        <div className={COL.status}>{t("install:importpage.col_status")}</div>
        <div className={cn(COL.enable, "text-center")}>{t("install:importpage.col_enabled")}</div>
      </div>
      {view.scripts.map((item) => (
        <ScriptRow key={item.id} item={item} view={view} />
      ))}
    </DataPanel>
  );
}

/** 订阅行 */
function SubscribeRow({ item, view }: { item: SubscribeImportItem; view: ImportView }) {
  const { t } = useTranslation();
  const inProgress = view.phase === "importing" || view.phase === "done";
  const status: ImportItemStatus = view.importStatus[item.id] ?? "pending";
  const dim = item.op === "error" ? "opacity-60" : "";
  return (
    <div className="flex h-[54px] items-center gap-3.5 px-4 border-b border-border last:border-b-0 hover:bg-accent/40 transition-colors">
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
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-primary-light">
          <Rss className="size-4 text-primary" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">
            {item.name || t("install:importpage.unknown_script")}
          </span>
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
  const { t } = useTranslation();
  if (view.subscribes.length === 0) return null;
  const importable = importableSubscribeIds(view.subscribes);
  const selectedCount = importable.filter((id) => view.selectedSubscribes.has(id)).length;
  const allSelected = importable.length > 0 && selectedCount === importable.length;
  const reviewing = view.phase === "ready";
  return (
    <div data-testid="subscribe-section" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Rss className="size-4 text-primary" />
          <span className="text-[15px] font-semibold text-foreground">{t("install:importpage.subscribe_section")}</span>
          <span className="text-[13px] text-muted-foreground">{view.subscribes.length}</span>
        </div>
        {reviewing && (
          <div className="flex items-center gap-2.5">
            <Checkbox
              data-testid="toggle-all-subscribes"
              checked={allSelected}
              onCheckedChange={view.onToggleAllSubscribes}
            />
            <span className="text-[13px] text-fg-secondary">
              {t("install:importpage.selected_count", { selected: selectedCount, total: importable.length })}
            </span>
          </div>
        )}
      </div>
      <DataPanel className="rounded-lg">
        {view.subscribes.map((item) => (
          <SubscribeRow key={item.id} item={item} view={view} />
        ))}
      </DataPanel>
    </div>
  );
}

/** 备份来源 chip 文案:文件名 · N 脚本 · M 订阅 */
function backupSourceLabel(view: ImportView, t: TFunction): string {
  const parts = [view.filename, t("install:importpage.count_scripts", { count: view.scripts.length })];
  if (view.subscribes.length > 0)
    parts.push(t("install:importpage.count_subscribes", { count: view.subscribes.length }));
  return parts.filter(Boolean).join(" · ");
}

function ImportToolbar({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  const importable = importableScriptIds(view.scripts);
  const selectedCount = importable.filter((id) => view.selectedScripts.has(id)).length;
  const allSelected = importable.length > 0 && selectedCount === importable.length;
  const unimportable = view.scripts.length - importable.length;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Checkbox data-testid="toggle-all-scripts" checked={allSelected} onCheckedChange={view.onToggleAllScripts} />
        <span className="text-sm font-medium text-foreground">
          {t("install:importpage.selected_count", { selected: selectedCount, total: importable.length })}
        </span>
        {unimportable > 0 && (
          <>
            <span className="text-muted-foreground">{"·"}</span>
            <span className="text-[13px] text-muted-foreground">
              {t("install:importpage.unimportable_count", { count: unimportable })}
            </span>
          </>
        )}
      </div>
      <span className="inline-flex max-w-[460px] items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-fg-secondary">
        <FileArchive className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{backupSourceLabel(view, t)}</span>
      </span>
    </div>
  );
}

function ImportingToolbar({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-sm">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      <span className="font-medium text-foreground">
        {t("install:importpage.importing_progress", { done: view.doneCount, total: view.totalCount })}
      </span>
      <span className="text-muted-foreground">{"·"}</span>
      <span className="text-[13px] text-muted-foreground">{t("install:importpage.importing_hint")}</span>
    </div>
  );
}

function ReadyActions({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  const total = view.selectedScripts.size + view.selectedSubscribes.size;
  return (
    <div className="flex items-center gap-4">
      <span className="hidden items-center gap-1.5 text-[13px] text-muted-foreground sm:flex">
        <ShieldCheck className="size-4 shrink-0" />
        {t("install:importpage.trust_hint")}
      </span>
      <div className="ml-auto flex items-center gap-2.5">
        <Button variant="outline" onClick={view.onClose}>
          {t("common:close")}
        </Button>
        <Button data-testid="import-btn" disabled={total === 0} onClick={view.onImport}>
          <Download />
          {t("install:importpage.import_selected", { count: total })}
        </Button>
      </div>
    </div>
  );
}

function ImportingActions({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      <span className="text-[13px] text-muted-foreground">{t("install:importpage.importing_actionbar_hint")}</span>
      <span className="ml-auto font-mono text-[13px] font-semibold text-fg-secondary">{`${view.doneCount} / ${view.totalCount}`}</span>
      <Button variant="outline" onClick={view.onCancel}>
        {t("install:importpage.cancel")}
      </Button>
      <Button disabled>
        <Loader2 className="animate-spin" />
        {t("install:importpage.importing_button")}
      </Button>
    </div>
  );
}

function StatChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[13px] font-medium text-foreground">
      {icon}
      {children}
    </span>
  );
}

export function ImportLoading({ filename }: { filename: string }) {
  const { t } = useTranslation();
  return (
    <StateScreen
      data-testid="import-loading"
      className="min-h-[60vh]"
      icon={Loader2}
      iconClassName="animate-spin"
      tone="primary"
      title={t("install:importpage.loading_title")}
      description={t("install:importpage.loading_desc")}
      progress={
        <>
          <Progress aria-label={t("install:importpage.loading_title")} indeterminate className="w-[300px]" />
          {filename && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs text-fg-secondary">
              <FileArchive className="size-3.5 shrink-0 text-muted-foreground" />
              {filename}
            </span>
          )}
        </>
      }
    />
  );
}

export function ImportErrorScreen({
  desc,
  detail,
  onRetry,
  onClose,
}: {
  desc: string;
  detail?: string;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <StateScreen
      data-testid="import-error"
      className="min-h-[60vh]"
      icon={CloudOff}
      tone="error"
      title={t("install:importpage.error_title")}
      description={desc}
      detail={detail}
      detailTestId={detail ? "error-detail-box" : undefined}
      detailClassName="w-[440px] max-w-full"
      action={
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="min-w-24">
            {t("common:close")}
          </Button>
          {onRetry && (
            <Button data-testid="retry-btn" onClick={onRetry} className="min-w-24">
              <RefreshCw />
              {t("install:importpage.retry")}
            </Button>
          )}
        </div>
      }
    />
  );
}

export function EmptyBackup({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <StateScreen
      data-testid="import-empty"
      className="min-h-[60vh]"
      icon={PackageOpen}
      title={t("install:importpage.empty_title")}
      description={t("install:importpage.empty_desc")}
      action={
        <Button onClick={onClose} className="min-w-24">
          {t("common:close")}
        </Button>
      }
    />
  );
}

export function ImportComplete({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  const { summary } = view;
  return (
    <StateScreen
      data-testid="import-complete"
      className="min-h-[60vh]"
      icon={CircleCheck}
      tone="success"
      title={t("install:importpage.done_title")}
      description={t("install:importpage.done_desc")}
      progress={
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <StatChip icon={<FileCode className="size-3.5 shrink-0 text-fg-secondary" />}>
            {t("install:importpage.done_stat_scripts", { count: summary.scripts })}
          </StatChip>
          {summary.subscribes > 0 && (
            <StatChip icon={<Rss className="size-3.5 shrink-0 text-fg-secondary" />}>
              {t("install:importpage.done_stat_subscribes", { count: summary.subscribes })}
            </StatChip>
          )}
          {summary.values > 0 && (
            <StatChip icon={<Database className="size-3.5 shrink-0 text-fg-secondary" />}>
              {t("install:importpage.done_stat_values", { count: summary.values })}
            </StatChip>
          )}
        </div>
      }
      action={
        <div className="flex gap-3">
          <Button variant="outline" onClick={view.onClose} className="min-w-24">
            {t("common:close")}
          </Button>
          <Button data-testid="view-scripts-btn" onClick={view.onOpenScriptList} className="min-w-24">
            <List />
            {t("install:importpage.view_scripts")}
          </Button>
        </div>
      }
    />
  );
}

/** 桌面端整页视图 */
export function DesktopView({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  if (view.phase === "loading") {
    return (
      <ImportLayout phase={view.phase}>
        <ImportLoading filename={view.filename} />
      </ImportLayout>
    );
  }
  if (view.phase === "invalid") {
    return (
      <ImportLayout phase={view.phase}>
        <ImportErrorScreen desc={t("install:importpage.invalid_desc")} onClose={view.onClose} />
      </ImportLayout>
    );
  }
  if (view.phase === "error") {
    return (
      <ImportLayout phase={view.phase}>
        <ImportErrorScreen
          desc={t("install:importpage.error_desc")}
          detail={view.errorMessage}
          onRetry={view.onRetry}
          onClose={view.onClose}
        />
      </ImportLayout>
    );
  }
  if (view.phase === "empty") {
    return (
      <ImportLayout phase={view.phase}>
        <EmptyBackup onClose={view.onClose} />
      </ImportLayout>
    );
  }
  if (view.phase === "done") {
    return (
      <ImportLayout phase={view.phase}>
        <ImportComplete view={view} />
      </ImportLayout>
    );
  }

  // ready / importing
  const importing = view.phase === "importing";
  return (
    <ImportLayout
      phase={view.phase}
      progress={importing ? { done: view.doneCount, total: view.totalCount } : undefined}
      actions={importing ? <ImportingActions view={view} /> : <ReadyActions view={view} />}
    >
      {importing ? <ImportingToolbar view={view} /> : <ImportToolbar view={view} />}
      <ScriptTable view={view} />
      <SubscribeSection view={view} />
    </ImportLayout>
  );
}

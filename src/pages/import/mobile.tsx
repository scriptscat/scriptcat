import { type ReactNode } from "react";
import { Download, FileText, Loader2, Rss } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Switch } from "@App/pages/components/ui/switch";
import { importableScriptIds, importableSubscribeIds, type ScriptImportItem, type SubscribeImportItem } from "./logic";
import {
  contextTitle,
  DataCell,
  EmptyBackup,
  ImportComplete,
  ImportErrorScreen,
  ImportLoading,
  ImportStatusIcon,
  OpBadge,
  ScriptAvatar,
  SourceCell,
  TopProgressBar,
  VersionCell,
  tk,
  type ImportItemStatus,
  type ImportView,
} from "./components";

function MobileHeader({ title }: { title: string }) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border bg-card px-4">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        {"S"}
      </div>
      <span className="text-base font-semibold text-foreground">{tk("title")}</span>
      <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        {title}
      </span>
    </header>
  );
}

/** 移动端状态屏外壳:头部 + 居中正文(复用桌面的居中状态组件) */
function MobileStateShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <MobileHeader title={title} />
      <div className="flex flex-1 items-center justify-center overflow-auto px-5">{children}</div>
    </div>
  );
}

/** 移动端脚本卡 */
function MobileScriptCard({ item, view }: { item: ScriptImportItem; view: ImportView }) {
  const inProgress = view.phase === "importing" || view.phase === "done";
  const status: ImportItemStatus = view.importStatus[item.id] ?? "pending";
  const dim = item.op === "error" ? "opacity-60" : "";
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-center gap-2.5">
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
        <span className={cn("flex min-w-0 flex-1 items-center gap-2.5", dim)}>
          <ScriptAvatar item={item} size={28} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{item.name || tk("unknown_script")}</span>
            {item.author && <span className="truncate text-xs text-muted-foreground">{item.author}</span>}
          </span>
        </span>
        <OpBadge op={item.op} />
      </div>
      <div className={cn("flex items-center gap-2 overflow-hidden text-[13px]", dim)}>
        <VersionCell item={item} />
        <span className="text-muted-foreground">{"·"}</span>
        <SourceCell source={item.source} />
        <span className="text-muted-foreground">{"·"}</span>
        <DataCell item={item} />
      </div>
      <div className="flex items-center border-t border-border pt-2.5">
        {item.op === "error" ? (
          <span className="text-[13px] text-destructive">{tk("row_error")}</span>
        ) : (
          <>
            <span className="text-[13px] text-fg-secondary">{tk("enable_after_import")}</span>
            <div className="flex-1" />
            <Switch
              data-testid={`enable-switch-${item.id}`}
              size="sm"
              checked={item.enabled}
              disabled={inProgress}
              onCheckedChange={(v) => view.onSetEnabled(item.id, v)}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** 移动端订阅卡 */
function MobileSubscribeCard({ item, view }: { item: SubscribeImportItem; view: ImportView }) {
  const inProgress = view.phase === "importing" || view.phase === "done";
  const status: ImportItemStatus = view.importStatus[item.id] ?? "pending";
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3.5">
      {inProgress ? (
        <ImportStatusIcon status={item.importable ? status : "skipped"} id={item.id} />
      ) : (
        <Checkbox
          data-testid={`sub-checkbox-${item.id}`}
          checked={view.selectedSubscribes.has(item.id)}
          disabled={!item.importable}
          onCheckedChange={() => view.onToggleSubscribe(item.id)}
        />
      )}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-light">
        <Rss className="size-4 text-primary" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{item.name || tk("unknown_script")}</span>
        {item.url && <span className="truncate font-mono text-xs text-muted-foreground">{item.url}</span>}
      </span>
      <OpBadge op={item.op} />
    </div>
  );
}

function MobileSubscribeSection({ view }: { view: ImportView }) {
  if (view.subscribes.length === 0) return null;
  const importable = importableSubscribeIds(view.subscribes);
  const selectedCount = importable.filter((id) => view.selectedSubscribes.has(id)).length;
  const allSelected = importable.length > 0 && selectedCount === importable.length;
  const reviewing = view.phase === "ready";
  return (
    <div data-testid="subscribe-section" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1 pt-1.5">
        <div className="flex items-center gap-2">
          <Rss className="size-[18px] text-fg-secondary" />
          <span className="text-sm font-medium text-foreground">{tk("subscribe_section")}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {view.subscribes.length}
          </span>
        </div>
        {reviewing && (
          <Checkbox
            data-testid="toggle-all-subscribes"
            checked={allSelected}
            onCheckedChange={view.onToggleAllSubscribes}
          />
        )}
      </div>
      {view.subscribes.map((item) => (
        <MobileSubscribeCard key={item.id} item={item} view={view} />
      ))}
    </div>
  );
}

function MobileToolbar({ view }: { view: ImportView }) {
  const importable = importableScriptIds(view.scripts);
  const selectedCount = importable.filter((id) => view.selectedScripts.has(id)).length;
  const allSelected = importable.length > 0 && selectedCount === importable.length;
  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border bg-card px-4">
      <Checkbox data-testid="toggle-all-scripts" checked={allSelected} onCheckedChange={view.onToggleAllScripts} />
      <span className="text-[13px] font-medium text-foreground">
        {tk("selected_count", { selected: selectedCount, total: importable.length })}
      </span>
      <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileText className="size-3.5" />
        <span className="max-w-[140px] truncate font-mono">{view.filename}</span>
      </span>
    </div>
  );
}

function MobileImportingBar({ view }: { view: ImportView }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-4 text-[13px]">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      <span className="truncate font-medium text-foreground">
        {tk("importing_progress", { done: view.doneCount, total: view.totalCount })}
      </span>
    </div>
  );
}

function MobileActions({ view }: { view: ImportView }) {
  const importing = view.phase === "importing";
  const total = view.selectedScripts.size + view.selectedSubscribes.size;
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-4 pt-2.5 pb-6">
      {importing ? (
        <>
          <Button variant="outline" className="flex-1" onClick={view.onCancel}>
            {tk("cancel")}
          </Button>
          <Button className="flex-1" disabled>
            {tk("importing_button")}
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" className="flex-1" onClick={view.onClose}>
            {tk("cancel")}
          </Button>
          <Button data-testid="import-btn" className="flex-1" disabled={total === 0} onClick={view.onImport}>
            <Download />
            {tk("import_selected", { count: total })}
          </Button>
        </>
      )}
    </div>
  );
}

/** 移动端整页视图 */
export function MobileView({ view }: { view: ImportView }) {
  const title = contextTitle(view.phase);

  if (view.phase === "loading") {
    return (
      <MobileStateShell title={title}>
        <ImportLoading filename={view.filename} />
      </MobileStateShell>
    );
  }
  if (view.phase === "invalid") {
    return (
      <MobileStateShell title={title}>
        <ImportErrorScreen message={tk("invalid_desc")} onClose={view.onClose} />
      </MobileStateShell>
    );
  }
  if (view.phase === "error") {
    return (
      <MobileStateShell title={title}>
        <ImportErrorScreen message={view.errorMessage} onRetry={view.onRetry} onClose={view.onClose} />
      </MobileStateShell>
    );
  }
  if (view.phase === "empty") {
    return (
      <MobileStateShell title={title}>
        <EmptyBackup onClose={view.onClose} />
      </MobileStateShell>
    );
  }
  if (view.phase === "done") {
    return (
      <MobileStateShell title={title}>
        <ImportComplete view={view} />
      </MobileStateShell>
    );
  }

  const importing = view.phase === "importing";
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <MobileHeader title={title} />
      {importing && <TopProgressBar />}
      {importing ? <MobileImportingBar view={view} /> : <MobileToolbar view={view} />}
      <div className="flex flex-1 flex-col gap-2.5 overflow-auto scrollbar-custom p-4">
        {view.scripts.map((item) => (
          <MobileScriptCard key={item.id} item={item} view={view} />
        ))}
        <MobileSubscribeSection view={view} />
      </div>
      <MobileActions view={view} />
    </div>
  );
}

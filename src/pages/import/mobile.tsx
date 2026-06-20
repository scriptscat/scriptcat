import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, Rss, ShieldCheck, Tag, TriangleAlert, X } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Switch } from "@App/pages/components/ui/switch";
import { Surface } from "@App/pages/components/ui/surface";
import { importableScriptIds, importableSubscribeIds, type ScriptImportItem, type SubscribeImportItem } from "./logic";
import {
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
  type ImportItemStatus,
  type ImportView,
} from "./components";

/** 移动端版本文案:更新 = 旧 → 新;新增 = 单版本;错误 = — */
function mobileVersionText(item: ScriptImportItem): string {
  if (item.op === "error") return "—";
  if (item.op === "update") return `v${item.oldVersion} → v${item.newVersion}`;
  return `v${item.newVersion}`;
}

function MobileHeader({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border bg-card px-4">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        {"S"}
      </div>
      <span className="text-base font-semibold text-foreground">{t("install:importpage.title")}</span>
      {onClose && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto text-muted-foreground"
          aria-label={t("common:close")}
          onClick={onClose}
        >
          <X />
        </Button>
      )}
    </header>
  );
}

/** 移动端状态屏外壳:头部 + 居中正文(复用桌面的居中状态组件) */
function MobileStateShell({ onClose, children }: { onClose?: () => void; children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <MobileHeader onClose={onClose} />
      <div className="flex flex-1 items-center justify-center overflow-auto px-5">{children}</div>
    </div>
  );
}

/** 移动端脚本卡 */
function MobileScriptCard({ item, view }: { item: ScriptImportItem; view: ImportView }) {
  const { t } = useTranslation();
  const inProgress = view.phase === "importing" || view.phase === "done";
  const status: ImportItemStatus = view.importStatus[item.id] ?? "pending";
  const dim = item.op === "error" ? "opacity-60" : "";
  return (
    <Surface data-testid="import-script-card" padding="compact" className="gap-2.5 rounded-lg">
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
          <ScriptAvatar item={item} size={34} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {item.name || t("install:importpage.unknown_script")}
            </span>
            {item.author && <span className="truncate text-xs text-muted-foreground">{item.author}</span>}
          </span>
        </span>
        <OpBadge op={item.op} />
      </div>
      <div className={cn("flex items-center gap-1.5 overflow-hidden text-[13px]", dim)}>
        <Tag className="size-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-fg-secondary">{mobileVersionText(item)}</span>
        <span className="text-muted-foreground">{"·"}</span>
        <SourceCell source={item.source} />
        <span className="text-muted-foreground">{"·"}</span>
        <DataCell item={item} />
      </div>
      {!inProgress &&
        (item.op === "error" ? (
          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <span className="text-[13px] text-destructive">{t("install:importpage.row_error")}</span>
            <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
          </div>
        ) : (
          <div className="flex items-center border-t border-border pt-2.5">
            <span className="text-[13px] text-fg-secondary">{t("install:importpage.enable_after_import")}</span>
            <div className="flex-1" />
            <Switch
              data-testid={`enable-switch-${item.id}`}
              size="sm"
              checked={item.enabled}
              onCheckedChange={(v) => view.onSetEnabled(item.id, v)}
            />
          </div>
        ))}
    </Surface>
  );
}

/** 移动端订阅卡 */
function MobileSubscribeCard({ item, view }: { item: SubscribeImportItem; view: ImportView }) {
  const { t } = useTranslation();
  const inProgress = view.phase === "importing" || view.phase === "done";
  const status: ImportItemStatus = view.importStatus[item.id] ?? "pending";
  return (
    <Surface data-testid="import-subscribe-card" padding="compact" className="flex-row items-center gap-2.5 rounded-lg">
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
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-primary-light">
        <Rss className="size-4 text-primary" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">
          {item.name || t("install:importpage.unknown_script")}
        </span>
        {item.url && <span className="truncate font-mono text-xs text-muted-foreground">{item.url}</span>}
      </span>
      <OpBadge op={item.op} />
    </Surface>
  );
}

function MobileSubscribeSection({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  if (view.subscribes.length === 0) return null;
  const importable = importableSubscribeIds(view.subscribes);
  const selectedCount = importable.filter((id) => view.selectedSubscribes.has(id)).length;
  const allSelected = importable.length > 0 && selectedCount === importable.length;
  const reviewing = view.phase === "ready";
  return (
    <div data-testid="subscribe-section" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1 pt-1.5">
        <div className="flex items-center gap-2">
          <Rss className="size-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{t("install:importpage.subscribe_section")}</span>
          <span className="text-xs text-muted-foreground">{view.subscribes.length}</span>
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
  const { t } = useTranslation();
  const importable = importableScriptIds(view.scripts);
  const selectedCount = importable.filter((id) => view.selectedScripts.has(id)).length;
  const allSelected = importable.length > 0 && selectedCount === importable.length;
  const unimportable = view.scripts.length - importable.length;
  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border bg-card px-4">
      <Checkbox data-testid="toggle-all-scripts" checked={allSelected} onCheckedChange={view.onToggleAllScripts} />
      <span className="text-[13px] font-medium text-foreground">
        {t("install:importpage.selected_count", { selected: selectedCount, total: importable.length })}
      </span>
      {unimportable > 0 && (
        <span className="ml-auto text-xs text-muted-foreground">
          {t("install:importpage.unimportable_count", { count: unimportable })}
        </span>
      )}
    </div>
  );
}

function MobileImportingBar({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-4 text-[13px]">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      <span className="truncate font-medium text-foreground">
        {t("install:importpage.importing_progress", { done: view.doneCount, total: view.totalCount })}
      </span>
    </div>
  );
}

function MobileActions({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  const importing = view.phase === "importing";
  const total = view.selectedScripts.size + view.selectedSubscribes.size;
  return (
    <div className="flex shrink-0 flex-col gap-2.5 border-t border-border bg-card px-4 pt-2.5 pb-6">
      {importing ? (
        <>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            {t("install:importpage.importing_actionbar_hint")}
          </div>
          <div className="flex gap-2.5">
            <Button variant="outline" className="h-11 flex-1" onClick={view.onCancel}>
              {t("install:importpage.cancel")}
            </Button>
            <Button className="h-11 flex-1" disabled>
              <Loader2 className="animate-spin" />
              {t("install:importpage.importing_button")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" />
            {t("install:importpage.trust_hint")}
          </div>
          <div className="flex gap-2.5">
            <Button variant="outline" className="h-11 flex-1" onClick={view.onClose}>
              {t("common:close")}
            </Button>
            <Button data-testid="import-btn" className="h-11 flex-1" disabled={total === 0} onClick={view.onImport}>
              <Download />
              {t("install:importpage.import_selected", { count: total })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** 移动端整页视图 */
export function MobileView({ view }: { view: ImportView }) {
  const { t } = useTranslation();
  if (view.phase === "loading") {
    return (
      <MobileStateShell onClose={view.onClose}>
        <ImportLoading filename={view.filename} />
      </MobileStateShell>
    );
  }
  if (view.phase === "invalid") {
    return (
      <MobileStateShell onClose={view.onClose}>
        <ImportErrorScreen desc={t("install:importpage.invalid_desc")} onClose={view.onClose} />
      </MobileStateShell>
    );
  }
  if (view.phase === "error") {
    return (
      <MobileStateShell onClose={view.onClose}>
        <ImportErrorScreen
          desc={t("install:importpage.error_desc")}
          detail={view.errorMessage}
          onRetry={view.onRetry}
          onClose={view.onClose}
        />
      </MobileStateShell>
    );
  }
  if (view.phase === "empty") {
    return (
      <MobileStateShell onClose={view.onClose}>
        <EmptyBackup onClose={view.onClose} />
      </MobileStateShell>
    );
  }
  if (view.phase === "done") {
    return (
      <MobileStateShell onClose={view.onClose}>
        <ImportComplete view={view} />
      </MobileStateShell>
    );
  }

  const importing = view.phase === "importing";
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <MobileHeader onClose={importing ? undefined : view.onClose} />
      {importing && <TopProgressBar done={view.doneCount} total={view.totalCount} />}
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

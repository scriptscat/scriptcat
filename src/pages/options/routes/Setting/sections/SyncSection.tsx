import { useEffect, useState } from "react";
import { RefreshCw, TriangleAlert, CircleAlert, CircleCheckBig, ExternalLink } from "lucide-react";
import { SettingCard } from "../../../components/SettingCard";
import FileSystemParams from "../../../components/FileSystemParams";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Button } from "@App/pages/components/ui/button";
import { systemConfig } from "@App/pages/store/global";
import {
  fetchCloudSyncState,
  subscribeCloudSyncState,
  requestCloudSyncOnce,
} from "@App/pages/store/features/cloud_sync";
import FileSystemFactory from "@Packages/filesystem/factory";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import { cn } from "@App/pkg/utils/cn";
import { semTime } from "@App/locales/relative-date";
import { DEFAULT_CLOUD_SYNC_STATE, type CloudSyncConfig, type CloudSyncState } from "@App/pkg/config/config";
import { syncStatusVariant, syncLogHref, type SyncStatusVariant } from "./syncStatus";

// 各状态的容器/图标配色与图标（明暗自适应设计令牌）
const VARIANT_META: Record<SyncStatusVariant, { box: string; icon: string; Icon: typeof RefreshCw; spin?: boolean }> = {
  idle: { box: "border-border bg-muted/40", icon: "text-success", Icon: CircleCheckBig },
  syncing: { box: "border-border bg-muted/40", icon: "text-muted-foreground", Icon: RefreshCw, spin: true },
  warning: { box: "border-warning/40 bg-warning-bg", icon: "text-warning", Icon: TriangleAlert },
  error: { box: "border-destructive/40 bg-destructive/10", icon: "text-destructive", Icon: CircleAlert },
};

export function SyncSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CloudSyncConfig | undefined>(undefined);
  const [syncState, setSyncState] = useState<CloudSyncState>(DEFAULT_CLOUD_SYNC_STATE);

  useEffect(() => {
    void Promise.resolve(systemConfig.get("cloud_sync")).then((v) => setDraft(v as CloudSyncConfig));
  }, []);

  // 读取并订阅设备本地同步状态（SW 每轮同步写入 chrome.storage）
  useEffect(() => {
    void fetchCloudSyncState().then(setSyncState);
    return subscribeCloudSyncState(setSyncState);
  }, []);

  const patch = (next: Partial<CloudSyncConfig>) => setDraft((d) => (d ? { ...d, ...next } : d));

  const save = async () => {
    if (!draft) return;
    // 启用同步时先校验账号连通性
    if (draft.enable) {
      notify.info(t("settings:cloud_sync_account_verification"));
      try {
        await FileSystemFactory.create(draft.filesystem, draft.params[draft.filesystem]);
      } catch (e) {
        notify.error(`${t("settings:cloud_sync_verification_failed")}: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    systemConfig.set("cloud_sync", draft);
    notify.success(t("save_success"));
  };

  const syncNow = async () => {
    await requestCloudSyncOnce();
  };

  const variant = syncStatusVariant(syncState);
  const meta = VARIANT_META[variant];
  let title: string;
  let desc = "";
  switch (variant) {
    case "warning":
      title = t("settings:sync_state_attention");
      desc = t("settings:sync_state_attention_desc", {
        overwrite: syncState.counts.overwrite,
        conflict: syncState.counts.conflict,
      });
      break;
    case "error":
      title = t("settings:sync_state_error");
      desc = syncState.error || "";
      break;
    case "syncing":
      title = t("settings:sync_state_syncing");
      break;
    default:
      title = t("settings:sync_state_idle");
      desc =
        syncState.lastSyncAt > 0
          ? t("settings:sync_last_at", { time: semTime(new Date(syncState.lastSyncAt)) })
          : t("settings:sync_never");
  }

  return (
    <div data-tour="setting-sync">
      <SettingCard id="sync" title={t("settings:script_sync")} register={register}>
        {draft && (
          <div className="flex flex-col gap-4">
            {draft.enable && (
              <div
                data-testid="cloud_sync_status"
                data-variant={variant}
                className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5", meta.box)}
              >
                <meta.Icon className={cn("mt-0.5 size-4 shrink-0", meta.icon, meta.spin && "animate-spin")} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-foreground">{title}</span>
                  {desc && <span className="text-xs text-muted-foreground">{desc}</span>}
                </div>
                {variant !== "syncing" && (
                  <a
                    data-testid="cloud_sync_view_logs"
                    href={syncLogHref(variant)}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {t("settings:sync_view_logs")}
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  data-testid="cloud_sync_sync_delete"
                  aria-label={t("settings:sync_delete")}
                  checked={draft.syncDelete}
                  onCheckedChange={(c) => patch({ syncDelete: c === true })}
                />
                {t("settings:sync_delete")}
              </label>
              <p className="text-xs text-muted-foreground pl-6">{t("settings:sync_delete_desc")}</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  data-testid="cloud_sync_sync_status"
                  aria-label={t("settings:sync_status")}
                  checked={draft.syncStatus}
                  onCheckedChange={(c) => patch({ syncStatus: c === true })}
                />
                {t("settings:sync_status")}
              </label>
            </div>

            <FileSystemParams
              headerContent={
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    data-testid="cloud_sync_enable"
                    aria-label={t("settings:enable_script_sync_to")}
                    checked={draft.enable}
                    onCheckedChange={(c) => patch({ enable: c === true })}
                  />
                  {t("settings:enable_script_sync_to")}
                </label>
              }
              fileSystemType={draft.filesystem}
              fileSystemParams={draft.params[draft.filesystem] || {}}
              onChangeFileSystemType={(type) => patch({ filesystem: type })}
              onChangeFileSystemParams={(params) => patch({ params: { ...draft.params, [draft.filesystem]: params } })}
            >
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="cloud_sync_now"
                  disabled={!draft.enable}
                  onClick={syncNow}
                >
                  <RefreshCw className="size-4" />
                  {t("settings:sync_now")}
                </Button>
                <Button data-testid="cloud_sync_save" size="sm" onClick={save}>
                  {t("save")}
                </Button>
              </div>
            </FileSystemParams>
          </div>
        )}
      </SettingCard>
    </div>
  );
}

import { useEffect, useState } from "react";
import { SettingCard } from "../../../components/SettingCard";
import FileSystemParams from "../../../components/FileSystemParams";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Button } from "@App/pages/components/ui/button";
import { systemConfig } from "@App/pages/store/global";
import FileSystemFactory from "@Packages/filesystem/factory";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import type { CloudSyncConfig } from "@App/pkg/config/config";

export function SyncSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CloudSyncConfig | undefined>(undefined);

  useEffect(() => {
    void Promise.resolve(systemConfig.get("cloud_sync")).then((v) => setDraft(v as CloudSyncConfig));
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

  return (
    <div data-tour="setting-sync">
      <SettingCard id="sync" title={t("settings:script_sync")} register={register}>
        {draft && (
          <div className="flex flex-col gap-4">
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
              <Button data-testid="cloud_sync_save" size="sm" onClick={save}>
                {t("save")}
              </Button>
            </FileSystemParams>
          </div>
        )}
      </SettingCard>
    </div>
  );
}

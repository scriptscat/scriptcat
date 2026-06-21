import { useEffect, useState } from "react";
import { SettingCard } from "../../../components/SettingCard";
import FileSystemParams from "../../../components/FileSystemParams";
import { Button } from "@App/pages/components/ui/button";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@App/pages/components/ui/sheet";
import { systemConfig } from "@App/pages/store/global";
import { synchronizeClient } from "@App/pages/store/features/script";
import FileSystemFactory, { type FileSystemType } from "@Packages/filesystem/factory";
import type { FileInfo, FileReader } from "@Packages/filesystem/filesystem";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { openImportWindow } from "../openImportWindow";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";

type BackupConfig = { filesystem: FileSystemType; params: { [key: string]: any } };

export function CloudBackupSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<BackupConfig | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [backupFileList, setBackupFileList] = useState<FileInfo[]>([]);

  useEffect(() => {
    void Promise.resolve(systemConfig.get("backup")).then((v) => setDraft(v as BackupConfig));
  }, []);

  const currentParams = () => draft!.params[draft!.filesystem];

  const saveAndBackup = () => {
    if (!draft) return;
    systemConfig.set("backup", draft);
    setLoading(true);
    notify.info(t("settings:preparing_backup"));
    synchronizeClient
      .backupToCloud(draft.filesystem, currentParams())
      .then(() => notify.success(t("settings:backup_success")))
      .catch((e) => notify.error(`${t("settings:backup_failed")}: ${e}`))
      .finally(() => setLoading(false));
  };

  const listBackups = async () => {
    if (!draft) return;
    setLoading(true);
    try {
      let fs = await FileSystemFactory.create(draft.filesystem, currentParams());
      fs = await fs.openDir("ScriptCat");
      let list = await fs.list();
      list = list.filter((file) => file.name.endsWith(".zip")).sort((a, b) => b.updatetime - a.updatetime);
      if (list.length === 0) {
        notify.info(t("settings:no_backup_files"));
      } else {
        setBackupFileList(list);
      }
    } catch (e) {
      notify.error(`${t("settings:get_backup_files_failed")}: ${e}`);
    }
    setLoading(false);
  };

  const openBackupDir = async () => {
    if (!draft) return;
    try {
      let fs = await FileSystemFactory.create(draft.filesystem, currentParams());
      fs = await fs.openDir("ScriptCat");
      const url = await fs.getDirUrl();
      if (url) window.open(url, "_blank");
    } catch (e) {
      notify.error(`${t("settings:get_backup_dir_url_failed")}: ${e}`);
    }
  };

  const restore = async (item: FileInfo) => {
    if (!draft) return;
    notify.info(t("tools:pulling_data_from_cloud"));
    let fs = await FileSystemFactory.create(draft.filesystem, currentParams());
    let file: FileReader;
    let data: Blob;
    try {
      fs = await fs.openDir("ScriptCat");
      file = await fs.open(item);
      data = (await file.read("blob")) as Blob;
    } catch (e) {
      notify.error(`${t("tools:pull_failed")}: ${e}`);
      return;
    }
    try {
      await openImportWindow(item.name, data);
      notify.success(t("tools:select_import_script"));
    } catch (e) {
      notify.error(`${t("tools:import_error")}: ${e}`);
    }
  };

  const deleteBackup = async (item: FileInfo) => {
    if (!draft) return;
    let fs = await FileSystemFactory.create(draft.filesystem, currentParams());
    try {
      fs = await fs.openDir("ScriptCat");
      await fs.delete(item.name);
      setBackupFileList((prev) => prev.filter((i) => i.name !== item.name));
      notify.success(t("editor:delete_success"));
    } catch (e) {
      notify.error(`${t("script:delete_failed")}: ${e}`);
    }
  };

  return (
    <SettingCard
      id="cloud-backup"
      title={t("tools:cloud_backup")}
      description={t("settings:cloud")}
      register={register}
    >
      {draft && (
        <FileSystemParams
          headerContent={<span className="text-sm text-muted-foreground">{t("settings:backup_to")}</span>}
          fileSystemType={draft.filesystem}
          fileSystemParams={draft.params[draft.filesystem] || {}}
          onChangeFileSystemType={(type) => setDraft((d) => (d ? { ...d, filesystem: type } : d))}
          onChangeFileSystemParams={(params) =>
            setDraft((d) => (d ? { ...d, params: { ...d.params, [d.filesystem]: params } } : d))
          }
        >
          <Button data-testid="tools_backup" size="sm" disabled={loading} onClick={saveAndBackup}>
            {t("settings:backup")}
          </Button>
          <Button
            data-testid="tools_backup_list"
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={listBackups}
          >
            {t("settings:backup_list")}
          </Button>
        </FileSystemParams>
      )}

      <Sheet open={backupFileList.length > 0} onOpenChange={(open) => !open && setBackupFileList([])}>
        <SheetContent className="w-[400px] sm:max-w-[400px]">
          <SheetHeader>
            <div className="flex items-center justify-between gap-4 pr-6">
              <SheetTitle>{t("settings:backup_list")}</SheetTitle>
              <Button size="xs" variant="outline" onClick={openBackupDir}>
                {t("settings:open_backup_dir")}
              </Button>
            </div>
            <SheetDescription className="sr-only">{t("tools:cloud_backup")}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col divide-y divide-border overflow-y-auto px-4">
            {backupFileList.map((item) => (
              <div key={`${item.name}_${item.updatetime}`} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{formatUnixTime(item.updatetime / 1000)}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button data-testid="tools_restore" size="xs" onClick={() => restore(item)}>
                    {t("tools:restore")}
                  </Button>
                  <Popconfirm
                    description={`${t("settings:confirm_delete_backup_file")} ${item.name}?`}
                    confirmText={t("confirm")}
                    cancelText={t("editor:cancel")}
                    destructive
                    onConfirm={() => deleteBackup(item)}
                  >
                    <Button data-testid="tools_delete" size="xs" variant="destructive">
                      {t("common:delete")}
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </SettingCard>
  );
}

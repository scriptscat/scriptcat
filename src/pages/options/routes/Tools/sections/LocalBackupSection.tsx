import { useRef, useState } from "react";
import { SettingCard } from "../../../components/SettingCard";
import { Button } from "@App/pages/components/ui/button";
import { synchronizeClient } from "@App/pages/store/features/script";
import { openImportWindow } from "../openImportWindow";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import type { LocalBackupExport } from "@App/app/service/service_worker/synchronize";

export function LocalBackupSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const configFileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [localBackup, setLocalBackup] = useState<LocalBackupExport>();

  const exportFile = async () => {
    setExporting(true);
    try {
      setLocalBackup(await synchronizeClient.export());
    } finally {
      setExporting(false);
    }
  };

  const pickImportFile = () => {
    const el = fileRef.current!;
    el.onchange = async () => {
      const file = el.files?.[0];
      if (!file) return;
      try {
        await openImportWindow(file.name, file);
        notify.success(t("tools:select_import_script"));
      } catch (e) {
        notify.error(`${t("tools:import_error")}: ${e}`);
      }
    };
    el.click();
  };

  // 仅导出 ScriptCat 设置为 json 文件(#684)
  const exportConfig = async () => {
    const bundle = await synchronizeClient.getConfigBundle();
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "scriptcat-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const pickImportConfig = () => {
    const el = configFileRef.current!;
    el.onchange = async () => {
      const file = el.files?.[0];
      if (!file) return;
      try {
        const bundle = JSON.parse(await file.text());
        await synchronizeClient.restoreConfigBundle(bundle);
        notify.success(t("tools:config_imported"));
      } catch (e) {
        notify.error(`${t("tools:import_error")}: ${e}`);
      }
    };
    el.click();
  };

  return (
    <div data-tour="tools-backup">
      <SettingCard
        id="local-backup"
        title={t("tools:local_backup")}
        description={t("settings:local")}
        register={register}
      >
        <input
          type="file"
          ref={fileRef}
          className="hidden"
          accept=".zip"
          data-testid="tools_import_file"
          aria-label={t("settings:import_file")}
        />
        <input
          type="file"
          ref={configFileRef}
          className="hidden"
          accept=".json"
          data-testid="tools_import_config_file"
          aria-label={t("tools:import_config")}
        />
        <div className="flex flex-wrap gap-2">
          <Button data-testid="tools_export" size="sm" disabled={exporting} onClick={exportFile}>
            {t("settings:export_file")}
          </Button>
          <Button data-testid="tools_import" size="sm" variant="secondary" onClick={pickImportFile}>
            {t("settings:import_file")}
          </Button>
          <Button data-testid="tools_export_config" size="sm" variant="secondary" onClick={exportConfig}>
            {t("tools:export_config")}
          </Button>
          <Button data-testid="tools_import_config" size="sm" variant="secondary" onClick={pickImportConfig}>
            {t("tools:import_config")}
          </Button>
          {localBackup && (
            <Button asChild size="sm" variant="link">
              <a href={localBackup.url} download={localBackup.filename}>
                {t("tools:manual_download")}
              </a>
            </Button>
          )}
        </div>
      </SettingCard>
    </div>
  );
}

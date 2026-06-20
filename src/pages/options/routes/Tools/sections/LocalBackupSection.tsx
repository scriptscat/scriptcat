import { useRef, useState } from "react";
import { SettingCard } from "../../../components/SettingCard";
import { Button } from "@App/pages/components/ui/button";
import { synchronizeClient } from "@App/pages/store/features/script";
import { openImportWindow } from "../openImportWindow";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";

export function LocalBackupSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportFile = async () => {
    setExporting(true);
    try {
      await synchronizeClient.export();
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

  return (
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
      <div className="flex flex-wrap gap-2">
        <Button data-testid="tools_export" size="sm" disabled={exporting} onClick={exportFile}>
          {t("settings:export_file")}
        </Button>
        <Button data-testid="tools_import" size="sm" variant="secondary" onClick={pickImportFile}>
          {t("settings:import_file")}
        </Button>
      </div>
    </SettingCard>
  );
}

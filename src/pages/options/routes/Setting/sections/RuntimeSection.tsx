import { useEffect, useState } from "react";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Switch } from "@App/pages/components/ui/switch";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import { isPermissionOk } from "@App/pkg/utils/utils";
import { t } from "@App/locales/locales";
import { toast } from "sonner";
import type { CATFileStorage } from "@App/pkg/config/config";

export function RuntimeSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const [bg, setBg] = useState(false);
  const [storage] = useSystemConfig("cat_file_storage");

  useEffect(() => {
    isPermissionOk("background").then((r) => {
      if (r !== null) setBg(r);
    });
  }, []);

  const toggleBg = (enable: boolean) => {
    if (enable) {
      chrome.permissions.request({ permissions: ["background"] }, (granted) => {
        if (chrome.runtime.lastError) {
          toast.error(t("settings:enable_background.enable_failed")!);
          return;
        }
        setBg(granted);
      });
    } else {
      chrome.permissions.remove({ permissions: ["background"] }, (removed) => {
        if (chrome.runtime.lastError) {
          toast.error(t("settings:enable_background.disable_failed")!);
          return;
        }
        if (removed) setBg(false);
      });
    }
  };

  const storageData = storage as CATFileStorage | undefined;
  const storageStatus = storageData?.status ?? "unset";
  const storageStatusLabel =
    storageStatus === "success"
      ? t("editor:in_use")
      : storageStatus === "error"
        ? t("editor:storage_error")
        : t("editor:not_set");

  return (
    <SettingCard id="runtime" title={t("logs:runtime")} register={register}>
      <SettingRow
        label={t("settings:enable_background.title")}
        description={t("settings:enable_background.description")}
      >
        <Switch checked={bg} onCheckedChange={toggleBg} />
      </SettingRow>
      <SettingRow label={t("editor:storage_api")}>
        <span className="text-sm text-muted-foreground">{storageStatusLabel}</span>
      </SettingRow>
    </SettingCard>
  );
}

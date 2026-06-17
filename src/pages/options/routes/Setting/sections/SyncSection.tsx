import { SettingCard } from "../../../components/SettingCard";
import { t } from "@App/locales/locales";

export function SyncSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  return (
    <SettingCard
      id="sync"
      title={t("settings:script_sync")}
      description={t("settings:enable_script_sync_to")}
      register={register}
    >
      <p className="text-sm text-muted-foreground">云端同步配置开发中</p>
    </SettingCard>
  );
}

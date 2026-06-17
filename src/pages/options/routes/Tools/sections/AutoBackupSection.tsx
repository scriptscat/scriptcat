import { CalendarClock } from "lucide-react";
import { SettingCard } from "../../../components/SettingCard";
import { t } from "@App/locales/locales";

export function AutoBackupSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  return (
    <SettingCard
      id="auto-backup"
      title={t("tools:auto_backup")}
      description={t("settings:backup_strategy")}
      register={register}
    >
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
        <CalendarClock className="size-8 opacity-50" />
        <span className="text-sm">{t("settings:under_construction")}</span>
      </div>
    </SettingCard>
  );
}

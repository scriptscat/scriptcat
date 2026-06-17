import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { Switch } from "@App/pages/components/ui/switch";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import { t } from "@App/locales/locales";

export function UpdateSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const [cycle, setCycle] = useSystemConfig("check_script_update_cycle");
  const [updateDisabled, setUpdateDisabled] = useSystemConfig("update_disable_script");
  const [silence, setSilence] = useSystemConfig("silence_update_script");

  return (
    <SettingCard
      id="update"
      title={t("update")}
      description={t("settings:control_script_update_behavior")}
      register={register}
    >
      <SettingRow
        label={t("settings:script_update_check_frequency")}
        description={t("settings:script_auto_update_frequency")}
      >
        <Select value={String(cycle ?? 86400)} onValueChange={(v) => setCycle(Number(v))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t("settings:never")}</SelectItem>
            <SelectItem value="21600">{t("settings:6_hours")}</SelectItem>
            <SelectItem value="43200">{t("settings:12_hours")}</SelectItem>
            <SelectItem value="86400">{t("settings:every_day")}</SelectItem>
            <SelectItem value="604800">{t("settings:every_week")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow label={t("settings:update_disabled_scripts")}>
        <Switch
          aria-label="update_disabled_scripts_switch"
          checked={!!updateDisabled}
          onCheckedChange={(c) => setUpdateDisabled(c)}
        />
      </SettingRow>
      <SettingRow label={t("settings:silent_update_non_critical_changes")}>
        <Switch checked={!!silence} onCheckedChange={(c) => setSilence(c)} />
      </SettingRow>
    </SettingCard>
  );
}

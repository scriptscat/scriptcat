import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import { t } from "@App/locales/locales";
import i18n from "i18next";

export function GeneralSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const [language, setLanguage] = useSystemConfig("language");
  const langs = Object.keys(i18n.store.data);
  return (
    <SettingCard
      id="general"
      title={t("settings:general")}
      description={t("settings:select_interface_language")}
      register={register}
    >
      <SettingRow label={t("settings:language")} description={t("settings:select_interface_language")}>
        <Select value={language ?? ""} onValueChange={(v) => setLanguage(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {langs.map((k) => (
              <SelectItem key={k} value={k}>
                {(i18n.store.data[k] as { title?: string })?.title ?? k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingCard>
  );
}

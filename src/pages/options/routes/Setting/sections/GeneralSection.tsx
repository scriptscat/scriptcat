import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const HELP_TRANSLATE_VALUE = "help";
const HELP_TRANSLATE_URL = "https://github.com/scriptscat/scriptcat/discussions/531";

export function GeneralSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useSystemConfig("language");
  const langs = Object.keys(i18n.store.data);
  const handleLanguageChange = (v: string) => {
    if (v === HELP_TRANSLATE_VALUE) {
      window.open(HELP_TRANSLATE_URL, "_blank");
      return;
    }
    setLanguage(v);
    toast.success(t("settings:language_change_tip"));
  };
  return (
    <SettingCard id="general" title={t("settings:general")} register={register}>
      <SettingRow label={t("settings:language")} description={t("settings:select_interface_language")}>
        <Select value={language ?? ""} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {langs.map((k) => (
              <SelectItem key={k} value={k}>
                {(i18n.store.data[k] as { title?: string })?.title ?? k}
              </SelectItem>
            ))}
            <SelectItem value={HELP_TRANSLATE_VALUE}>{t("settings:help_translate")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingCard>
  );
}

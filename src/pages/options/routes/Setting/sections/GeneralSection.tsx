import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";

const HELP_TRANSLATE_VALUE = "help";
const HELP_TRANSLATE_URL = "https://github.com/scriptscat/scriptcat/discussions/531";

// 回收站保留天数选项；0 = 永不自动清理
const RETENTION_OPTIONS = [
  { value: "7", key: "settings:trash_retention_7" },
  { value: "30", key: "settings:trash_retention_30" },
  { value: "90", key: "settings:trash_retention_90" },
  { value: "0", key: "settings:trash_retention_never" },
];

export function GeneralSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useSystemConfig("language");
  const [retention, setRetention] = useSystemConfig("trash_retention_days");
  const langs = Object.keys(i18n.store.data);
  const handleLanguageChange = (v: string) => {
    if (v === HELP_TRANSLATE_VALUE) {
      window.open(HELP_TRANSLATE_URL, "_blank");
      return;
    }
    setLanguage(v);
    notify.success(t("settings:language_change_tip"));
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
      <SettingRow label={t("settings:trash_retention")} description={t("settings:trash_retention_desc")}>
        <Select value={String(retention ?? 30)} onValueChange={(v) => setRetention(Number(v))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RETENTION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingCard>
  );
}

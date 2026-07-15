import { useState } from "react";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { Switch } from "@App/pages/components/ui/switch";
import { Input } from "@App/pages/components/ui/input";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";

const HELP_TRANSLATE_VALUE = "help";
const HELP_TRANSLATE_URL = "https://github.com/scriptscat/scriptcat/discussions/531";

const CUSTOM_VALUE = "custom";
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;

// 回收站保留天数预设档；0 = 永不自动清理。不在此列表中的值即为「自定义」
const RETENTION_PRESETS = [7, 30, 90, 0];
const RETENTION_OPTIONS = [
  { value: "7", key: "settings:trash_retention_7" },
  { value: "30", key: "settings:trash_retention_30" },
  { value: "90", key: "settings:trash_retention_90" },
  { value: CUSTOM_VALUE, key: "settings:trash_retention_custom" },
  { value: "0", key: "settings:trash_retention_never" },
];

export function GeneralSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useSystemConfig("language");
  const [trashEnabled, setTrashEnabled] = useSystemConfig("trash_enabled");
  const [retention, setRetention] = useSystemConfig("trash_retention_days");
  const langs = Object.keys(i18n.store.data);

  const days = retention ?? 30;
  // 必须是显式 state：纯派生的话，days 恰为预设值时选「自定义」会被立刻弹回预设档。
  // 首次挂载时 retention 尚未从异步配置加载完成（值为 undefined，days 退到默认的 30），
  // 所以不能用它初始化 state；等 retention 从 undefined 变为真实值的那次渲染里，
  // 在渲染期间同步一次（React 官方推荐的"渲染时调整 state"写法，避免 effect 级联渲染）。
  const [loadedRetention, setLoadedRetention] = useState<number | undefined>(undefined);
  const [custom, setCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState(() => String(days));
  if (retention !== undefined && loadedRetention === undefined) {
    setLoadedRetention(retention);
    setCustom(!RETENTION_PRESETS.includes(retention));
    setCustomDraft(String(retention));
  }

  const handleLanguageChange = (v: string) => {
    if (v === HELP_TRANSLATE_VALUE) {
      window.open(HELP_TRANSLATE_URL, "_blank");
      return;
    }
    setLanguage(v);
    notify.success(t("settings:language_change_tip"));
  };

  const handleRetentionChange = (v: string) => {
    if (v === CUSTOM_VALUE) {
      setCustom(true);
      setCustomDraft(String(days));
      return;
    }
    setCustom(false);
    setRetention(Number(v));
  };

  const handleCustomDraftChange = (v: string) => {
    setCustomDraft(v);
    const n = Number(v);
    // 空值/非法值只留在草稿里，不落配置，避免中途输入把保留时间写成 0 天
    if (!v.trim() || !Number.isInteger(n) || n < MIN_RETENTION_DAYS || n > MAX_RETENTION_DAYS) return;
    setRetention(n);
  };

  const enabled = trashEnabled ?? true;

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
      <SettingRow label={t("settings:trash_enabled")} description={t("settings:trash_enabled_desc")}>
        <Switch
          aria-label={t("settings:trash_enabled")}
          checked={enabled}
          onCheckedChange={(c) => setTrashEnabled(c)}
        />
      </SettingRow>
      <SettingRow label={t("settings:trash_retention")} description={t("settings:trash_retention_desc")}>
        <div className="flex items-center gap-2">
          <Select
            value={custom ? CUSTOM_VALUE : String(days)}
            onValueChange={handleRetentionChange}
            disabled={!enabled}
          >
            <SelectTrigger className="w-[180px]" aria-label={t("settings:trash_retention")}>
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
          {custom && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                aria-label={t("settings:trash_retention")}
                className="w-[90px]"
                min={MIN_RETENTION_DAYS}
                max={MAX_RETENTION_DAYS}
                disabled={!enabled}
                value={customDraft}
                onChange={(e) => handleCustomDraftChange(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">{t("settings:trash_retention_days_unit")}</span>
            </div>
          )}
        </div>
      </SettingRow>
    </SettingCard>
  );
}

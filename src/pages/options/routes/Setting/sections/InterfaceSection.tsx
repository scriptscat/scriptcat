import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { Switch } from "@App/pages/components/ui/switch";
import { Input } from "@App/pages/components/ui/input";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import { useTranslation } from "react-i18next";
import type { FaviconService } from "@App/pkg/config/config";

export function InterfaceSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [badgeType, setBadgeType] = useSystemConfig("badge_number_type");
  const [bgColor, setBgColor] = useSystemConfig("badge_background_color");
  const [textColor, setTextColor] = useSystemConfig("badge_text_color");
  const [menuType, setMenuType] = useSystemConfig("script_menu_display_type");
  const [expandNum, setExpandNum] = useSystemConfig("menu_expand_num");
  const [favicon, setFavicon] = useSystemConfig("favicon_service");

  return (
    <SettingCard id="interface" title={t("settings:interface_settings")} register={register}>
      <div className="text-[13px] font-semibold text-foreground">{t("settings:extension_icon_badge")}</div>
      <SettingRow label={t("settings:display_type")} description={t("settings:extension_icon_badge_type")}>
        <Select value={badgeType ?? ""} onValueChange={(v) => setBadgeType(v as "none" | "run_count" | "script_count")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("settings:badge_type_none")}</SelectItem>
            <SelectItem value="run_count">{t("settings:badge_type_run_count")}</SelectItem>
            <SelectItem value="script_count">{t("settings:badge_type_script_count")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow label={t("settings:background_color")} description={t("settings:badge_background_color_desc")}>
        <input
          type="color"
          value={(bgColor as string) ?? "#4e5969"}
          onChange={(e) => setBgColor(e.target.value)}
          className="h-8 w-12 rounded border border-border bg-transparent"
        />
      </SettingRow>
      <SettingRow label={t("settings:text_color")} description={t("settings:badge_text_color_desc")}>
        <input
          type="color"
          value={(textColor as string) ?? "#ffffff"}
          onChange={(e) => setTextColor(e.target.value)}
          className="h-8 w-12 rounded border border-border bg-transparent"
        />
      </SettingRow>
      <div className="text-[13px] font-semibold text-foreground pt-1">{t("settings:script_menu")}</div>
      <SettingRow
        label={t("settings:display_right_click_menu")}
        description={t("settings:display_right_click_menu_desc")}
      >
        <Switch checked={menuType === "all"} onCheckedChange={(c) => setMenuType(c ? "all" : "no_browser")} />
      </SettingRow>
      <SettingRow label={t("settings:expand_count")} description={t("settings:auto_collapse_when_exceeds")}>
        <Input
          type="number"
          className="w-20"
          value={(expandNum as number) ?? 0}
          onChange={(e) => setExpandNum(Number(e.target.value))}
        />
      </SettingRow>
      <SettingRow label={t("settings:favicon_service")} description={t("settings:favicon_service_desc")}>
        <Select value={favicon ?? ""} onValueChange={(v) => setFavicon(v as FaviconService)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="scriptcat">{t("settings:favicon_service_scriptcat")}</SelectItem>
            <SelectItem value="google">{t("settings:favicon_service_google")}</SelectItem>
            <SelectItem value="duckduckgo">{t("settings:favicon_service_duckduckgo")}</SelectItem>
            <SelectItem value="icon-horse">{t("settings:favicon_service_icon-horse")}</SelectItem>
            <SelectItem value="local">{t("settings:favicon_service_local")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingCard>
  );
}

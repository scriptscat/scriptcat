import { HardDrive, Cloud, CalendarClock, Database, Terminal, PlugZap } from "lucide-react";
import type { TFunction } from "i18next";
import type { SettingsCategory } from "../../layout/SettingsLayout";
import { isFirefox } from "@App/pkg/utils/utils";

export function getToolsCategories(t: TFunction): SettingsCategory[] {
  return [
    { id: "local-backup", icon: HardDrive, label: t("tools:local_backup") },
    { id: "cloud-backup", icon: Cloud, label: t("tools:cloud_backup") },
    { id: "auto-backup", icon: CalendarClock, label: t("tools:auto_backup") },
    { id: "data-migration", icon: Database, label: t("tools:data_migration") },
    { id: "dev-tools", icon: Terminal, label: t("tools:development_tool") },
    // 外部接入尚未在 Firefox MV3 上构建/验证,不在 Firefox 提供入口,避免未测试配置被静默启用。
    ...(!isFirefox() ? [{ id: "external-access", icon: PlugZap, label: t("external_access:section_title") }] : []),
  ];
}

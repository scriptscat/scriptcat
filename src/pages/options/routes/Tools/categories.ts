import { HardDrive, Cloud, CalendarClock, Database, Terminal } from "lucide-react";
import { t } from "@App/locales/locales";
import type { SettingsCategory } from "../../layout/SettingsLayout";

export const TOOLS_CATEGORIES: SettingsCategory[] = [
  { id: "local-backup", icon: HardDrive, label: t("tools:local_backup") },
  { id: "cloud-backup", icon: Cloud, label: t("tools:cloud_backup") },
  { id: "auto-backup", icon: CalendarClock, label: t("tools:auto_backup") },
  { id: "data-migration", icon: Database, label: t("tools:data_migration") },
  { id: "dev-tools", icon: Terminal, label: t("tools:development_tool") },
];

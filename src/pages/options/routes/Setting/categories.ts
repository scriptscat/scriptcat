import { SlidersHorizontal, Palette, RefreshCw, ArrowDownToLine, Cpu, Shield, Code } from "lucide-react";
import { t } from "@App/locales/locales";
import type { SettingsCategory } from "../../layout/SettingsLayout";

export const SETTING_CATEGORIES: SettingsCategory[] = [
  { id: "general", icon: SlidersHorizontal, label: t("settings:general") },
  { id: "interface", icon: Palette, label: t("settings:interface_settings") },
  { id: "sync", icon: RefreshCw, label: t("settings:script_sync") },
  { id: "update", icon: ArrowDownToLine, label: t("update") },
  { id: "runtime", icon: Cpu, label: t("logs:runtime") },
  { id: "security", icon: Shield, label: t("settings:security") },
  { id: "developer", icon: Code, label: t("settings:development_tools") },
];

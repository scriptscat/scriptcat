import { HardDrive, Cloud, CalendarClock, Database, Terminal, Bot } from "lucide-react";
import type { TFunction } from "i18next";
import type { SettingsCategory } from "../../layout/SettingsLayout";
import { EnableMCP } from "@App/app/const";
import { isFirefox } from "@App/pkg/utils/utils";

export function getToolsCategories(t: TFunction): SettingsCategory[] {
  return [
    { id: "local-backup", icon: HardDrive, label: t("tools:local_backup") },
    { id: "cloud-backup", icon: Cloud, label: t("tools:cloud_backup") },
    { id: "auto-backup", icon: CalendarClock, label: t("tools:auto_backup") },
    { id: "data-migration", icon: Database, label: t("tools:data_migration") },
    { id: "dev-tools", icon: Terminal, label: t("tools:development_tool") },
    // Firefox exposes chrome.runtime.connectNative too, but its MV3 event-page lifecycle differs
    // and the MCP bridge has not been built/tested against it — the card must not be offered
    // there, to avoid silently enabling an unsupported configuration.
    ...(EnableMCP && !isFirefox() ? [{ id: "mcp-bridge", icon: Bot, label: t("mcp:section_title") }] : []),
  ];
}

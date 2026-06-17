import type { ComponentType } from "react";
import {
  Package,
  Rss,
  ScrollText,
  Wrench,
  Settings,
  MessageSquare,
  Server,
  Sparkles,
  Plug,
  CalendarClock,
  FolderTree,
  SlidersHorizontal,
} from "lucide-react";
import { t } from "@App/locales/locales";

export interface NavItem {
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** 惰性取值,跟随运行时语言切换 */
  label: () => string;
}

/** 主导航项 */
export const mainNav: NavItem[] = [
  { to: "/", icon: Package, label: () => t("script:installed_scripts") },
  { to: "/subscribe", icon: Rss, label: () => t("script:subscribe") },
];

/** AI Agent 子导航项 */
export const agentNav: NavItem[] = [
  { to: "/agent/chat", icon: MessageSquare, label: () => t("agent:chat") },
  { to: "/agent/provider", icon: Server, label: () => t("agent:provider") },
  { to: "/agent/skills", icon: Sparkles, label: () => t("agent:skills") },
  { to: "/agent/mcp", icon: Plug, label: () => t("agent:mcp") },
  { to: "/agent/tasks", icon: CalendarClock, label: () => t("agent:tasks") },
  { to: "/agent/opfs", icon: FolderTree, label: () => t("agent:opfs") },
  { to: "/agent/settings", icon: SlidersHorizontal, label: () => t("agent:settings") },
];

/** 辅助导航项 */
export const auxNav: NavItem[] = [
  { to: "/logs", icon: ScrollText, label: () => t("logs") },
  { to: "/tools", icon: Wrench, label: () => t("tools") },
  { to: "/settings", icon: Settings, label: () => t("settings") },
];

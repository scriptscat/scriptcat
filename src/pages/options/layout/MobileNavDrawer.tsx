import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Bot, ChevronRight, LifeBuoy, Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { DocumentationSite } from "@App/app/const";
import { localePath, t } from "@App/locales/locales";
import { useTheme, type Theme } from "@App/pages/components/theme-provider";
import { mainNav, agentNav, auxNav, type NavItem } from "./nav-items";

/**
 * 移动端导航抽屉内容:1:1 镜像桌面 Sidebar(主导航 + AI Agent 分组 + 辅助导航 + 主题/帮助),
 * 由 MobileHeader 的 ☰ 通过 shadcn Sheet 拉出。选中任一项后通过 onNavigate 关闭抽屉。
 */
export default function MobileNavDrawer({ onNavigate }: { onNavigate?: () => void }) {
  // 默认展开 Agent 分组——本入口的核心目的就是让移动端可达整个 Agent 板块
  const [agentOpen, setAgentOpen] = useState(true);
  const isAgentActive = useLocation().pathname.startsWith("/agent");
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const order: Theme[] = ["light", "dark", "auto"];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };
  const themeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-2.5 h-14 shrink-0 px-4">
        <img src={chrome.runtime.getURL("assets/logo.png")} alt="ScriptCat" className="w-7 h-7 shrink-0" />
        <span className="text-[16px] font-semibold text-foreground truncate">{"ScriptCat"}</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-custom">
        {/* 主导航 + AI Agent 分组 */}
        <nav className="flex flex-col gap-0.5 px-2 py-1">
          {mainNav.map((item) => (
            <DrawerItem key={item.to} item={item} onNavigate={onNavigate} />
          ))}

          <button
            type="button"
            onClick={() => setAgentOpen((prev) => !prev)}
            aria-expanded={agentOpen}
            className={cn(
              "flex items-center gap-2.5 h-10 w-full rounded-md text-[14px] px-3 transition-colors",
              isAgentActive
                ? "text-sidebar-primary font-medium"
                : "text-fg-secondary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Bot className="w-[18px] h-[18px] shrink-0" />
            <span className="truncate flex-1 text-left">{t("agent:title")}</span>
            <ChevronRight className={cn("w-4 h-4 shrink-0 transition-transform", agentOpen && "rotate-90")} />
          </button>
          {agentOpen && (
            <div data-testid="drawer-agent-submenu" className="flex flex-col gap-0.5 mt-0.5">
              {agentNav.map((item) => (
                <DrawerSubItem key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </nav>

        {/* 分隔线 */}
        <div className="h-px bg-sidebar-border mx-4" />

        {/* 辅助导航 */}
        <nav className="flex flex-col gap-0.5 px-2 py-1">
          {auxNav.map((item) => (
            <DrawerItem key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </nav>
      </div>

      {/* 底部:主题切换 + 帮助 */}
      <div className="flex flex-col gap-0.5 px-2 pb-3 pt-2 shrink-0">
        <div className="h-px bg-sidebar-border mx-2 mb-1" />
        <DrawerButton icon={themeIcon} label={t("theme", { defaultValue: t("change_theme") })} onClick={cycleTheme} />
        <DrawerButton
          icon={LifeBuoy}
          label={t("helpcenter")}
          onClick={() => window.open(`${DocumentationSite}${localePath}/docs/use/use/`, "_blank")}
        />
      </div>
    </div>
  );
}

// ========== 顶层导航项 ==========
function DrawerItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 h-10 rounded-md text-[14px] px-3 transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-primary font-medium"
            : "text-fg-secondary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <item.icon className="w-[18px] h-[18px] shrink-0" />
      <span className="truncate">{item.label()}</span>
    </NavLink>
  );
}

// ========== AI Agent 子项 ==========
function DrawerSubItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 h-9 rounded-md text-[13px] pl-9 pr-3 transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-primary font-medium"
            : "text-fg-secondary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <item.icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.label()}</span>
    </NavLink>
  );
}

// ========== 底部按钮(主题/帮助) ==========
function DrawerButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 h-10 rounded-md text-[14px] px-3 text-fg-secondary transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

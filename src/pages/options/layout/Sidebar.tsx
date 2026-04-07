import { useState } from "react";
import { useHoverMenu } from "../../components/ui/use-hover-menu";
import { NavLink } from "react-router-dom";
import {
  Package,
  Rss,
  ScrollText,
  Wrench,
  Settings,
  LifeBuoy,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  Monitor,
  BookOpen,
  Link,
  FileCode,
  Store,
  MessageCircle,
} from "lucide-react";
import { GithubIcon } from "../../components/icons/GithubIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useTheme, type Theme } from "../../components/theme-provider";
import { DocumentationSite } from "@App/app/const";
import { localePath, t } from "@App/locales/locales";

/** 主导航项 */
const mainNav = [
  { to: "/", icon: Package, label: () => t("installed_scripts") },
  { to: "/subscribe", icon: Rss, label: () => t("subscribe") },
];

/** 辅助导航项 */
const auxNav = [
  { to: "/logs", icon: ScrollText, label: () => t("logs") },
  { to: "/tools", icon: Wrench, label: () => t("tools") },
  { to: "/settings", icon: Settings, label: () => t("settings") },
];

const SIDEBAR_KEY = "scriptcat-sidebar-collapsed";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "1");
  const { theme, setTheme } = useTheme();

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      localStorage.setItem(SIDEBAR_KEY, prev ? "0" : "1");
      return !prev;
    });
  };

  const cycleTheme = () => {
    const order: Theme[] = ["light", "dark", "auto"];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  const themeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <aside
      className={`flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-[width] duration-200 ${collapsed ? "w-14" : "w-[200px]"}`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 h-14 px-4 shrink-0">
        <img src={chrome.runtime.getURL("assets/logo.png")} alt="ScriptCat" className="w-7 h-7 shrink-0" />
        {!collapsed && <span className="text-[16px] font-semibold text-foreground truncate">{"ScriptCat"}</span>}
      </div>

      {/* 主导航 */}
      <nav className="flex flex-col gap-0.5 px-2 py-1">
        {mainNav.map((item) => (
          <SidebarItem key={item.to} {...item} label={item.label()} collapsed={collapsed} />
        ))}
      </nav>

      {/* 分隔线 */}
      <div className="h-px bg-sidebar-border mx-4" />

      {/* 辅助导航 */}
      <nav className="flex flex-col gap-0.5 px-2 py-1">
        {auxNav.map((item) => (
          <SidebarItem key={item.to} {...item} label={item.label()} collapsed={collapsed} />
        ))}
      </nav>

      {/* 弹性空间 */}
      <div className="flex-1" />

      {/* 底部区域 */}
      <div className="flex flex-col gap-0.5 px-2 pb-3 pt-2">
        <div className="h-px bg-sidebar-border mx-2 mb-1" />
        <SidebarButton
          icon={themeIcon}
          label={t("theme", { defaultValue: "主题切换" })}
          collapsed={collapsed}
          onClick={cycleTheme}
        />
        <HelpMenu collapsed={collapsed} />
        <SidebarButton
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? t("show_main_sidebar") : t("hide_main_sidebar")}
          collapsed={collapsed}
          onClick={toggleCollapse}
        />
      </div>
    </aside>
  );
}

// ========== 导航项 ==========
function SidebarItem({
  to,
  icon: Icon,
  label,
  collapsed,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-2.5 h-9 rounded-md text-[14px] transition-colors ${
          collapsed ? "justify-center px-0" : "px-3"
        } ${
          isActive
            ? "bg-sidebar-accent text-sidebar-primary font-medium"
            : "text-fg-secondary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }`
      }
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

// ========== 帮助中心菜单（hover 触发） ==========
function HelpMenu({ collapsed }: { collapsed: boolean }) {
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu();

  const openUrl = (url: string) => {
    close();
    window.open(url, "_blank");
  };

  return (
    <DropdownMenu {...rootProps}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          {...hoverProps}
          className={`flex items-center gap-2.5 h-9 rounded-md text-[14px] text-fg-secondary transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? "justify-center px-0" : "px-3"
          }`}
        >
          <LifeBuoy className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span className="truncate">{t("helpcenter")}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-48" {...contentProps}>
        {/* 外部链接 */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Link className="w-4 h-4" />
            {t("external_links")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent {...hoverProps}>
            <DropdownMenuItem onClick={() => openUrl(`${DocumentationSite}${localePath}/docs/dev/`)}>
              <FileCode className="w-4 h-4" />
              {t("api_docs")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openUrl("https://learn.scriptcat.org/docs/%E7%AE%80%E4%BB%8B/")}>
              <FileCode className="w-4 h-4" />
              {t("development_guide")}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Store className="w-4 h-4" />
                {t("script_gallery")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent {...hoverProps}>
                <DropdownMenuItem onClick={() => openUrl("https://scriptcat.org/search")}>
                  {"ScriptCat"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openUrl("https://greasyfork.org/scripts")}>
                  {"Greasy Fork"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openUrl("https://openuserjs.org/")}>{"OpenUserJS"}</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => openUrl("https://bbs.tampermonkey.net.cn/")}>
              <MessageCircle className="w-4 h-4" />
              {t("community_forum")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openUrl("https://github.com/scriptscat/scriptcat")}>
              <GithubIcon className="w-4 h-4" />
              {"GitHub"}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {/* 使用指南 */}
        <DropdownMenuItem onClick={() => openUrl(`${DocumentationSite}${localePath}/docs/use/use/`)}>
          <BookOpen className="w-4 h-4" />
          {t("user_guide")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ========== 底部按钮 ==========
function SidebarButton({
  icon: Icon,
  label,
  collapsed,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 h-9 rounded-md text-[14px] text-fg-secondary transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
        collapsed ? "justify-center px-0" : "px-3"
      }`}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

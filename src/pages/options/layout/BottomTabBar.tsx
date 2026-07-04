import { NavLink } from "react-router-dom";
import { Package, Rss, ScrollText, Wrench, Settings } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

const tabs = [
  { to: "/", icon: Package, label: (t: TFunction) => t("script:nav_scripts"), end: true },
  { to: "/subscribe", icon: Rss, label: (t: TFunction) => t("script:subscribe"), end: false },
  { to: "/logs", icon: ScrollText, label: (t: TFunction) => t("logs"), end: false },
  { to: "/tools", icon: Wrench, label: (t: TFunction) => t("tools"), end: false },
  { to: "/settings", icon: Settings, label: (t: TFunction) => t("settings"), end: false },
];

export default function BottomTabBar() {
  const { t } = useTranslation();
  return (
    <nav
      data-testid="bottom-tab-bar"
      className="flex items-stretch justify-around shrink-0 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          {...(to === "/subscribe" ? { "data-tour": "tab-subscribe" } : {})}
          className={({ isActive }) =>
            cn(
              "relative flex flex-col items-center justify-center gap-1 flex-1 py-2 text-[10px] transition-colors",
              isActive ? "text-primary font-medium" : "text-muted-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              {/* 非颜色提示:激活项顶部的 primary 指示条(§9/§10,颜色不可单独承载状态) */}
              {isActive && (
                <span
                  data-testid="tab-active-indicator"
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
                />
              )}
              <Icon className="w-[22px] h-[22px]" />
              <span>{label(t)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

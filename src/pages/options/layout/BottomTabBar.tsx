import { NavLink } from "react-router-dom";
import { Package, Rss, ScrollText, Wrench, Settings } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { t } from "@App/locales/locales";

const tabs = [
  { to: "/", icon: Package, label: () => t("script:nav_scripts"), end: true },
  { to: "/subscribe", icon: Rss, label: () => t("script:subscribe"), end: false },
  { to: "/logs", icon: ScrollText, label: () => t("logs"), end: false },
  { to: "/tools", icon: Wrench, label: () => t("tools"), end: false },
  { to: "/settings", icon: Settings, label: () => t("settings"), end: false },
];

export default function BottomTabBar() {
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
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 flex-1 py-2 text-[10px] transition-colors",
              isActive ? "text-primary font-medium" : "text-muted-foreground"
            )
          }
        >
          <Icon className="w-[22px] h-[22px]" />
          <span>{label()}</span>
        </NavLink>
      ))}
    </nav>
  );
}

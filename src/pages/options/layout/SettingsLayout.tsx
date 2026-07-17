// src/pages/options/layout/SettingsLayout.tsx
import { useEffect, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import { cn } from "@App/pkg/utils/cn";
import { useScrollSpy } from "../hooks/useScrollSpy";
import { useIsMobile } from "@App/pages/components/use-is-mobile";

export interface SettingsCategory {
  id: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

export interface SettingsLayoutProps {
  title: string;
  categories: SettingsCategory[];
  children: (register: (id: string) => (el: HTMLElement | null) => void) => ReactNode;
}

// 激活/未激活配色,左侧竖栏与移动横向栏共用
const navItemColors = (active: boolean) =>
  active ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-accent hover:text-foreground";

export function SettingsLayout({ title, categories, children }: SettingsLayoutProps) {
  const ids = useMemo(() => categories.map((c) => c.id), [categories]);
  const { activeId, register, scrollContainerRef, scrollTo } = useScrollSpy(ids);
  const isMobile = useIsMobile();
  const activeChipRef = useRef<HTMLButtonElement>(null);

  // 移动横向栏:激活分类滚动到可视区域(仅横向,不影响页面纵向滚动)
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeId]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center h-14 px-6 border-b border-border shrink-0 bg-card">
        <span className="text-base font-semibold text-foreground">{title}</span>
      </div>

      {/* 移动端:标题下方横向滚动分类栏 */}
      {isMobile && (
        <nav className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2 shrink-0 scrollbar-custom">
          {categories.map((c) => {
            const Icon = c.icon;
            const active = c.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                ref={active ? activeChipRef : undefined}
                onClick={() => scrollTo(c.id)}
                className={cn(
                  "flex items-center gap-1.5 h-10 px-3 rounded-full text-sm whitespace-nowrap shrink-0 transition-colors",
                  navItemColors(active)
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{c.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="flex flex-1 min-h-0">
        {/* 桌面端:左侧竖向分类导航 */}
        {!isMobile && (
          <nav className="w-[220px] shrink-0 border-r border-border p-2.5 flex flex-col gap-0.5 overflow-y-auto bg-card">
            {categories.map((c) => {
              const Icon = c.icon;
              const active = c.id === activeId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => scrollTo(c.id)}
                  className={cn(
                    "flex items-center gap-2.5 h-9 px-3 rounded-md text-sm text-left transition-colors",
                    navItemColors(active)
                  )}
                >
                  <Icon className="w-[17px] h-[17px] shrink-0" />
                  <span className="truncate">{c.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* 滚动容器始终渲染(切换断点不重挂载,避免 scroll-spy 的 IO root 失效) */}
        <div ref={scrollContainerRef} data-testid="setting-page" className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-[920px] mx-auto flex flex-col gap-5 px-4 md:px-8 pt-4 md:pt-6 pb-10">
            {children(register)}
          </div>
        </div>
      </div>
    </div>
  );
}

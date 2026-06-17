// src/pages/options/layout/SettingsLayout.tsx
import React from "react";
import { cn } from "@App/pkg/utils/cn";
import { useScrollSpy } from "../hooks/useScrollSpy";

export interface SettingsCategory {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

export interface SettingsLayoutProps {
  title: string;
  categories: SettingsCategory[];
  children: (register: (id: string) => (el: HTMLElement | null) => void) => React.ReactNode;
}

export function SettingsLayout({ title, categories, children }: SettingsLayoutProps) {
  const ids = React.useMemo(() => categories.map((c) => c.id), [categories]);
  const { activeId, register, scrollContainerRef, scrollTo } = useScrollSpy(ids);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center h-14 px-6 border-b border-border shrink-0">
        <span className="text-base font-semibold text-foreground">{title}</span>
      </div>
      <div className="flex flex-1 min-h-0">
        <nav className="w-[220px] shrink-0 border-r border-border p-2.5 flex flex-col gap-0.5 overflow-y-auto">
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
                  active
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="w-[17px] h-[17px] shrink-0" />
                <span className="truncate">{c.label}</span>
              </button>
            );
          })}
        </nav>
        <div ref={scrollContainerRef} className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-[920px] mx-auto flex flex-col gap-5 px-8 pt-6 pb-10">{children(register)}</div>
        </div>
      </div>
    </div>
  );
}

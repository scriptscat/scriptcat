import type React from "react";
import type { LucideIcon } from "lucide-react";
import { Surface } from "@App/pages/components/ui/surface";

export function SettingCard({
  id,
  title,
  titleAction,
  description,
  icon: Icon,
  action,
  register,
  children,
}: {
  id: string;
  title: string;
  titleAction?: React.ReactNode;
  description?: string;
  /** Optional leading icon rendered in a tinted box before the title (design: 外部接入 卡片头). */
  icon?: LucideIcon;
  /** Optional control pinned to the far right of the header row (e.g. an enable switch). */
  action?: React.ReactNode;
  register: (id: string) => (el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section ref={register(id)} data-spy-id={id} className="scroll-mt-6">
      <Surface padding="none">
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
                <Icon className="size-5 text-primary" />
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
                {titleAction}
              </div>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        <div className="flex flex-col gap-3.5 px-5 pt-3.5 pb-[18px]">{children}</div>
      </Surface>
    </section>
  );
}

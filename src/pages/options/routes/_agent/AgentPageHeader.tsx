import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Agent 管理页统一 64px 页头：图标块 + 标题/副标题 + 右侧操作区
export function AgentPageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-7">
      <div className="flex items-center gap-3">
        <div className="flex size-[34px] items-center justify-center rounded-[9px] bg-primary/10">
          <Icon className="size-[18px] text-primary" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-semibold text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Agent 管理页空状态：居中图标块 + 标题 + 说明 + 主操作（带边框圆角卡片）
export function AgentEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-background px-8 py-16"
    >
      <div className="flex size-[72px] items-center justify-center rounded-[20px] bg-primary/10">
        <Icon className="size-[34px] text-primary" />
      </div>
      <div className="flex max-w-[380px] flex-col items-center gap-1.5">
        <p className="text-[17px] font-semibold text-foreground">{title}</p>
        <p className="text-center text-[13px] leading-relaxed text-fg-secondary">{description}</p>
      </div>
      {action}
    </div>
  );
}

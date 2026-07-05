import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { StateScreen } from "@App/pages/components/ui/state-screen";

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
    <StateScreen
      data-testid="empty-state"
      icon={Icon}
      tone="primary"
      variant="card"
      compact
      className="px-8 py-16"
      title={title}
      description={description}
      action={action}
    />
  );
}

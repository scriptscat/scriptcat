import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@App/pkg/utils/cn";

type DotTone = "success" | "error" | "muted";

const DOT_TONES: Record<DotTone, { pill: string; dot: string }> = {
  success: { pill: "bg-success-bg text-success-fg", dot: "bg-success" },
  error: { pill: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  muted: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

// 状态圆点胶囊：连接/运行状态等
export function StatusDot({ tone, children }: { tone: DotTone; children: ReactNode }) {
  const t = DOT_TONES[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", t.pill)}>
      <span className={cn("size-1.5 rounded-full", t.dot)} />
      {children}
    </span>
  );
}

type CapTone = "blue" | "green" | "violet" | "orange" | "muted";

const CAP_TONES: Record<CapTone, string> = {
  blue: "bg-primary/10 text-primary",
  green: "bg-success-bg text-success-fg",
  violet: "bg-skill-bg text-skill-fg",
  orange: "bg-warning-bg text-warning-fg",
  muted: "bg-muted text-muted-foreground",
};

// 能力/属性小标签：视觉/图像/工具数等
export function CapabilityTag({
  tone,
  icon: Icon,
  children,
}: {
  tone: CapTone;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", CAP_TONES[tone])}
    >
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  );
}

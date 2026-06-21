import type React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { Surface } from "./surface";

type StateScreenTone = "primary" | "muted" | "success" | "warning" | "error";
type StateScreenVariant = "plain" | "card";

const toneClass: Record<StateScreenTone, { ring: string; icon: string; detail?: string }> = {
  primary: { ring: "bg-primary-light", icon: "text-primary" },
  muted: { ring: "bg-muted", icon: "text-muted-foreground" },
  success: { ring: "bg-success-bg", icon: "text-success-fg" },
  warning: { ring: "bg-warning-bg", icon: "text-warning-fg" },
  error: {
    ring: "bg-destructive/10",
    icon: "text-destructive",
    detail: "border-destructive/30 bg-destructive/5 text-destructive",
  },
};

type StateScreenProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  detail?: React.ReactNode;
  detailTestId?: string;
  detailClassName?: string;
  progress?: React.ReactNode;
  tone?: StateScreenTone;
  variant?: StateScreenVariant;
  compact?: boolean;
  iconClassName?: string;
};

function StateScreen({
  icon: Icon,
  title,
  description,
  action,
  detail,
  detailTestId,
  detailClassName,
  progress,
  tone = "muted",
  variant = "plain",
  compact = false,
  iconClassName,
  className,
  ...props
}: StateScreenProps) {
  const toneStyle = toneClass[tone];
  const body = (
    <div
      role="status"
      aria-label={typeof title === "string" ? title : undefined}
      data-slot="state-screen"
      className={cn(
        "flex min-h-0 flex-col items-center justify-center text-center",
        compact ? "gap-3 py-12" : "gap-4 py-20",
        className
      )}
      {...props}
    >
      {Icon && (
        <span
          className={cn(
            "flex items-center justify-center rounded-full",
            compact ? "size-14" : "size-[72px]",
            toneStyle.ring
          )}
        >
          <Icon className={cn(compact ? "size-7" : "size-10", toneStyle.icon, iconClassName)} aria-hidden="true" />
        </span>
      )}
      <div className="flex max-w-[460px] flex-col items-center gap-1.5">
        <p className={cn(compact ? "text-base" : "text-2xl", "font-semibold text-foreground")}>{title}</p>
        {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {detail && (
        <pre
          data-testid={detailTestId}
          className={cn(
            "max-w-[460px] overflow-auto rounded-lg border px-3.5 py-2.5 text-left font-mono text-xs whitespace-pre-wrap",
            toneStyle.detail ?? "border-border bg-muted/40 text-fg-secondary",
            detailClassName
          )}
        >
          {detail}
        </pre>
      )}
      {progress}
      {action}
    </div>
  );

  if (variant === "card") {
    return (
      <Surface padding="none" className="bg-background">
        {body}
      </Surface>
    );
  }

  return body;
}

export { StateScreen };
export type { StateScreenProps, StateScreenTone, StateScreenVariant };

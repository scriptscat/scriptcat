import type React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";

type EmptyStateProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
};

function EmptyState({ icon: Icon, title, description, action, compact = false, className, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-20 text-muted-foreground" : "gap-3 py-20",
        className
      )}
      {...props}
    >
      {Icon && (
        <Icon
          className={cn(compact ? "size-8 text-muted-foreground/50" : "size-10 text-muted-foreground/60")}
          aria-hidden="true"
        />
      )}
      <div className={cn("flex flex-col", compact ? "gap-0" : "gap-1")}>
        <p className={cn(compact ? "text-sm text-muted-foreground" : "text-sm font-medium text-foreground")}>{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export { EmptyState };

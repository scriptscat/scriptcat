import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";

type LoadingStateProps = React.HTMLAttributes<HTMLDivElement> & {
  label: string;
  showLabel?: boolean;
  iconClassName?: string;
};

function LoadingState({ label, showLabel = true, className, iconClassName, ...props }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-label={label}
      data-slot="loading-state"
      className={cn("flex items-center justify-center py-20 text-muted-foreground", className)}
      {...props}
    >
      <Loader2 className={cn("size-5 animate-spin", showLabel && "mr-2", iconClassName)} aria-hidden="true" />
      {showLabel && <span className="text-sm">{label}</span>}
    </div>
  );
}

export { LoadingState };

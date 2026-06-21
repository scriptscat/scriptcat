import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type TooltipIconButtonProps = Omit<React.ComponentProps<typeof Button>, "children" | "aria-label"> & {
  label: string;
  icon: LucideIcon;
  tooltip?: React.ReactNode;
  loading?: boolean;
  active?: boolean;
  destructive?: boolean;
};

function TooltipIconButton({
  label,
  icon: Icon,
  tooltip,
  loading = false,
  active = false,
  destructive = false,
  disabled,
  className,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: TooltipIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          aria-label={label}
          aria-pressed={active || undefined}
          disabled={disabled || loading}
          className={cn(
            active && "bg-accent text-accent-foreground",
            destructive && "hover:text-destructive focus-visible:text-destructive",
            className
          )}
          {...props}
        >
          {loading ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Icon data-icon="inline-start" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}

export { TooltipIconButton };
export type { TooltipIconButtonProps };

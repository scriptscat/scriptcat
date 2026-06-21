import type React from "react";
import { cn } from "@App/pkg/utils/cn";
import { Card } from "./card";

function DataPanel({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      data-slot="data-panel"
      className={cn("gap-0 overflow-hidden py-0 text-card-foreground shadow-none", className)}
      {...props}
    />
  );
}

function DataPanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="data-panel-header"
      className={cn(
        "flex items-center gap-3 bg-background px-4 py-2.5 text-xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function DataPanelRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="data-panel-row"
      className={cn("flex items-center gap-3 border-t border-border px-4 py-2.5 text-xs", className)}
      {...props}
    />
  );
}

function DataPanelEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="data-panel-empty"
      className={cn("border-t border-border px-4 py-10 text-center text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export { DataPanel, DataPanelHeader, DataPanelRow, DataPanelEmpty };

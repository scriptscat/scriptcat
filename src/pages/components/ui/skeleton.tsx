import type React from "react";
import { cn } from "@App/pkg/utils/cn";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="skeleton" className={cn("block animate-pulse rounded bg-muted", className)} {...props} />;
}

export { Skeleton };

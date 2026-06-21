import type React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@App/pkg/utils/cn";
import { Surface } from "@App/pages/components/ui/surface";

const agentEntityCardVariants = cva("border-border bg-card", {
  variants: {
    layout: {
      stack: "flex flex-col gap-3",
      row: "flex items-center gap-3.5",
    },
    density: {
      compact: "p-3.5",
      default: "p-[18px]",
    },
    disabled: {
      true: "opacity-60",
      false: "",
    },
  },
  defaultVariants: {
    layout: "stack",
    density: "default",
    disabled: false,
  },
});

type AgentEntityCardProps = React.ComponentProps<typeof Surface> & VariantProps<typeof agentEntityCardVariants>;

function AgentEntityCard({ className, layout, density, disabled, ...props }: AgentEntityCardProps) {
  return (
    <Surface
      data-slot="agent-entity-card"
      data-disabled={disabled ? "true" : undefined}
      padding="none"
      className={cn(agentEntityCardVariants({ layout, density, disabled }), className)}
      {...props}
    />
  );
}

export { AgentEntityCard, agentEntityCardVariants };
export type { AgentEntityCardProps };

import type React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@App/pkg/utils/cn";
import { Card } from "./card";

const surfaceVariants = cva("gap-0 py-0 text-card-foreground shadow-none", {
  variants: {
    padding: {
      none: "p-0",
      compact: "p-3.5",
      default: "p-4",
      spacious: "p-5",
    },
    interactive: {
      true: "transition-shadow hover:shadow-md",
      false: "",
    },
    disabled: {
      true: "opacity-60",
      false: "",
    },
  },
  defaultVariants: {
    padding: "default",
    interactive: false,
    disabled: false,
  },
});

type SurfaceProps = React.ComponentProps<typeof Card> & VariantProps<typeof surfaceVariants>;

function Surface({ className, padding, interactive, disabled, ...props }: SurfaceProps) {
  return (
    <Card
      data-slot="surface"
      className={cn(surfaceVariants({ padding, interactive, disabled }), className)}
      {...props}
    />
  );
}

export { Surface, surfaceVariants };

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@App/pkg/utils/cn";

const progressVariants = cva("w-full shrink-0 overflow-hidden", {
  variants: {
    variant: {
      default: "h-1.5 rounded-full bg-muted",
      top: "h-0.5 bg-primary/15",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const indicatorVariants = cva("h-full bg-primary", {
  variants: {
    variant: {
      default: "rounded-full",
      top: "",
    },
    indeterminate: {
      true: "w-1/3 animate-indeterminate-bar",
      false: "transition-[width] duration-200 ease-out",
    },
  },
  defaultVariants: {
    variant: "default",
    indeterminate: false,
  },
});

type ProgressProps = Omit<React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>, "value" | "max"> &
  VariantProps<typeof progressVariants> & {
    value?: number;
    max?: number;
    indeterminate?: boolean;
    indicatorTestId?: string;
    indicatorClassName?: string;
    indicatorProps?: React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Indicator>;
  };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  (
    {
      className,
      indicatorClassName,
      value,
      max = 100,
      indeterminate = false,
      variant = "default",
      indicatorTestId,
      indicatorProps,
      ...props
    },
    ref
  ) => {
    const normalizedMax = max > 0 ? max : 100;
    const normalizedValue = !indeterminate && typeof value === "number" ? clamp(value, 0, normalizedMax) : undefined;
    const indicatorWidth =
      normalizedValue === undefined ? undefined : `${Math.round((normalizedValue / normalizedMax) * 100)}%`;

    return (
      <ProgressPrimitive.Root
        ref={ref}
        data-slot="progress"
        value={indeterminate ? null : normalizedValue}
        max={normalizedMax}
        className={cn(progressVariants({ variant }), className)}
        {...props}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          data-testid={indicatorTestId ?? "progress-indicator"}
          {...indicatorProps}
          className={cn(indicatorVariants({ variant, indeterminate }), indicatorClassName, indicatorProps?.className)}
          style={indeterminate ? undefined : { width: indicatorWidth ?? "0%" }}
        />
      </ProgressPrimitive.Root>
    );
  }
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };

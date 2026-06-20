import * as React from "react";
import { cn } from "@App/pkg/utils/cn";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

type SegmentedControlOption<TValue extends string> = {
  value: TValue;
  label: React.ReactNode;
  disabled?: boolean;
  testId?: string;
};

type SegmentedControlProps<TValue extends string> = {
  value: TValue;
  options: SegmentedControlOption<TValue>[];
  onValueChange: (value: TValue) => void;
  "aria-label": string;
  className?: string;
  itemClassName?: string;
};

function SegmentedControl<TValue extends string>({
  value,
  options,
  onValueChange,
  className,
  itemClassName,
  "aria-label": ariaLabel,
}: SegmentedControlProps<TValue>) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as TValue);
      }}
      aria-label={ariaLabel}
      className={cn("w-full gap-1 rounded-[9px] bg-muted p-[3px]", className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          data-testid={option.testId}
          disabled={option.disabled}
          className={cn(
            "h-[30px] flex-1 rounded-[7px] px-2 text-[13px] font-normal text-muted-foreground shadow-none hover:text-foreground data-[state=on]:bg-card data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:shadow-sm",
            itemClassName
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export { SegmentedControl };
export type { SegmentedControlOption, SegmentedControlProps };

import type React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@App/pkg/utils/cn";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "default" | "sm";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary-background data-[state=unchecked]:bg-switch-off",
        size === "default" && "h-5 w-9",
        size === "sm" && "h-[18px] w-8",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-thumb shadow-md ring-0 transition-transform",
          size === "default" && "h-4 w-4 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
          size === "sm" && "h-3.5 w-3.5 data-[state=checked]:translate-x-3.5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

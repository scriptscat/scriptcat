import type React from "react";
import { Search } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { Input } from "./input";

type SearchInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  containerClassName?: string;
  trailing?: React.ReactNode;
  inputClassName?: string;
};

function SearchInput({ className, containerClassName, inputClassName, trailing, ...props }: SearchInputProps) {
  return (
    <div
      data-slot="search-input"
      className={cn(
        "flex h-9 min-w-0 items-center gap-2 rounded-md bg-muted/50 px-3 focus-within:ring-1 focus-within:ring-ring/50",
        className,
        containerClassName
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Input
        role="searchbox"
        type="search"
        className={cn(
          "h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0",
          inputClassName
        )}
        {...props}
      />
      {trailing}
    </div>
  );
}

export { SearchInput };

import type React from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { Input } from "./input";

type SearchInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "ref"> & {
  containerClassName?: string;
  trailing?: React.ReactNode;
  inputClassName?: string;
  /** 提供时，有内容即显示清除按钮；点击后调用并把焦点还给输入框 */
  onClear?: () => void;
};

function SearchInput({ className, containerClassName, inputClassName, trailing, onClear, ...props }: SearchInputProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasValue = props.value != null && String(props.value) !== "";

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
        ref={inputRef}
        role="searchbox"
        type="search"
        className={cn(
          // 原生 type=search 的取消按钮不走设计令牌（Chrome 下是饱和蓝），统一隐藏，由下方清除按钮替代；Esc 清空仍由浏览器原生处理
          "h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 [&::-webkit-search-cancel-button]:appearance-none",
          inputClassName
        )}
        {...props}
      />
      {onClear && hasValue && (
        <button
          type="button"
          aria-label={t("common:clear_search")}
          onClick={() => {
            onClear();
            inputRef.current?.focus();
          }}
          className="-mx-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
      {trailing}
    </div>
  );
}

export { SearchInput };

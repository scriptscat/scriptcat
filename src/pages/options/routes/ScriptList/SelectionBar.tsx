import { useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";

export interface SelectionBarProps {
  selectedCount: number;
  onClose: () => void;
  /** 栏中间的操作按钮，用 SelectionBarButton 渲染 */
  children: React.ReactNode;
}

/**
 * 多选态操作栏外壳：撑开时把同一 h-11 窗口内位于其下方的筛选行顶出可视区，
 * 因此调用方须把本组件与筛选行一起放进 `h-11 overflow-hidden` 的容器。
 */
export default function SelectionBar({ selectedCount, onClose, children }: SelectionBarProps) {
  const { t } = useTranslation();
  const isOpen = selectedCount > 0;
  const [mounted, setMounted] = useState(false);

  // 打开时立即标记为已挂载以触发展开动画。渲染期对比上一个值再 setState（React 会丢弃本次输出并立即重渲，
  // 不会提交到 DOM/产生级联渲染），等价于原先 useEffect 里的同步 setMounted(true)，但符合 react-hooks 规则。
  if (isOpen && !mounted) {
    setMounted(true);
  }

  return (
    <div
      className={cn(
        "flex items-center overflow-hidden gap-3 px-6 shrink-0 bg-primary/[0.08] border-b border-primary/20",
        !mounted ? "h-0" : isOpen ? "h-11 animate-expand-bar" : "h-11 animate-collapse-bar",
        mounted ? "visible" : "collapse"
      )}
      onAnimationEnd={() => {
        if (!isOpen) setMounted(false);
      }}
    >
      <span className="text-[13px] font-medium text-primary">{t("batch_selected", { count: selectedCount })}</span>

      <div className="flex-1" />

      {children}

      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent/50 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface SelectionBarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color: "primary" | "muted" | "destructive";
}

// 透传 props + ref：使其可直接作为 Popconfirm（Radix asChild）的 trigger，无需外包 div
export const SelectionBarButton = ({
  color,
  children,
  className,
  ref,
  ...rest
}: SelectionBarButtonProps & { ref?: React.Ref<HTMLButtonElement> }) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium border transition-colors hover:bg-accent/50",
      color === "primary" && "border-primary text-primary",
      color === "destructive" && "border-destructive text-destructive",
      color === "muted" && "border-muted-foreground/50 text-muted-foreground",
      className
    )}
    {...rest}
  >
    {children}
  </button>
);

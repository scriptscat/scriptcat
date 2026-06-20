import { useEffect, useState, forwardRef } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";

export interface BatchActionsBarProps {
  selectedCount: number;
  onBatchEnable: () => void;
  onBatchDisable: () => void;
  onBatchExport: () => void;
  onBatchDelete: () => void;
  onBatchPinTop: () => void;
  onBatchCheckUpdate: () => void;
  onClose: () => void;
}

export default function BatchActionsBar({
  selectedCount,
  onBatchEnable,
  onBatchDisable,
  onBatchExport,
  onBatchDelete,
  onBatchPinTop,
  onBatchCheckUpdate,
  onClose,
}: BatchActionsBarProps) {
  const { t } = useTranslation();
  const isOpen = selectedCount > 0;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  return (
    <div
      className={cn(
        "flex items-center overflow-hidden gap-3 px-6 shrink-0 bg-primary/[0.08] border-b border-primary/20",
        !mounted ? "h-0" : isOpen ? "h-11 animate-expand-bar" : "h-11 animate-collapse-bar",
        mounted ? "visble" : "collapse"
      )}
      onAnimationEnd={() => {
        if (!isOpen) setMounted(false);
      }}
    >
      {/* 选中计数 */}
      <span className="text-[13px] font-medium text-primary">{t("batch_selected", { count: selectedCount })}</span>

      <div className="flex-1" />

      {/* 操作按钮 */}
      <BatchBtn color="primary" onClick={onBatchEnable}>
        {t("enable")}
      </BatchBtn>
      <BatchBtn color="muted" onClick={onBatchDisable}>
        {t("disable")}
      </BatchBtn>
      <BatchBtn color="muted" onClick={onBatchExport}>
        {t("export")}
      </BatchBtn>
      <Popconfirm
        description={t("script:confirm_delete_scripts_content", { count: selectedCount })}
        destructive
        confirmText={t("delete")}
        cancelText={t("editor:cancel")}
        onConfirm={onBatchDelete}
      >
        <BatchBtn color="destructive">{t("delete")}</BatchBtn>
      </Popconfirm>
      <BatchBtn color="muted" onClick={onBatchPinTop}>
        {t("pin_to_top")}
      </BatchBtn>
      <BatchBtn color="muted" onClick={onBatchCheckUpdate}>
        {t("check_update")}
      </BatchBtn>

      {/* 关闭按钮 */}
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

interface BatchBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color: "primary" | "muted" | "destructive";
}

// forwardRef + 透传 props：使其可直接作为 Popconfirm（Radix asChild）的 trigger，无需外包 div
const BatchBtn = forwardRef<HTMLButtonElement, BatchBtnProps>(({ color, children, className, ...rest }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-medium border transition-colors hover:bg-accent/50",
      color === "primary" && "border-primary text-primary",
      color === "destructive" && "border-destructive text-destructive",
      color === "muted" && "border-muted-foreground/50 text-muted-foreground",
      className
    )}
    {...rest}
  >
    {children}
  </button>
));
BatchBtn.displayName = "BatchBtn";

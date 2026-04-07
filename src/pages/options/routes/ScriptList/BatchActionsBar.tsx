import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { t } from "@App/locales/locales";

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
  const isOpen = selectedCount > 0;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 h-11 px-6 shrink-0 bg-primary/[0.08] border-b border-primary/20",
        isOpen ? "animate-expand-bar" : "animate-collapse-bar"
      )}
      onAnimationEnd={() => {
        if (!isOpen) setMounted(false);
      }}
    >
      {/* 选中计数 */}
      <span className="text-[13px] font-medium text-primary">
        {t("batch_selected", { count: selectedCount, defaultValue: `已选择 ${selectedCount} 项` })}
      </span>

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
      <BatchBtn color="destructive" onClick={onBatchDelete}>
        {t("delete")}
      </BatchBtn>
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
        className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent/50 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function BatchBtn({
  color,
  onClick,
  children,
}: {
  color: "primary" | "muted" | "destructive";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-medium border transition-colors hover:bg-accent/50",
        color === "primary" && "border-primary text-primary",
        color === "destructive" && "border-destructive text-destructive",
        color === "muted" && "border-muted-foreground/50 text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";

export interface InstallErrorBarProps {
  message: string;
  onRetry?: () => void;
}

/**
 * 贴在吸底操作栏正上方的安装失败条。失败时用户必须留在页面上做决定，
 * 所以失败原因和重试入口都得常驻可读，不能交给会自动消失的飘窗。
 */
export function InstallErrorBar({ message, onRetry }: InstallErrorBarProps) {
  const { t } = useTranslation(["install", "common"]);

  return (
    <div
      data-testid="install-error-bar"
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-destructive/30 bg-destructive/10 px-8 py-2.5"
    >
      <TriangleAlert className="size-[18px] shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] font-semibold text-destructive">{t("install:failed")}</span>
        <span data-testid="install-error-bar-message" className="text-xs break-all text-destructive/90">
          {message}
        </span>
      </div>
      {onRetry && (
        <Button data-testid="install-error-retry" size="sm" variant="destructive" onClick={onRetry}>
          {t("install:error_retry")}
        </Button>
      )}
    </div>
  );
}

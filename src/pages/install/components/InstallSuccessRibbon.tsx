import { useTranslation } from "react-i18next";
import { CircleCheckBig, SquarePen } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";

export interface InstallSuccessRibbonProps {
  name: string;
  version?: string;
  /** 脚本的启用状态；订阅与技能没有这个概念时省略，成功条便不显示该段 */
  enabled?: boolean;
  kind: "install" | "update" | "subscribe";
  /** 仅脚本提供：在相邻新标签里打开编辑器 */
  onOpenEditor?: () => void;
  onClose: () => void;
}

/**
 * 安装成功后顶栏下方的常驻成功条。用户是主动点的安装，确认必须留在页面里可读、可继续操作，
 * 而不是从屏幕角落飞出一张会自己消失、还会压住吸底操作栏的飘窗（#1669）。
 */
export function InstallSuccessRibbon({
  name,
  version,
  enabled,
  kind,
  onOpenEditor,
  onClose,
}: InstallSuccessRibbonProps) {
  const { t } = useTranslation(["install", "common"]);
  const title =
    kind === "subscribe"
      ? t("install:result_subscribed", { name })
      : kind === "update"
        ? t("install:result_updated", { name })
        : t("install:result_installed", { name });

  return (
    <div
      data-testid="install-success-ribbon"
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-success/40 bg-success-bg px-6 py-2.5"
    >
      <CircleCheckBig className="size-[18px] shrink-0 text-success-fg" aria-hidden="true" />
      <span className="min-w-0 truncate text-[13px] font-semibold text-success-fg">{title}</span>
      {version && (
        <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 font-mono text-xs text-success-fg">
          {`v${version}`}
        </span>
      )}
      {enabled !== undefined && (
        <span data-testid="install-success-ribbon-state" className="shrink-0 text-xs text-success-fg/90">
          {`· ${enabled ? t("install:enabled_label") : t("install:disabled_label")}`}
        </span>
      )}
      <div className="flex items-center gap-2 max-md:w-full max-md:justify-end md:ml-auto">
        {onOpenEditor && (
          <Button
            data-testid="install-success-open-editor"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onOpenEditor}
          >
            <SquarePen className="size-4" />
            {t("install:result_open_editor")}
          </Button>
        )}
        <Button data-testid="install-success-close" size="sm" variant="outline" onClick={onClose}>
          {t("common:close")}
        </Button>
      </div>
    </div>
  );
}

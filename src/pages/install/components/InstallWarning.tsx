import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";

export interface InstallWarningProps {
  /** 是否声明了危险权限(如 @connect *) */
  hasDangerPermission: boolean;
  /** 是否声明了已知反特性(推广链接/广告/挖矿等) */
  hasAntifeature: boolean;
}

/**
 * 安全警示条(对照设计稿 Alert Warning):标题「请确认脚本来自可信来源」+ 说明,
 * 当声明了危险权限或反特性时,附加一句风险提示,引导用户谨慎安装。
 */
export function InstallWarning({ hasDangerPermission, hasAntifeature }: InstallWarningProps) {
  const { t } = useTranslation(["install", "common"]);
  const showRisk = hasDangerPermission || hasAntifeature;

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-warning-fg/40 bg-warning-bg px-4 py-3 text-warning-fg">
      <ShieldAlert className="mt-px size-[18px] shrink-0" />
      <div className="flex flex-col gap-0.5">
        <span data-testid="install-warning-title" className="text-[13px] font-semibold">
          {t("install:warning_title")}
        </span>
        <span data-testid="install-warning-desc" className="text-xs leading-relaxed">
          {t("install:from_legitimate_sources_warning")}
          {showRisk && (
            <span data-testid="install-warning-risk">
              {" "}
              {hasDangerPermission && t("install:warning_risk_connect")}
              {hasDangerPermission && hasAntifeature && t("install:warning_risk_join")}
              {hasAntifeature && t("install:warning_risk_antifeature")}
              {t("install:warning_risk_tail")}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

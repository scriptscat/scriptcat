import { useTranslation } from "react-i18next";
import { PlugZap } from "lucide-react";

export interface ExternalAccessBannerProps {
  contentHash: string;
  source: string;
  isUpdate: boolean;
}

/**
 * 「外部接入」触发安装/更新时置顶的横幅：只做基于渠道的描述（不显示客户端名，设计 §3.0.1），
 * 标明来源与内容哈希，供用户在三档操作栏决策前核对。警告色调，与站内其它警示区块共用 token。
 */
export function ExternalAccessBanner({ contentHash, source, isUpdate }: ExternalAccessBannerProps) {
  const { t } = useTranslation(["install", "external_access"]);
  const shortHash = contentHash.length > 12 ? `${contentHash.slice(0, 12)}…` : contentHash;

  return (
    <div
      data-testid="external-access-install-banner"
      className="flex flex-col gap-1.5 rounded-lg border border-warning bg-warning-bg px-4 py-3 text-warning-fg"
    >
      <div className="flex items-center gap-2">
        <PlugZap className="size-4 shrink-0" />
        <span className="text-[13px] font-semibold">
          {isUpdate ? t("external_access:approve_update_banner") : t("external_access:approve_install_banner")}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>{`${t("external_access:approve_source_label")}: ${source}`}</span>
        <span title={contentHash} data-testid="external-access-install-banner-hash">
          {`${t("external_access:approve_hash_label")}: ${shortHash}`}
        </span>
      </div>
    </div>
  );
}

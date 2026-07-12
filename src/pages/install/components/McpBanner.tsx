import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";

export interface McpBannerProps {
  requestingClientName: string;
  contentHash: string;
  source: string;
}

/**
 * MCP 请求安装横幅（doc 07 §5，doc 05 §5.1）：标明请求方、来源、内容哈希，
 * 以及「默认禁用」提示——警告色调，与站内其它警示区块共用 token。
 */
export function McpBanner({ requestingClientName, contentHash, source }: McpBannerProps) {
  const { t } = useTranslation(["install", "mcp"]);
  const shortHash = contentHash.length > 12 ? `${contentHash.slice(0, 12)}…` : contentHash;

  return (
    <div
      data-testid="mcp-install-banner"
      className="flex flex-col gap-1.5 rounded-lg border border-warning bg-warning-bg px-4 py-3 text-warning-fg"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 shrink-0" />
        <span className="text-[13px] font-semibold">
          {t("mcp:approve_install_banner", { clientName: requestingClientName })}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>{`${t("mcp:approve_source_label")}: ${source}`}</span>
        <span title={contentHash} data-testid="mcp-install-banner-hash">
          {`${t("mcp:approve_hash_label")}: ${shortHash}`}
        </span>
      </div>
      <span className="text-xs">{t("mcp:enable_by_default_off_note")}</span>
    </div>
  );
}

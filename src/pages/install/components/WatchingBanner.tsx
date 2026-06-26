import { useTranslation } from "react-i18next";
import { CircleCheckBig } from "lucide-react";

export interface WatchingBannerProps {
  /** 正在监听的本地文件名 */
  fileName: string;
  /** 最后一次自动同步的时间(本地化字符串);未同步过则不展示 */
  lastSync?: string;
}

/**
 * 本地文件监听横幅(对照设计稿 Watching Banner):绿色软底 + 左侧脉冲活动点,
 * 标题「正在监听文件变化」+ 文件名说明,右侧显示最后同步时间。
 */
export function WatchingBanner({ fileName, lastSync }: WatchingBannerProps) {
  const { t } = useTranslation(["install", "common"]);

  return (
    <div
      data-testid="watching-banner"
      className="flex items-center gap-3 rounded-lg border border-success/60 bg-success-bg px-4 py-3"
    >
      <span className="relative flex size-[18px] shrink-0 items-center justify-center" aria-hidden="true">
        <span className="absolute inline-flex size-[18px] animate-ping rounded-full bg-success opacity-40" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-success-fg">{t("install:watching_title")}</span>
        <span className="text-xs leading-relaxed text-success-fg/90">
          {t("install:watching_file_desc", { file: fileName })}
        </span>
      </div>
      {lastSync && (
        <span data-testid="watching-last-sync" className="flex shrink-0 items-center gap-1.5 text-xs text-success-fg">
          <CircleCheckBig className="size-3.5" />
          {t("install:watching_last_sync", { time: lastSync })}
        </span>
      )}
    </div>
  );
}

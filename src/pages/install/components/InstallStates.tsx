import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { CloudOff, Download, Globe, Loader2, RefreshCw, TimerOff } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { Progress } from "@App/pages/components/ui/progress";
import { StateScreen } from "@App/pages/components/ui/state-screen";
import { InstallTopBar } from "./InstallTopBar";

/**
 * 状态屏外壳:保留品牌顶栏(对照设计稿,加载/失败态不丢失外壳),内容区垂直居中。
 * chip 只在确知场景时才给——从更新页点进来的必然是更新,写死「脚本安装」会先闪一次错的上下文;
 * 底部留一条与就绪态操作栏等高的占位,避免就绪瞬间内容区高度再跳一次。
 */
function StateShell({
  title,
  titleIcon,
  children,
}: {
  title?: string;
  titleIcon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <InstallTopBar title={title} titleIcon={titleIcon} />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        {children}
      </main>
      <div data-testid="state-action-placeholder" className="min-h-[68px] shrink-0 border-t border-border bg-card" />
    </div>
  );
}

export function InstallLoading({
  source,
  bytesText,
  percent,
  mode,
}: {
  source?: string;
  bytesText?: string;
  percent?: number;
  /** 已确知的安装/更新场景;未确知时不渲染上下文 chip,不猜 */
  mode?: "install" | "update";
}) {
  const { t } = useTranslation(["install", "common"]);
  const isUpdate = mode === "update";
  return (
    <StateShell
      title={mode ? (isUpdate ? t("install:context_update") : t("install:context_install")) : undefined}
      titleIcon={isUpdate ? RefreshCw : Download}
    >
      <StateScreen
        icon={Loader2}
        iconClassName="animate-spin"
        tone="primary"
        compact
        title={isUpdate ? t("install:loading_title_update") : t("install:loading_title")}
        description={
          // 只有 url= 入口才真的在下载;uuid 入口的代码服务端早已备好,说「正在下载」是假的
          source
            ? t("install:loading_desc")
            : isUpdate
              ? t("install:loading_desc_prepare_update")
              : t("install:loading_desc_prepare")
        }
        progress={
          <div className="flex flex-col items-center gap-3">
            {source && (
              <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                <Globe className="size-3.5" />
                {source}
              </span>
            )}
            {bytesText && <span className="font-mono text-xs text-muted-foreground">{bytesText}</span>}
            <Progress
              aria-label={t("install:loading_title")}
              value={percent}
              indeterminate={typeof percent !== "number"}
              className="w-80"
              indicatorTestId={typeof percent === "number" ? "install-progress" : undefined}
            />
          </div>
        }
      />
    </StateShell>
  );
}

export function InstallError({
  title,
  message,
  onRetry,
  onClose,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["install", "common"]);
  return (
    <StateShell>
      <StateScreen
        data-testid="install-error"
        icon={CloudOff}
        tone="error"
        compact
        title={title ?? t("install:page_load_failed")}
        detail={message}
        action={
          <div className="flex gap-3">
            {onRetry && (
              <Button onClick={onRetry} className="min-w-24">
                {t("install:error_retry")}
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="min-w-24">
              {t("common:close")}
            </Button>
          </div>
        }
      />
    </StateShell>
  );
}

/**
 * 待安装代码已过期。这条路的失败几乎只有一个原因——暂存条目被定时清理清掉,
 * 此时「重试」重跑同一段取数必然还是同样结果,出口必须换成让服务端重新备料。
 */
export function InstallExpired({ onRecheck, onClose }: { onRecheck: () => void; onClose: () => void }) {
  const { t } = useTranslation(["install", "common"]);
  return (
    <StateShell title={t("install:context_update")} titleIcon={RefreshCw}>
      <StateScreen
        data-testid="install-expired"
        icon={TimerOff}
        tone="error"
        compact
        title={t("install:expired_title")}
        description={t("install:expired_desc")}
        action={
          <div className="flex gap-3">
            <Button onClick={onRecheck} className="min-w-24">
              <RefreshCw />
              {t("install:expired_recheck")}
            </Button>
            <Button variant="outline" onClick={onClose} className="min-w-24">
              {t("common:close")}
            </Button>
          </div>
        }
      />
    </StateShell>
  );
}

import { useTranslation } from "react-i18next";
import { CloudOff, Download, Globe, Loader2 } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { Progress } from "@App/pages/components/ui/progress";
import { StateScreen } from "@App/pages/components/ui/state-screen";
import { InstallTopBar } from "./InstallTopBar";

/** 状态屏外壳:保留品牌顶栏(对照设计稿,加载/失败态不丢失外壳),内容区垂直居中 */
function StateShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation(["install", "common"]);
  return (
    <div className="flex h-screen flex-col bg-background">
      <InstallTopBar title={t("install:context_install")} titleIcon={Download} />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        {children}
      </main>
    </div>
  );
}

export function InstallLoading({
  source,
  bytesText,
  percent,
}: {
  source?: string;
  bytesText?: string;
  percent?: number;
}) {
  const { t } = useTranslation(["install", "common"]);
  return (
    <StateShell>
      <StateScreen
        icon={Loader2}
        iconClassName="animate-spin"
        tone="primary"
        compact
        title={t("install:loading_title")}
        description={t("install:loading_desc")}
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

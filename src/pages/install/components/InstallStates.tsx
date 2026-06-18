import { useTranslation } from "react-i18next";
import { CloudOff, Download, Globe, Loader2 } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
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
      <Loader2 className="size-12 animate-spin text-primary" />
      <div className="flex flex-col items-center gap-1.5">
        <h1 className="text-lg font-semibold text-foreground">{t("install:loading_title")}</h1>
        <p className="text-[13px] text-muted-foreground">{t("install:loading_desc")}</p>
      </div>
      {source && (
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          <Globe className="size-3.5" />
          {source}
        </span>
      )}
      {bytesText && <span className="font-mono text-xs text-muted-foreground">{bytesText}</span>}
      <div className="h-1.5 w-80 overflow-hidden rounded-full bg-muted">
        {typeof percent === "number" ? (
          <div
            data-testid="install-progress"
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-indeterminate-bar rounded-full bg-primary" />
        )}
      </div>
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
      <div className="flex size-[60px] items-center justify-center rounded-full bg-destructive/10">
        <CloudOff className="size-7 text-destructive" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">{title ?? t("install:page_load_failed")}</h1>
      <pre className="max-w-[460px] overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 font-mono text-xs whitespace-pre-wrap text-destructive">
        {message}
      </pre>
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
    </StateShell>
  );
}

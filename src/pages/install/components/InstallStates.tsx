import { useTranslation } from "react-i18next";
import { CloudOff, Globe, Loader2 } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";

function StateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      {children}
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
      <div className="h-1 w-56 overflow-hidden rounded-full bg-muted">
        {typeof percent === "number" ? (
          <div
            data-testid="install-progress"
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
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
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <CloudOff className="size-7 text-destructive" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">{title ?? t("install:page_load_failed")}</h1>
      <pre className="max-w-[480px] overflow-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs text-destructive">
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

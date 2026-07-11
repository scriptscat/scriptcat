import { useTranslation } from "react-i18next";
import { ListChecks, FileCode } from "lucide-react";

export function SubscribeScripts({ scriptUrls }: { scriptUrls: string[] }) {
  const { t } = useTranslation(["install", "common"]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <ListChecks className="size-[18px] text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">{t("install:subscribe_scripts_title")}</h2>
        {scriptUrls.length > 0 && (
          <span className="ml-auto rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            {scriptUrls.length}
          </span>
        )}
      </div>
      <div className="flex flex-col px-3 pb-3">
        {scriptUrls.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">{t("install:subscribe_scripts_empty")}</p>
        ) : (
          scriptUrls.map((url) => (
            <div key={url} className="flex items-center gap-2 px-1 py-2">
              <FileCode className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 font-mono text-xs break-all text-foreground">{url}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

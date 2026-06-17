import { Download } from "lucide-react";
import { t } from "@App/locales/locales";

export function DropOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      data-testid="drop-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/75 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-primary bg-card/95 px-16 py-12 shadow-2xl">
        <div className="flex size-24 items-center justify-center rounded-full bg-primary/10">
          <Download className="size-11 text-primary" />
        </div>
        <div className="text-xl font-semibold text-foreground">{t("script:drop_to_install")}</div>
        <div className="text-sm text-muted-foreground">{t("script:drop_to_install_hint")}</div>
        <div className="flex gap-2 pt-1">
          {[".user.js", ".sub.js", ".zip"].map((x) => (
            <span key={x} className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
              {x}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

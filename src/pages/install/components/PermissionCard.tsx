import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@App/pages/components/ui/accordion";
import type { PermissionRow as PermissionRowData } from "../permissions";
import { PermissionRow, PermissionChips, KIND_META, RISK_STYLE } from "./PermissionRow";

function MobilePermissions({ rows }: { rows: PermissionRowData[] }) {
  const { t } = useTranslation(["install", "common"]);
  // 默认仅展开高风险(danger)项
  const defaultValue = rows.filter((r) => r.risk === "danger").map((r) => r.kind);

  return (
    <Accordion type="multiple" defaultValue={defaultValue} className="px-1">
      {rows.map((row) => {
        const { icon: Icon, labelKey } = KIND_META[row.kind];
        const style = RISK_STYLE[row.risk];
        return (
          <AccordionItem key={row.kind} value={row.kind} data-risk={row.risk}>
            <AccordionTrigger className="py-3">
              <span className="flex items-center gap-2.5">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", style.icon)}>
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-semibold text-foreground">{t(labelKey)}</span>
                <span className={cn("rounded-full px-2 text-[11px] font-semibold", style.count)}>
                  {row.values.length}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <PermissionChips row={row} />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

export function PermissionCard({ rows }: { rows: PermissionRowData[] }) {
  const { t } = useTranslation(["install", "common"]);
  const isMobile = useIsMobile();

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <ShieldCheck className="size-[18px] text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">{t("install:perm_card_title")}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{t("install:perm_card_hint")}</span>
      </div>
      <div className="flex flex-col px-3 pb-2">
        {rows.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">{t("install:perm_card_empty")}</p>
        ) : isMobile ? (
          <MobilePermissions rows={rows} />
        ) : (
          rows.map((row, i) => (
            <div key={row.kind} className={cn(i > 0 && "border-t border-border")}>
              <PermissionRow row={row} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

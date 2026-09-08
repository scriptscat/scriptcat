import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@App/pages/components/ui/accordion";
import { isPermissionChanged, type PermissionRow as PermissionRowData } from "../permissions";
import { PermissionRow, PermissionChips, PermissionDelta, KIND_META, RISK_STYLE } from "./PermissionRow";

/** 无变化标记;更新场景用来把「这一类你上次已经确认过」说出来 */
function NoChangeTag() {
  const { t } = useTranslation(["install", "common"]);
  return (
    <span className="rounded-full bg-muted px-2 text-[11px] font-semibold text-muted-foreground">
      {t("install:perm_no_change")}
    </span>
  );
}

function MobilePermissions({ rows, isUpdate }: { rows: PermissionRowData[]; isUpdate: boolean }) {
  const { t } = useTranslation(["install", "common"]);
  // 更新场景默认只展开有变动的类别,全新安装仍只展开高风险项
  const defaultValue = rows.filter((r) => (isUpdate ? isPermissionChanged(r) : r.risk === "danger")).map((r) => r.kind);

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
                <PermissionDelta row={row} />
                {isUpdate && !isPermissionChanged(row) && <NoChangeTag />}
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

/** 未变动类别的单行形态:名称、计数与「无变化」,点开即还原成完整权限行 */
function CollapsedRow({ row }: { row: PermissionRowData }) {
  const { t } = useTranslation(["install", "common"]);
  const [open, setOpen] = useState(false);
  const { icon: Icon, labelKey } = KIND_META[row.kind];
  const style = RISK_STYLE[row.risk];

  if (open) return <PermissionRow row={row} />;

  return (
    <button
      type="button"
      data-testid="permission-row-collapsed"
      onClick={() => setOpen(true)}
      className="flex w-full items-center gap-2.5 rounded-lg px-1 py-2.5 text-left hover:bg-muted"
    >
      <span className={cn("flex size-[26px] shrink-0 items-center justify-center rounded-md", style.icon)}>
        <Icon className="size-[15px]" />
      </span>
      <span className="text-[13px] font-semibold text-foreground">{t(labelKey)}</span>
      <span className={cn("rounded-full px-2 text-[11px] font-semibold", style.count)}>{row.values.length}</span>
      <NoChangeTag />
      <ChevronDown className="ml-auto size-4 text-muted-foreground" />
    </button>
  );
}

export function PermissionCard({ rows, baselineVersion }: { rows: PermissionRowData[]; baselineVersion?: string }) {
  const { t } = useTranslation(["install", "common"]);
  const isMobile = useIsMobile();
  const isUpdate = baselineVersion !== undefined;
  const changed = rows.filter(isPermissionChanged);
  const added = changed.reduce((n, r) => n + r.diff!.added.length, 0);
  const removed = changed.reduce((n, r) => n + r.diff!.removed.length, 0);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <ShieldCheck className="size-[18px] text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">
          {changed.length ? t("install:perm_card_title_changed") : t("install:perm_card_title")}
        </h2>
        {changed.length > 0 && (
          <span
            data-testid="permission-card-delta"
            className="flex items-center gap-1.5 font-mono text-xs font-semibold"
          >
            {added > 0 && <span className="text-success-fg">{`+${added}`}</span>}
            {removed > 0 && <span className="text-destructive">{`−${removed}`}</span>}
          </span>
        )}
        {isUpdate && !changed.length && <NoChangeTag />}
        <span className="ml-auto text-xs text-muted-foreground">
          {isUpdate ? t("install:perm_card_compare", { version: baselineVersion }) : t("install:perm_card_hint")}
        </span>
      </div>
      <div className="flex flex-col px-3 pb-2">
        {rows.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">{t("install:perm_card_empty")}</p>
        ) : isMobile ? (
          <MobilePermissions rows={rows} isUpdate={isUpdate} />
        ) : (
          rows.map((row, i) => (
            <div key={row.kind} className={cn(i > 0 && "border-t border-border")}>
              {isUpdate && !isPermissionChanged(row) ? <CollapsedRow row={row} /> : <PermissionRow row={row} />}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

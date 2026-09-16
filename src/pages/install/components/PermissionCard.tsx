import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, FileCode2, ShieldCheck } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@App/pages/components/ui/accordion";
import { compatMarkCount, type CompatView } from "../compat";
import { CompatChip } from "./CompatChip";
import { isPermissionChanged, type PermissionRow as PermissionRowData } from "../permissions";
import { PermissionRow, PermissionChips, PermissionDelta, NoChangeTag, KIND_META, RISK_STYLE } from "./PermissionRow";

function MobilePermissions({ rows, compat }: { rows: PermissionRowData[]; compat?: CompatView }) {
  const { t } = useTranslation(["install", "common"]);
  // 有变动时默认只展开有变动的类别;全新安装、以及用户主动点开的零变化整卡都退回只展开高风险项,
  // 否则零变化整卡展开后每一类都是收起的,「点开即得到全量清单」在移动端会落空。
  const hasChanged = rows.some(isPermissionChanged);
  const isMarked = (row: PermissionRowData) =>
    row.kind === "grant" && row.values.some((v) => compat?.marks.grants.has(v));
  const defaultValue = rows
    .filter((r) => isMarked(r) || (hasChanged ? isPermissionChanged(r) : r.risk === "danger"))
    .map((r) => r.kind);

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
                {row.diff && !isPermissionChanged(row) && <NoChangeTag />}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <PermissionChips row={row} compat={compat} />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

/** 未变动类别的单行形态:名称、计数与「无变化」,点开即还原成完整权限行 */
function CollapsedRow({ row, compat }: { row: PermissionRowData; compat?: CompatView }) {
  const { t } = useTranslation(["install", "common"]);
  const [open, setOpen] = useState(false);
  const { icon: Icon, labelKey } = KIND_META[row.kind];
  const style = RISK_STYLE[row.risk];

  if (open) return <PermissionRow row={row} compat={compat} />;

  return (
    <button
      type="button"
      data-testid="permission-row-collapsed"
      aria-expanded={false}
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

/**
 * 权限一项没变时的整卡单行形态。
 * 折叠的是注意力而不是信息:类别数与取值总数就在行上,点开即得到与全新安装一致的全量清单。
 */
function CollapsedCard({
  rows,
  baselineVersion,
  onExpand,
}: {
  rows: PermissionRowData[];
  baselineVersion: string;
  onExpand: () => void;
}) {
  const { t } = useTranslation(["install", "common"]);
  const total = rows.reduce((n, r) => n + r.values.length, 0);

  return (
    <section className="rounded-xl border border-border bg-card">
      {/* 不加 aria-label:它会盖掉「无变化 / 与旧版相同 / N 类 M 项」这三段摘要,
          令辅助技术只听到一句「展开」——折叠的就从注意力变成了信息 */}
      <button
        type="button"
        data-testid="permission-card-collapsed"
        aria-expanded={false}
        onClick={onExpand}
        className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3.5 text-left hover:bg-muted"
      >
        <ShieldCheck className="size-[18px] shrink-0 text-primary" />
        <span className="text-sm font-semibold text-foreground">{t("install:perm_card_title_short")}</span>
        <NoChangeTag />
        <span className="truncate text-xs text-muted-foreground">
          {t("install:perm_card_same_as", { version: baselineVersion })}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("install:perm_card_summary", { kinds: rows.length, count: total })}
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </button>
    </section>
  );
}

/**
 * 不生效的元数据指令(@exclude-match、@sandbox 等)。
 * 它们不是权限,但同样是「脚本写了、脚本猫不会执行」,与权限行同列才对得起读者的一次扫视。
 */
function OtherDirectivesRow({ compat }: { compat: CompatView }) {
  const { t } = useTranslation(["install", "common"]);
  const { tags } = compat.marks;
  if (!tags.length) return null;

  return (
    <div data-testid="permission-row-other" className="flex gap-3 border-t border-border px-1 py-3">
      <div className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-muted text-fg-secondary">
        <FileCode2 className="size-[18px]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{t("install:perm_other_label")}</span>
          <span className="truncate text-xs text-muted-foreground">{t("install:perm_other_summary")}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <CompatChip key={tag.tag} label={`@${tag.tag}`} kind="metadata" line={tag.line} onJump={compat.onJump} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PermissionCard({
  rows,
  baselineVersion,
  compat,
}: {
  rows: PermissionRowData[];
  baselineVersion?: string;
  compat?: CompatView;
}) {
  const { t } = useTranslation(["install", "common"]);
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  // 一项权限都没有的更新无物可比,沿用全新安装的空态卡头与文案
  const isUpdate = baselineVersion !== undefined && rows.length > 0;
  const changed = rows.filter(isPermissionChanged);
  const added = changed.reduce((n, r) => n + r.diff!.added.length, 0);
  const removed = changed.reduce((n, r) => n + r.diff!.removed.length, 0);
  const noChange = isUpdate && changed.length === 0;
  const compatCount = compat ? compatMarkCount(compat.marks) : 0;

  // 有不生效项时不塌：折叠的是「上次已确认过的权限」，而标记是这次才出现的新信息
  if (noChange && !expanded && compatCount === 0) {
    return <CollapsedCard rows={rows} baselineVersion={baselineVersion} onExpand={() => setExpanded(true)} />;
  }

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
        {compatCount > 0 && (
          <span
            data-testid="permission-card-compat"
            className="rounded-full bg-warning-bg px-2 text-[11px] font-semibold text-warning-fg"
          >
            {t("install:compat_count", { count: compatCount })}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {isUpdate ? t("install:perm_card_compare", { version: baselineVersion }) : t("install:perm_card_hint")}
        </span>
      </div>
      <div className="flex flex-col px-3 pb-2">
        {rows.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">{t("install:perm_card_empty")}</p>
        ) : isMobile ? (
          <MobilePermissions rows={rows} compat={compat} />
        ) : (
          rows.map((row, i) => (
            <div key={row.kind} className={cn(i > 0 && "border-t border-border")}>
              {/* 有变动时未变动的类别塌成单行让位;整卡零变化时用户是主动点开的,给全量 */}
              {changed.length > 0 && !isPermissionChanged(row) ? (
                <CollapsedRow row={row} compat={compat} />
              ) : (
                <PermissionRow row={row} compat={compat} />
              )}
            </div>
          ))
        )}
        {compat && <OtherDirectivesRow compat={compat} />}
      </div>
    </section>
  );
}

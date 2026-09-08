import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, ArrowLeftRight, ChevronDown, KeyRound, Package, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import {
  isPermissionChanged,
  type PermissionKind,
  type PermissionRisk,
  type PermissionRow as PermissionRowData,
} from "../permissions";

export const KIND_META: Record<PermissionKind, { icon: LucideIcon; labelKey: string; summaryKey: string }> = {
  match: { icon: Globe, labelKey: "install:perm_match_label", summaryKey: "install:perm_match_summary" },
  connect: { icon: ArrowLeftRight, labelKey: "install:perm_connect_label", summaryKey: "install:perm_connect_summary" },
  grant: { icon: KeyRound, labelKey: "install:perm_grant_label", summaryKey: "install:perm_grant_summary" },
  require: { icon: Package, labelKey: "install:perm_require_label", summaryKey: "install:perm_require_summary" },
};

/**
 * 风险只通过「图标块底色 + 计数徽章」表达,标题与普通取值 chip 保持中性;
 * 危险行(@connect *)的 chip 整体标红,敏感项(GM_cookie)单独描琥珀边(见 PermissionChips)。对照设计稿。
 */
export const RISK_STYLE: Record<PermissionRisk, { icon: string; count: string; chip: string }> = {
  normal: {
    icon: "bg-muted text-fg-secondary",
    count: "bg-muted text-muted-foreground",
    chip: "bg-muted border border-border text-fg-secondary",
  },
  warn: {
    icon: "bg-warning-bg text-warning-fg",
    count: "bg-warning-bg text-warning-fg",
    chip: "bg-muted border border-border text-fg-secondary",
  },
  danger: {
    icon: "bg-destructive/10 text-destructive",
    count: "bg-destructive/10 text-destructive",
    chip: "bg-destructive/10 border border-destructive/60 text-destructive",
  },
};

const DEFAULT_MAX_VISIBLE = 8;

type ChangeState = "added" | "removed" | "unchanged";

const CHANGE_LABEL_KEY: Record<ChangeState, string> = {
  added: "install:perm_change_added",
  removed: "install:perm_change_removed",
  unchanged: "install:perm_change_unchanged",
};

function Chip({ value, row, change }: { value: string; row: PermissionRowData; change?: ChangeState }) {
  const { t } = useTranslation(["install", "common"]);
  const isSensitive = row.sensitive.includes(value);
  const base = isSensitive ? "border border-warning-fg bg-muted text-warning-fg" : RISK_STYLE[row.risk].chip;

  // 变动状态只用字重、描边与 +/− 记号表达,底色继续留给风险等级——
  // 否则新增的 @connect * 会被染成「新增色」,把最该报警的情况伪装成安全的。
  const changeClass =
    change === "removed"
      ? "border border-border bg-transparent text-muted-foreground line-through"
      : change === "unchanged"
        ? "bg-muted border border-border text-muted-foreground"
        : change === "added"
          ? cn(base, "font-semibold", row.risk === "danger" && !isSensitive ? "border-destructive" : "border-current")
          : base;

  return (
    <span
      data-chip
      data-change={change}
      data-sensitive={isSensitive ? "true" : undefined}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs", changeClass)}
    >
      {change === "added" && <span aria-hidden="true">{"+"}</span>}
      {change === "removed" && <span aria-hidden="true">{"−"}</span>}
      {isSensitive && change !== "removed" && <TriangleAlert className="size-3 shrink-0" />}
      {change && <span className="sr-only">{t(CHANGE_LABEL_KEY[change])}</span>}
      <span className="min-w-0 break-all">{value}</span>
    </span>
  );
}

function MoreButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="permission-more"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary-light"
    >
      {label}
      <ChevronDown className="size-3" />
    </button>
  );
}

/**
 * 权限取值 chip 列表;桌面行与移动 Accordion 共用。
 * 全新安装按可见项 + 折叠的 +N 呈现;更新场景把新增与移除常驻在前,未变动项收进「未变动 N 项」。
 */
export function PermissionChips({
  row,
  maxVisible = DEFAULT_MAX_VISIBLE,
}: {
  row: PermissionRowData;
  maxVisible?: number;
}) {
  const { t } = useTranslation(["install", "common"]);
  const [expanded, setExpanded] = useState(false);

  if (!row.diff) {
    const visible = expanded ? row.values : row.values.slice(0, maxVisible);
    const hidden = row.values.length - visible.length;
    return (
      <div className="flex flex-wrap gap-1.5">
        {visible.map((v) => (
          <Chip key={v} value={v} row={row} />
        ))}
        {hidden > 0 && <MoreButton label={`+${hidden}`} onClick={() => setExpanded(true)} />}
      </div>
    );
  }

  const { added, removed } = row.diff;
  const addedSet = new Set(added);
  const unchanged = row.values.filter((v) => !addedSet.has(v));
  // 无任何变动时没有可钉住的内容,折叠桶会变成一个必须点开才能看到全部的空壳,故直接摊开
  const showUnchanged = expanded || added.length + removed.length === 0;

  return (
    <div className="flex flex-wrap gap-1.5">
      {added.map((v) => (
        <Chip key={`+${v}`} value={v} row={row} change="added" />
      ))}
      {removed.map((v) => (
        <Chip key={`-${v}`} value={v} row={row} change="removed" />
      ))}
      {showUnchanged && unchanged.map((v) => <Chip key={v} value={v} row={row} change="unchanged" />)}
      {!showUnchanged && unchanged.length > 0 && (
        <MoreButton
          label={t("install:perm_unchanged_more", { count: unchanged.length })}
          onClick={() => setExpanded(true)}
        />
      )}
    </div>
  );
}

/** 行头的变动计数;沿用代码卡 +N −M 的记号,无变动时不渲染 */
export function PermissionDelta({ row }: { row: PermissionRowData }) {
  if (!isPermissionChanged(row)) return null;
  const { added, removed } = row.diff!;
  return (
    <span data-testid="permission-delta" className="flex items-center gap-1.5 font-mono text-[11px] font-semibold">
      {added.length > 0 && <span className="text-success-fg">{`+${added.length}`}</span>}
      {removed.length > 0 && <span className="text-destructive">{`−${removed.length}`}</span>}
    </span>
  );
}

export function PermissionRow({ row, maxVisible }: { row: PermissionRowData; maxVisible?: number }) {
  const { t } = useTranslation(["install", "common"]);
  const { icon: Icon, labelKey, summaryKey } = KIND_META[row.kind];
  const style = RISK_STYLE[row.risk];

  return (
    <div data-testid="permission-row" data-kind={row.kind} data-risk={row.risk} className="flex gap-3 px-1 py-3">
      <div className={cn("flex size-[34px] shrink-0 items-center justify-center rounded-lg", style.icon)}>
        <Icon className="size-[18px]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{t(labelKey)}</span>
          <span className={cn("rounded-full px-2 text-[11px] font-semibold", style.count)}>{row.values.length}</span>
          <PermissionDelta row={row} />
          <span className="truncate text-xs text-muted-foreground">{t(summaryKey)}</span>
        </div>
        <PermissionChips row={row} maxVisible={maxVisible} />
      </div>
    </div>
  );
}

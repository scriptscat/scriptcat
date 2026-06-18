import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, ArrowLeftRight, ChevronDown, KeyRound, Package, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import type { PermissionKind, PermissionRisk, PermissionRow as PermissionRowData } from "../permissions";

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

export const DEFAULT_MAX_VISIBLE = 8;

/** 权限取值 chip 列表(可见项 + 折叠的 +N);桌面行与移动 Accordion 共用 */
export function PermissionChips({
  row,
  maxVisible = DEFAULT_MAX_VISIBLE,
}: {
  row: PermissionRowData;
  maxVisible?: number;
}) {
  const style = RISK_STYLE[row.risk];
  const sensitive = new Set(row.sensitive);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? row.values : row.values.slice(0, maxVisible);
  const hidden = row.values.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((v) => {
        const isSensitive = sensitive.has(v);
        return (
          <span
            key={v}
            data-chip
            data-sensitive={isSensitive ? "true" : undefined}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs",
              isSensitive ? "border border-warning-fg bg-muted text-warning-fg" : style.chip
            )}
          >
            {isSensitive && <TriangleAlert className="size-3 shrink-0" />}
            <span className="min-w-0 break-all">{v}</span>
          </span>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          data-testid="permission-more"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary-light"
        >
          {`+${hidden}`}
          <ChevronDown className="size-3" />
        </button>
      )}
    </div>
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
          <span className="truncate text-xs text-muted-foreground">{t(summaryKey)}</span>
        </div>
        <PermissionChips row={row} maxVisible={maxVisible} />
      </div>
    </div>
  );
}

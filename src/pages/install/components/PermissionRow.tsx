import { useTranslation } from "react-i18next";
import { Globe, Network, Wrench, Package, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import type { PermissionKind, PermissionRisk, PermissionRow as PermissionRowData } from "../permissions";

export const KIND_META: Record<PermissionKind, { icon: LucideIcon; labelKey: string; summaryKey: string }> = {
  match: { icon: Globe, labelKey: "install:perm_match_label", summaryKey: "install:perm_match_summary" },
  connect: { icon: Network, labelKey: "install:perm_connect_label", summaryKey: "install:perm_connect_summary" },
  grant: { icon: Wrench, labelKey: "install:perm_grant_label", summaryKey: "install:perm_grant_summary" },
  require: { icon: Package, labelKey: "install:perm_require_label", summaryKey: "install:perm_require_summary" },
};

export const RISK_STYLE: Record<PermissionRisk, { icon: string; label: string; chip: string }> = {
  normal: {
    icon: "bg-muted text-muted-foreground",
    label: "text-foreground",
    chip: "bg-input text-foreground",
  },
  warn: {
    icon: "bg-warning-bg text-warning-fg",
    label: "text-warning-fg",
    chip: "bg-warning-bg text-warning-fg",
  },
  danger: {
    icon: "bg-destructive/10 text-destructive",
    label: "text-destructive",
    chip: "bg-destructive/10 text-destructive",
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
  const visible = row.values.slice(0, maxVisible);
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
              "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs",
              style.chip,
              isSensitive && "ring-1 ring-destructive/60"
            )}
          >
            {isSensitive && <TriangleAlert className="size-3 shrink-0" />}
            <span className="min-w-0 break-all">{v}</span>
          </span>
        );
      })}
      {hidden > 0 && (
        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {`+${hidden}`}
        </span>
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
          <span className={cn("text-sm font-semibold", style.label)}>{t(labelKey)}</span>
          <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            {row.values.length}
          </span>
          <span className="truncate text-xs text-muted-foreground">{t(summaryKey)}</span>
        </div>
        <PermissionChips row={row} maxVisible={maxVisible} />
      </div>
    </div>
  );
}

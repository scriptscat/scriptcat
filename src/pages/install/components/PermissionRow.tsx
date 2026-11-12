import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, ArrowLeftRight, ChevronDown, KeyRound, Package, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { isScriptCatOnlyGrant } from "@App/pkg/utils/script_compat";
import { isMarkedValue, type CompatView } from "../compat";
import { catApiDocHref, metadataDocHref } from "../compat_docs";
import { CompatChip, ScriptCatOnlyBadge } from "./CompatChip";
import { splitUrlForDisplay } from "../url_display";
import {
  isPermissionChanged,
  type PermissionUpdate,
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
 * 危险行(@connect *)的 chip 整体标红,敏感项(GM_cookie)单独用琥珀浅底与描边(见 Chip)。对照设计稿。
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

type ChangeState = "added" | "removed" | "unchanged" | "updated";

const CHANGE_LABEL_KEY: Record<ChangeState, string> = {
  added: "install:perm_change_added",
  removed: "install:perm_change_removed",
  unchanged: "install:perm_change_unchanged",
  updated: "install:perm_change_updated",
};

const URL_KINDS = new Set<PermissionKind>(["match", "require"]);

/**
 * 地址类取值单行展示:域名与文件名加参数(版本号通常就在这里)常驻,中段路径优先被省略;
 * 点击展开为完整地址。@require 默认的 https:// 不占位置,http:// 等其他协议照常显示——明文加载值得被看见。
 */
function UrlValue({
  value,
  kind,
  title = value,
  muted,
}: {
  value: string;
  kind: PermissionKind;
  title?: string;
  muted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parts = URL_KINDS.has(kind) ? splitUrlForDisplay(value) : null;
  if (!parts) return <span className="min-w-0 break-all">{value}</span>;
  const { prefix, scheme, host, middle, tail } = parts;
  const showScheme = !(kind === "require" && scheme === "https://");

  return (
    <button
      type="button"
      title={title}
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      className="flex min-w-0 text-left font-mono"
    >
      {open ? (
        <span className="min-w-0 break-all">{prefix + scheme + host + middle + tail}</span>
      ) : (
        <span className="flex min-w-0 whitespace-nowrap">
          {prefix && <span className="shrink-0 text-muted-foreground">{prefix}</span>}
          {showScheme && <span className="shrink-0 text-muted-foreground">{scheme}</span>}
          <span className={cn("shrink-0", muted ? "text-muted-foreground" : "font-semibold text-foreground")}>
            {host}
          </span>
          {middle && <span className="min-w-4 shrink-[1000] truncate text-muted-foreground">{middle}</span>}
          <span className="min-w-0 truncate">{tail}</span>
        </span>
      )}
    </button>
  );
}

function Chip({ value, row, change }: { value: string; row: PermissionRowData; change?: ChangeState }) {
  const { t } = useTranslation(["install", "common"]);
  const isSensitive = row.sensitive.includes(value);
  // 装在脚本猫里能用，但换到别的脚本管理器就不行了；已移除的取值不再属于新版本，不标
  const isScriptCatOnly = row.kind === "grant" && change !== "removed" && isScriptCatOnlyGrant(value);
  const base = isSensitive ? "border border-warning-fg/60 bg-warning-bg text-warning-fg" : RISK_STYLE[row.risk].chip;
  // 色相只表达风险,变动只靠对比度与 +/− 记号:移除权限是好事,若也用红,就和 @connect * 这类真正该警觉的取值混在一起;
  // 反过来新增的 @connect * 若被染成新增色,最该报警的情况就被伪装成了安全的
  const riskTone = isSensitive || row.risk === "danger";

  const changeClass =
    change === "removed"
      ? "border border-transparent bg-transparent pl-1 text-muted-foreground"
      : change === "unchanged"
        ? "bg-muted border border-border text-muted-foreground"
        : change === "added"
          ? riskTone
            ? cn(base, "font-semibold")
            : "border border-border bg-muted text-foreground"
          : base;

  return (
    <span
      data-chip
      data-change={change}
      data-sensitive={isSensitive ? "true" : undefined}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs", changeClass)}
    >
      {change === "added" && (
        <span aria-hidden="true" className={cn("font-bold", !riskTone && "text-success-fg")}>
          {"+"}
        </span>
      )}
      {change === "removed" && (
        <span aria-hidden="true" className="font-bold">
          {"−"}
        </span>
      )}
      {isSensitive && change !== "removed" && <TriangleAlert className="size-3 shrink-0" />}
      {change && <span className="sr-only">{t(CHANGE_LABEL_KEY[change])}</span>}
      <span className={cn("flex min-w-0", change === "removed" && "line-through")}>
        <UrlValue value={value} kind={row.kind} muted={change === "removed"} />
      </span>
      {isScriptCatOnly && <ScriptCatOnlyBadge docHref={catApiDocHref(value)} />}
    </span>
  );
}

/** 同一资源只换了查询参数:地址只出现一次,旧参数划掉、新参数紧随其后 */
function UpdatedChip({ update, row }: { update: PermissionUpdate; row: PermissionRowData }) {
  const { t } = useTranslation(["install", "common"]);
  const base = update.to.split("?")[0];
  const fromQuery = update.from.slice(base.length);
  const toQuery = update.to.slice(base.length);

  return (
    <span
      data-chip
      data-change="updated"
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
    >
      <span aria-hidden="true" className="font-bold text-muted-foreground">
        {"~"}
      </span>
      <span className="sr-only">{t(CHANGE_LABEL_KEY.updated)}</span>
      <UrlValue value={base} kind={row.kind} title={update.to} />
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
        {fromQuery && <s className="text-muted-foreground">{fromQuery}</s>}
        <span aria-hidden="true" className="text-muted-foreground">
          {"→"}
        </span>
        {toQuery && <span>{toQuery}</span>}
      </span>
    </span>
  );
}

function MoreButton({
  label,
  onClick,
  testId = "permission-more",
}: {
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {label}
      <ChevronDown className="size-3" />
    </button>
  );
}

/**
 * 权限取值 chip 列表;桌面行与移动 Accordion 共用。
 * 全新安装按可见项 + 折叠的 +N 呈现;更新场景把新增与移除常驻在前,未变动项收进「未变动 N 项」的折叠桶。
 */
export function PermissionChips({
  row,
  maxVisible = DEFAULT_MAX_VISIBLE,
  compat,
}: {
  row: PermissionRowData;
  maxVisible?: number;
  compat?: CompatView;
}) {
  const { t } = useTranslation(["install", "common"]);
  const [expanded, setExpanded] = useState(false);
  const [showAllAdded, setShowAllAdded] = useState(false);
  const [showAllRemoved, setShowAllRemoved] = useState(false);

  // 不受支持的 @grant、解析不出规则的 @match 就地换成不生效标记；已被移除的取值不标——它已经不在新版本里了
  const renderChip = (value: string, change?: ChangeState) => {
    if (compat && change !== "removed") {
      if (row.kind === "grant" && compat.marks.grants.has(value)) {
        return (
          <CompatChip
            key={value}
            label={value}
            kind="grant"
            line={compat.marks.grants.get(value)}
            onJump={compat.onJump}
          />
        );
      }
      if (row.kind === "match" && compat.marks.matches.has(value)) {
        return (
          <CompatChip
            key={value}
            label={value}
            kind="value"
            line={compat.marks.matches.get(value)}
            onJump={compat.onJump}
            docHref={metadataDocHref("match")}
          />
        );
      }
    }
    return <Chip key={change ? `${change}:${value}` : value} value={value} row={row} change={change} />;
  };

  // 带不生效标记的取值不参与截断与折叠，否则标记会藏在「+N」后面
  const marked = (value: string) => !!compat && isMarkedValue(compat.marks, row.kind, value);
  const truncate = (values: string[]) => values.filter((v, i) => i < maxVisible || marked(v));

  if (!row.diff) {
    const visible = expanded ? row.values : truncate(row.values);
    const hidden = row.values.length - visible.length;
    return (
      <div className="flex flex-wrap gap-1.5">
        {visible.map((v) => renderChip(v))}
        {hidden > 0 && <MoreButton label={`+${hidden}`} onClick={() => setExpanded(true)} />}
      </div>
    );
  }

  const { added, removed, updated } = row.diff;
  // 危险(@connect *)、敏感与不生效的取值是这次最该被看见的,截断时永不收起
  const alwaysShown = (v: string) => marked(v) || row.sensitive.includes(v) || (row.kind === "connect" && v === "*");
  const visibleAdded = showAllAdded ? added : added.filter((v, i) => i < maxVisible || alwaysShown(v));
  const visibleRemoved = showAllRemoved ? removed : removed.slice(0, maxVisible);
  const addedSet = new Set(added);
  const updatedTo = new Set(updated.map((u) => u.to));
  const unchanged = row.values.filter((v) => !addedSet.has(v) && !updatedTo.has(v));
  const pinned = added.length + removed.length + updated.length;
  // 有增删时未变动项整体让位给折叠桶;一项没变时没有可钉住的内容,桶会变成必须点开才能看到全部的空壳,
  // 故退回全新安装的 maxVisible 截断——否则几十条 @match 的脚本一更新就会整片摊开。
  const visibleUnchanged = expanded ? unchanged : pinned > 0 ? unchanged.filter(marked) : truncate(unchanged);
  const hidden = unchanged.length - visibleUnchanged.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleAdded.map((v) => renderChip(v, "added"))}
      {visibleAdded.length < added.length && (
        <MoreButton
          testId="permission-more-added"
          label={t("install:perm_added_more", { count: added.length - visibleAdded.length })}
          onClick={() => setShowAllAdded(true)}
        />
      )}
      {updated.map((u) => (
        <UpdatedChip key={`updated:${u.to}`} update={u} row={row} />
      ))}
      {visibleRemoved.map((v) => renderChip(v, "removed"))}
      {visibleRemoved.length < removed.length && (
        <MoreButton
          testId="permission-more-removed"
          label={t("install:perm_removed_more", { count: removed.length - visibleRemoved.length })}
          onClick={() => setShowAllRemoved(true)}
        />
      )}
      {visibleUnchanged.map((v) => renderChip(v, "unchanged"))}
      {hidden > 0 && (
        <MoreButton
          label={pinned > 0 ? t("install:perm_unchanged_more", { count: hidden }) : `+${hidden}`}
          onClick={() => setExpanded(true)}
        />
      )}
    </div>
  );
}

/** 无变化标记;更新场景用来把「这一类你上次已经确认过」说出来 */
export function NoChangeTag() {
  const { t } = useTranslation(["install", "common"]);
  return (
    <span className="rounded-full bg-muted px-2 text-[11px] font-semibold text-muted-foreground">
      {t("install:perm_no_change")}
    </span>
  );
}

/** 行头的变动计数;沿用代码卡 +N −M 的记号,只换了查询参数的资源记作 ~N,无变动时不渲染 */
export function PermissionDelta({ row }: { row: PermissionRowData }) {
  if (!isPermissionChanged(row)) return null;
  const { added, removed, updated } = row.diff!;
  return (
    <span
      data-testid="permission-delta"
      className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
    >
      {added.length > 0 && <span>{`+${added.length}`}</span>}
      {removed.length > 0 && <span>{`−${removed.length}`}</span>}
      {updated.length > 0 && <span>{`~${updated.length}`}</span>}
    </span>
  );
}

/** 类别取值总数;更新态不给——总数已由新增数与「未变动 N 项」写出,再给一个数会和变动数读成一串 */
export function PermissionCount({ row }: { row: PermissionRowData }) {
  if (row.diff) return null;
  return (
    <span
      data-testid="permission-count"
      className={cn("rounded-full px-2 text-[11px] font-semibold", RISK_STYLE[row.risk].count)}
    >
      {row.values.length}
    </span>
  );
}

export function PermissionRow({
  row,
  maxVisible,
  compat,
}: {
  row: PermissionRowData;
  maxVisible?: number;
  compat?: CompatView;
}) {
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
          <PermissionCount row={row} />
          <PermissionDelta row={row} />
          {row.diff && !isPermissionChanged(row) && <NoChangeTag />}
          <span className="truncate text-xs text-muted-foreground">{t(summaryKey)}</span>
        </div>
        <PermissionChips row={row} maxVisible={maxVisible} compat={compat} />
      </div>
    </div>
  );
}

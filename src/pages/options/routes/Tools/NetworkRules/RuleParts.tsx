import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, MoreHorizontal } from "lucide-react";
import type { NetworkRule, NetworkRuleActionType } from "@App/app/repo/network_rule";
import type { NetworkRuleResourceType } from "@App/pkg/utils/network_rule_condition";
import { Badge } from "@App/pages/components/ui/badge";
import { Button } from "@App/pages/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { semTime } from "@App/locales/relative-date";
import { cn } from "@App/pkg/utils/cn";
import { isAllSitesCondition, ruleDomains } from "./rules";

const VISIBLE_DOMAINS = 2;

/** 每个动作名都用字面量 key 调用 t()，i18n-usage 的静态校验才能覆盖到。 */
export function useActionLabels(): Record<NetworkRuleActionType, string> {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      removeResponseHeaders: t("tools:network_rule_action_remove_response_headers"),
      modifyRequestHeaders: t("tools:network_rule_action_modify_request_headers"),
      modifyResponseHeaders: t("tools:network_rule_action_modify_response_headers"),
      block: t("tools:network_rule_action_block"),
      redirect: t("tools:network_rule_action_redirect"),
      allow: t("tools:network_rule_action_allow"),
    }),
    [t]
  );
}

/**
 * 资源类型的译名：编辑抽屉的高级区与匹配测试对话框读同一份，避免一处显示译名、另一处显示
 * DNR 标识符。每个类型都用字面量 key 调用 t()，i18n-usage 的静态校验才能覆盖到。
 */
export function useResourceTypeLabels(): Record<NetworkRuleResourceType, string> {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      main_frame: t("tools:network_rule_resource_main_frame"),
      sub_frame: t("tools:network_rule_resource_sub_frame"),
      stylesheet: t("tools:network_rule_resource_stylesheet"),
      script: t("tools:network_rule_resource_script"),
      image: t("tools:network_rule_resource_image"),
      font: t("tools:network_rule_resource_font"),
      object: t("tools:network_rule_resource_object"),
      xmlhttprequest: t("tools:network_rule_resource_xmlhttprequest"),
      ping: t("tools:network_rule_resource_ping"),
      csp_report: t("tools:network_rule_resource_csp_report"),
      media: t("tools:network_rule_resource_media"),
      websocket: t("tools:network_rule_resource_websocket"),
      other: t("tools:network_rule_resource_other"),
    }),
    [t]
  );
}

/**
 * 与规则无关的行内文案在表格级取一次就够：每行各自 useTranslation 会让 20 行的一次渲染
 * 跑上百次 t()，而这些字串对所有行都一样。带规则名的几条做成函数，标识同样稳定，
 * 于是行内容可以整块 memo 掉。切换语言时 t 换标识，整个对象随之失效。
 */
export type RuleRowLabels = {
  actions: Record<NetworkRuleActionType, string>;
  allWebsites: string;
  menu: string;
  edit: string;
  moveTop: string;
  moveBottom: string;
  moveTo: string;
  remove: string;
  modifiedAt: (time: string) => string;
  dragHandle: (name: string) => string;
  selectRule: (name: string) => string;
  enableRule: (name: string) => string;
};

export function useRuleRowLabels(): RuleRowLabels {
  const { t } = useTranslation();
  const actions = useActionLabels();
  return useMemo(
    () => ({
      actions,
      allWebsites: t("tools:network_rules_all_websites"),
      menu: t("tools:network_rules_row_menu"),
      edit: t("tools:network_rules_edit"),
      moveTop: t("tools:network_rules_move_top"),
      moveBottom: t("tools:network_rules_move_bottom"),
      moveTo: t("tools:network_rules_move_to"),
      remove: t("tools:network_rules_delete"),
      modifiedAt: (time: string) => t("tools:network_rules_modified_at", { time }),
      dragHandle: (name: string) => t("tools:network_rules_drag_handle", { name }),
      selectRule: (name: string) => t("tools:network_rules_select_rule", { name }),
      enableRule: (name: string) => t("tools:network_rules_enable_rule", { name }),
    }),
    [t, actions]
  );
}

/**
 * 动作类型的固定色相，取自 `--label-*` 令牌族（明暗自动切换，见 docs/references/design-tokens.md）。
 * 与 NameAvatar 的名称哈希不同，这里是一一对应的分类色：同一条规则的动作徽标、模板卡图标与表单里
 * 的动作字段读同一份映射，列表与编辑两处才不会给同一个动作两种颜色。
 * 留出 purple 不用：设计稿把它留给「规则由脚本创建」的来源标记。
 */
export const ACTION_TONES: Record<NetworkRuleActionType, string> = {
  removeResponseHeaders: "bg-label-amber-bg text-label-amber-fg",
  modifyRequestHeaders: "bg-label-teal-bg text-label-teal-fg",
  modifyResponseHeaders: "bg-label-indigo-bg text-label-indigo-fg",
  block: "bg-label-rose-bg text-label-rose-fg",
  redirect: "bg-label-blue-bg text-label-blue-fg",
  allow: "bg-label-green-bg text-label-green-fg",
};

export function ActionBadge({
  action,
  label,
  className,
}: {
  action: NetworkRuleActionType;
  label: string;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn(ACTION_TONES[action], className)}>
      {label}
    </Badge>
  );
}

export function ScopeChips({ rule, allSitesLabel }: { rule: NetworkRule; allSitesLabel: string }) {
  if (isAllSitesCondition(rule.condition)) {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="size-3" aria-hidden="true" />
        {allSitesLabel}
      </Badge>
    );
  }
  const domains = ruleDomains(rule);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {domains.slice(0, VISIBLE_DOMAINS).map((domain) => (
        <Badge key={domain} variant="secondary" className="max-w-[120px] truncate font-mono font-normal">
          {domain}
        </Badge>
      ))}
      {domains.length > VISIBLE_DOMAINS && (
        <span className="text-xs text-muted-foreground">{`+${domains.length - VISIBLE_DOMAINS}`}</span>
      )}
    </div>
  );
}

export function RuleName({ rule, labels }: { rule: NetworkRule; labels: RuleRowLabels }) {
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span data-testid="network-rule-name" className="truncate text-sm font-medium text-foreground">
        {rule.name}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {labels.modifiedAt(semTime(new Date(rule.updatedAt)))}
      </span>
    </div>
  );
}

export type RuleRowActions = {
  onEdit: (rule: NetworkRule) => void;
  onDelete: (rule: NetworkRule) => void;
  onMoveTop: (rule: NetworkRule) => void;
  onMoveBottom: (rule: NetworkRule) => void;
  onMoveTo: (rule: NetworkRule) => void;
};

export function RuleRowMenu({
  rule,
  position,
  total,
  disabled,
  labels,
  onEdit,
  onDelete,
  onMoveTop,
  onMoveBottom,
  onMoveTo,
}: RuleRowActions & {
  rule: NetworkRule;
  position: number;
  total: number;
  disabled: boolean;
  labels: RuleRowLabels;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={labels.menu}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(rule)}>{labels.edit}</DropdownMenuItem>
        <DropdownMenuItem disabled={position === 1} onSelect={() => onMoveTop(rule)}>
          {labels.moveTop}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={position === total} onSelect={() => onMoveBottom(rule)}>
          {labels.moveBottom}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={total < 2} onSelect={() => onMoveTo(rule)}>
          {labels.moveTo}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(rule)}>
          {labels.remove}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

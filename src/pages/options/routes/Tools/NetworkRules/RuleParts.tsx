import { useTranslation } from "react-i18next";
import { AlertTriangle, MoreHorizontal } from "lucide-react";
import type { NetworkRule, NetworkRuleActionType } from "@App/app/repo/network_rule";
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
import { isAllSitesCondition, ruleDomains } from "./rules";

const VISIBLE_DOMAINS = 2;

/** 每个动作名都用字面量 key 调用 t()，i18n-usage 的静态校验才能覆盖到。 */
export function useActionLabels(): Record<NetworkRuleActionType, string> {
  const { t } = useTranslation();
  return {
    removeResponseHeaders: t("tools:network_rule_action_remove_response_headers"),
    modifyRequestHeaders: t("tools:network_rule_action_modify_request_headers"),
    modifyResponseHeaders: t("tools:network_rule_action_modify_response_headers"),
    block: t("tools:network_rule_action_block"),
    redirect: t("tools:network_rule_action_redirect"),
    allow: t("tools:network_rule_action_allow"),
  };
}

export function ActionBadge({ rule }: { rule: NetworkRule }) {
  const labels = useActionLabels();
  return <Badge variant="secondary">{labels[rule.action.type]}</Badge>;
}

export function ScopeChips({ rule }: { rule: NetworkRule }) {
  const { t } = useTranslation();
  if (isAllSitesCondition(rule.condition)) {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="size-3" aria-hidden="true" />
        {t("tools:network_rules_all_websites")}
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

export function RuleName({ rule }: { rule: NetworkRule }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span data-testid="network-rule-name" className="truncate text-sm font-medium text-foreground">
        {rule.name}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {t("tools:network_rules_modified_at", { time: semTime(new Date(rule.updatedAt)) })}
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
  onEdit,
  onDelete,
  onMoveTop,
  onMoveBottom,
  onMoveTo,
}: RuleRowActions & { rule: NetworkRule; position: number; total: number; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={t("tools:network_rules_row_menu")}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(rule)}>{t("tools:network_rules_edit")}</DropdownMenuItem>
        <DropdownMenuItem disabled={position === 1} onSelect={() => onMoveTop(rule)}>
          {t("tools:network_rules_move_top")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={position === total} onSelect={() => onMoveBottom(rule)}>
          {t("tools:network_rules_move_bottom")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={total < 2} onSelect={() => onMoveTo(rule)}>
          {t("tools:network_rules_move_to")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(rule)}>
          {t("tools:network_rules_delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

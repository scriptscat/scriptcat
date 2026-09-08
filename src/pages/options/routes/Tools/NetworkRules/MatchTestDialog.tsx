import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, PauseCircle } from "lucide-react";
import type { NetworkRule } from "@App/app/repo/network_rule";
import { NETWORK_RULE_RESOURCE_TYPES, type NetworkRuleResourceType } from "@App/pkg/utils/network_rule_condition";
import { simulateNetworkRules, type NetworkRuleHit, type NetworkRuleOutcome } from "@App/pkg/utils/network_rule_match";
import { Badge } from "@App/pages/components/ui/badge";
import { Button } from "@App/pages/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@App/pages/components/ui/dialog";
import { Input } from "@App/pages/components/ui/input";
import { Label } from "@App/pages/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { cn } from "@App/pkg/utils/cn";
import { useActionLabels, useResourceTypeLabels } from "./RuleParts";
import { ruleDomains, isAllSitesCondition } from "./rules";

function useOutcomeLabels(): Record<NetworkRuleOutcome, string> {
  const { t } = useTranslation();
  return {
    none: t("tools:network_rules_outcome_none"),
    blocked: t("tools:network_rules_outcome_blocked"),
    redirected: t("tools:network_rules_outcome_redirected"),
    allowed: t("tools:network_rules_outcome_allowed"),
    modified: t("tools:network_rules_outcome_modified"),
  };
}

function HitReason({ hit }: { hit: NetworkRuleHit }) {
  const { t } = useTranslation();
  const position = hit.causedBy ?? 0;
  if (hit.status === "blocked") return <>{t("tools:network_rules_hit_blocked", { position })}</>;
  if (hit.status === "overridden") return <>{t("tools:network_rules_hit_overridden", { position })}</>;
  if (hit.status === "allowed") return <>{t("tools:network_rules_hit_allowed", { position })}</>;
  return <>{t("tools:network_rules_hit_applied")}</>;
}

function scopeText(rule: NetworkRule, allSitesLabel: string): string {
  return isAllSitesCondition(rule.condition) ? allSitesLabel : ruleDomains(rule).join(" · ");
}

export default function MatchTestDialog({
  open,
  rules,
  paused,
  onOpenChange,
}: {
  open: boolean;
  /** 完整的有序规则列表：结果里的 #N 就是列表页的位次。 */
  rules: NetworkRule[];
  /** 总开关关闭时仍照常模拟：否则「无命中」会把暂停误报成规则写错。 */
  paused?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const actionLabels = useActionLabels();
  const resourceLabels = useResourceTypeLabels();
  const outcomeLabels = useOutcomeLabels();
  const [url, setUrl] = useState("");
  const [resourceType, setResourceType] = useState<NetworkRuleResourceType>("main_frame");

  const simulation = useMemo(
    () => (url.trim() ? simulateNetworkRules(rules, { url, resourceType }) : undefined),
    [rules, url, resourceType]
  );

  const outcomeDetail = () => {
    if (!simulation) return "";
    switch (simulation.outcome) {
      case "blocked":
        return t("tools:network_rules_outcome_blocked_detail");
      case "redirected":
        return t("tools:network_rules_outcome_redirected_detail", { url: simulation.redirectUrl ?? "" });
      case "allowed":
        return t("tools:network_rules_outcome_allowed_detail");
      case "modified":
        return t("tools:network_rules_outcome_modified_detail", {
          count: simulation.hits.filter((hit) => hit.status === "applied").length,
        });
      default:
        return t("tools:network_rules_outcome_none_detail");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("tools:network_rules_test_match")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("tools:network_rules_match_description")}</p>

        {paused && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-fg"
          >
            <PauseCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t("tools:network_rules_match_paused")}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="network-rule-match-url">{t("tools:network_rules_match_url")}</Label>
            <Input
              id="network-rule-match-url"
              value={url}
              placeholder="https://example.com/page"
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-40">
            <Label htmlFor="network-rule-match-resource">{t("tools:network_rules_field_resource_types")}</Label>
            <Select value={resourceType} onValueChange={(value: NetworkRuleResourceType) => setResourceType(value)}>
              <SelectTrigger id="network-rule-match-resource">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NETWORK_RULE_RESOURCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {resourceLabels[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {simulation && !simulation.valid && (
          <p role="status" className="text-xs text-muted-foreground">
            {t("tools:network_rules_try_invalid")}
          </p>
        )}

        {simulation?.valid && (
          <>
            <div
              data-testid="match-test-outcome"
              role="status"
              className="space-y-2 rounded-md border border-border bg-muted/50 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {t("tools:network_rules_match_outcome_label")}
                </span>
                <Badge variant={simulation.outcome === "blocked" ? "destructive" : "secondary"}>
                  {outcomeLabels[simulation.outcome]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{outcomeDetail()}</p>
            </div>

            {simulation.hits.length > 0 && (
              <>
                <p className="text-sm font-medium text-foreground">{t("tools:network_rules_match_hits")}</p>
                <ul className="max-h-56 divide-y divide-border overflow-y-auto scrollbar-custom rounded-md border border-border">
                  {simulation.hits.map((hit) => (
                    <li
                      key={hit.rule.id}
                      data-testid="match-test-hit"
                      className={cn("flex items-start gap-3 p-3", hit.status !== "applied" && "opacity-60")}
                    >
                      <span className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">{`#${hit.position}`}</span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate text-sm font-medium text-foreground">{hit.rule.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {scopeText(hit.rule, t("tools:network_rules_all_websites"))}
                        </p>
                        <p className={cn("text-xs", hit.status === "applied" ? "text-success-fg" : "text-warning-fg")}>
                          <HitReason hit={hit} />
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {actionLabels[hit.rule.action.type]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("tools:network_rules_match_note")}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("tools:network_rules_match_close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

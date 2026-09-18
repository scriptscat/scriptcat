import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Network, PauseCircle } from "lucide-react";
import type { NetworkRule } from "@App/app/repo/network_rule";
import {
  NetworkRuleAmbiguousResponseError,
  parseNetworkRuleError,
  type NetworkRuleClient,
} from "@App/app/service/service_worker/client";
import type { NetworkRuleMutationResult } from "@App/app/service/service_worker/network_rule";
import { networkRuleClient } from "@App/pages/store/features/script";
import { Badge } from "@App/pages/components/ui/badge";
import { Button } from "@App/pages/components/ui/button";
import { SettingCard } from "@App/pages/options/components/SettingCard";
import { Skeleton } from "@App/pages/components/ui/skeleton";
import { Switch } from "@App/pages/components/ui/switch";
import { notify } from "@App/pages/components/ui/toast";
import { cn } from "@App/pkg/utils/cn";
import MatchTestDialog from "../NetworkRules/MatchTestDialog";
import { ActionBadge, useActionLabels } from "../NetworkRules/RuleParts";
import { enabledCount, isAllSitesCondition, orderedRules, ruleDomains } from "../NetworkRules/rules";
import { useNetworkRuleSnapshot } from "../NetworkRules/useNetworkRuleSnapshot";

/** 预览恒为两条：卡片高度必须与规则数无关，滚动监听的固定触发线才准。 */
const PREVIEW_LIMIT = 2;

type NetworkRulesSectionProps = {
  register: (id: string) => (el: HTMLElement | null) => void;
  client?: NetworkRuleClient;
};

function recentRules(rules: NetworkRule[], order: string[]): NetworkRule[] {
  return [...orderedRules(rules, order)].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, PREVIEW_LIMIT);
}

function PreviewRow({ rule }: { rule: NetworkRule }) {
  const { t } = useTranslation();
  const actionLabels = useActionLabels();
  const domains = ruleDomains(rule);
  return (
    <div data-testid="network-rules-preview-row" className="flex min-w-0 items-center gap-2">
      <span className="max-w-[40%] truncate text-sm text-foreground">{rule.name}</span>
      <ActionBadge action={rule.action.type} label={actionLabels[rule.action.type]} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
        {isAllSitesCondition(rule.condition) ? t("tools:network_rules_all_websites") : domains.join(" · ")}
      </span>
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  title,
  description,
  action,
}: {
  tone: "warning" | "destructive";
  icon: typeof AlertTriangle;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "destructive" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-md border p-3",
        tone === "destructive" ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", tone === "destructive" ? "text-destructive" : "text-warning-fg")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <p className={tone === "destructive" ? "text-destructive" : "text-warning-fg"}>{title}</p>
        {description && <p className="break-words text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function NetworkRulesSection({ register, client: injectedClient }: NetworkRulesSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useMemo(() => injectedClient ?? networkRuleClient, [injectedClient]);
  const { snapshot, setSnapshot, loading, loadError, setLoadError } = useNetworkRuleSnapshot(client);
  const [busy, setBusy] = useState<string>();
  const [matchTestOpen, setMatchTestOpen] = useState(false);

  const state = snapshot?.state;
  const total = state?.rules.length ?? 0;
  const enabled = state ? enabledCount(state) : 0;
  const preview = useMemo(() => (state ? recentRules(state.rules, state.order) : []), [state]);
  const applyFailed = snapshot?.apply.state === "error";
  const paused = state !== undefined && !state.masterEnabled;

  const applyResult = (result: NetworkRuleMutationResult) => {
    setSnapshot(result);
    if (result.outcome !== "applied" || result.apply.state !== "applied") {
      notify.error(t("tools:network_rules_rule_saved_apply_failed"));
    }
  };

  // service worker 挂起时响应可能丢失，但请求已在后台生效：重新拉取权威 state 判断是否推进了 revision。
  const settleAmbiguous = async (baseRevision: number): Promise<boolean> => {
    try {
      const latest = await client.getState();
      setSnapshot(latest);
      return latest.state.revision > baseRevision;
    } catch {
      return false;
    }
  };

  const setMasterEnabled = async (next: boolean) => {
    if (!state) return;
    const baseRevision = state.revision;
    setBusy("master");
    try {
      applyResult(await client.setMasterEnabled({ baseRevision, enabled: next }));
    } catch (error) {
      if (error instanceof NetworkRuleAmbiguousResponseError) {
        if (!(await settleAmbiguous(baseRevision))) notify.error(t("tools:network_rules_storage_error"));
        return;
      }
      const parsed = parseNetworkRuleError(error);
      if (parsed.snapshot) setSnapshot(parsed.snapshot);
      notify.error(
        parsed.code === "revision_conflict"
          ? t("tools:network_rules_revision_conflict")
          : t("tools:network_rules_storage_error")
      );
    } finally {
      setBusy(undefined);
    }
  };

  const retry = async () => {
    setBusy("retry");
    try {
      applyResult(await client.retryApply());
      setLoadError(undefined);
    } catch (error) {
      setLoadError(parseNetworkRuleError(error));
    } finally {
      setBusy(undefined);
    }
  };

  const retryButton = (
    <Button size="sm" variant="outline" disabled={busy === "retry"} onClick={() => void retry()}>
      {busy === "retry" && <Loader2 className="size-4 animate-spin" />}
      {t("tools:network_rules_retry")}
    </Button>
  );

  const stateLabel = applyFailed
    ? t("tools:network_rules_state_failed")
    : paused
      ? t("tools:network_rules_state_paused")
      : t("tools:network_rules_state_active");

  return (
    <SettingCard
      id="network-rules"
      icon={Network}
      title={t("tools:network_rules_title")}
      description={t("tools:network_rules_card_description")}
      register={register}
      action={
        <Switch
          checked={state?.masterEnabled ?? true}
          disabled={loading || busy !== undefined || !state}
          aria-label={t("tools:network_rules_master_switch")}
          onCheckedChange={(checked) => void setMasterEnabled(checked)}
        />
      }
    >
      {loading && (
        <div className="space-y-2" data-testid="network-rules-loading" aria-busy="true" aria-label={t("loading")}>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-full" />
        </div>
      )}

      {!loading && loadError && (
        <Banner
          tone="destructive"
          icon={AlertTriangle}
          title={t(
            loadError.code === "unsupported_schema"
              ? "tools:network_rules_unsupported_schema"
              : "tools:network_rules_load_error"
          )}
          action={retryButton}
        />
      )}

      {!loading && !loadError && snapshot && (
        <div data-testid="network-rules-summary" className="space-y-3.5">
          <div className="flex flex-wrap items-center gap-2" role="status">
            <Badge variant={applyFailed ? "destructive" : paused ? "warning" : "success"}>{stateLabel}</Badge>
            <span className="text-sm text-muted-foreground">
              {t("tools:network_rules_summary_counts", { enabled, total })}
            </span>
          </div>

          {applyFailed && snapshot.apply.state === "error" && (
            <Banner
              tone="destructive"
              icon={AlertTriangle}
              title={t("tools:network_rules_apply_error_title")}
              description={`${t("tools:network_rules_apply_error_detail")} ${snapshot.apply.message}`}
              action={retryButton}
            />
          )}

          {paused && (
            <Banner
              tone="warning"
              icon={PauseCircle}
              title={t("tools:network_rules_paused_title")}
              description={t("tools:network_rules_paused_description")}
            />
          )}

          <div data-testid="network-rules-preview" className={cn("min-h-[3.75rem] space-y-2", paused && "opacity-60")}>
            {total === 0 ? (
              <>
                <p className="text-sm text-foreground">{t("tools:network_rules_empty_title")}</p>
                <p className="text-xs text-muted-foreground">{t("tools:network_rules_empty_description")}</p>
              </>
            ) : (
              <>
                {preview.map((rule) => (
                  <PreviewRow key={rule.id} rule={rule} />
                ))}
                {total > PREVIEW_LIMIT && (
                  <p className="text-xs text-muted-foreground">
                    {t("tools:network_rules_preview_more", { count: total - PREVIEW_LIMIT })}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setMatchTestOpen(true)}>
              {t("tools:network_rules_test_match")}
            </Button>
            <Button size="sm" onClick={() => navigate("/tools/network-rules")}>
              {t("tools:network_rules_manage")}
            </Button>
          </div>
        </div>
      )}

      <MatchTestDialog
        key={matchTestOpen ? "open" : "closed"}
        open={matchTestOpen}
        rules={state ? orderedRules(state.rules, state.order) : []}
        paused={paused}
        onOpenChange={setMatchTestOpen}
      />
    </SettingCard>
  );
}

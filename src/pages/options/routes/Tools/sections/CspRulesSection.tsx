import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, HelpCircle, Loader2, MoreHorizontal, ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isNetworkRuleOwner, type NetworkRule, type NetworkRuleState } from "@App/app/repo/network_rule";
import { MAX_USER_RULES } from "@App/app/service/service_worker/dnr_rule_ids";
import {
  NetworkRuleAmbiguousResponseError,
  parseNetworkRuleError,
  type NetworkRuleClient,
  type NetworkRuleServiceError,
} from "@App/app/service/service_worker/client";
import type { NetworkRuleMutationResult, NetworkRuleSnapshot } from "@App/app/service/service_worker/network_rule";
import { extensionEnv } from "@App/app/service/extension/extension_env";
import { networkRuleClient } from "@App/pages/store/features/script";
import { subscribeMessage } from "@App/pages/store/global";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@App/pages/components/ui/alert-dialog";
import { Badge } from "@App/pages/components/ui/badge";
import { Button } from "@App/pages/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { SettingCard } from "@App/pages/options/components/SettingCard";
import { SettingRow } from "@App/pages/options/components/SettingRow";
import { Skeleton } from "@App/pages/components/ui/skeleton";
import { Switch } from "@App/pages/components/ui/switch";
import { notify } from "@App/pages/components/ui/toast";
import {
  CspRuleSheet,
  isAllSitesCondition,
  type NetworkRuleFormValue,
  type NetworkRuleSaveResult,
} from "./CspRuleSheet";

type CspRulesSectionProps = {
  register: (id: string) => (el: HTMLElement | null) => void;
  client?: NetworkRuleClient;
};

type Confirmation = {
  title: string;
  description: string;
  confirmText?: string;
  destructive?: boolean;
  run: () => Promise<void>;
};

function orderedRules(state: NetworkRuleState): NetworkRule[] {
  const byId = new Map(state.rules.map((rule) => [rule.id, rule]));
  return state.order.flatMap((id) => {
    const rule = byId.get(id);
    return rule ? [rule] : [];
  });
}

function activeDomainCount(state: NetworkRuleState): number {
  return new Set(state.rules.filter((rule) => rule.enabled).flatMap((rule) => rule.condition.requestDomains ?? []))
    .size;
}

function outcomeIsApplied(result: NetworkRuleMutationResult): boolean {
  return result.outcome === "applied" && result.apply.state === "applied";
}

function mutationErrorText(t: (key: string) => string, error: NetworkRuleServiceError): string {
  if (error.code === "revision_conflict") return t("tools:csp_revision_conflict");
  if (error.messageKey) return t(`tools:csp_error_${error.messageKey}`);
  return t("tools:csp_storage_error");
}

export function CspRulesSection({ register, client: injectedClient }: CspRulesSectionProps) {
  const { t } = useTranslation();
  const client = useMemo(() => injectedClient ?? networkRuleClient, [injectedClient]);
  const cspRuleOwner = isNetworkRuleOwner(extensionEnv);
  const [snapshot, setSnapshot] = useState<NetworkRuleSnapshot>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<NetworkRuleServiceError>();
  const [busy, setBusy] = useState<string>();
  const [visibleCount, setVisibleCount] = useState(20);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NetworkRule>();
  const [confirmation, setConfirmation] = useState<Confirmation>();

  useEffect(() => {
    if (!cspRuleOwner) return;
    let active = true;
    void client
      .getState()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setVisibleCount(20);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(parseNetworkRuleError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = subscribeMessage<NetworkRuleSnapshot>("networkRule/stateChanged", (next) => {
      setSnapshot((current) => (current && next.state.revision < current.state.revision ? current : next));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client, cspRuleOwner]);

  const openCreate = () => {
    if (!snapshot || snapshot.state.rules.length >= MAX_USER_RULES) return;
    setEditingRule(undefined);
    setSheetOpen(true);
  };

  const openEdit = (rule: NetworkRule) => {
    setEditingRule(rule);
    setSheetOpen(true);
  };

  const finishMutation = (result: NetworkRuleMutationResult) => {
    setSnapshot(result);
    if (outcomeIsApplied(result)) notify.success(t("tools:csp_rule_saved"));
    else notify.error(t("tools:csp_rule_saved_apply_failed"));
    return true;
  };

  // chrome.runtime.sendMessage 的响应有时会在 service worker 挂起后丢失（例如用户填写表单期间
  // service worker 进入空闲），此时提交其实已在后台成功执行。与其直接报错，不如重新拉取权威 state：
  // revision 前进说明本次提交已生效，按成功处理；否则说明确实没有生效，让调用方按失败提示。
  const reconcileAfterAmbiguousResponse = async (baseRevision: number): Promise<boolean> => {
    try {
      const latest = await client.getState();
      if (latest.state.revision > baseRevision) {
        finishMutation({ ...latest, outcome: latest.apply.state === "applied" ? "applied" : "apply-error" });
        return true;
      }
      setSnapshot(latest);
    } catch {
      // 拉取失败时保留原有 snapshot，交由调用方展示原始错误。
    }
    return false;
  };

  const saveRule = async (value: NetworkRuleFormValue, baseRevision: number): Promise<NetworkRuleSaveResult> => {
    if (!snapshot) return { code: "storage_read_failed" };
    setBusy("sheet");
    const domains = value.condition.requestDomains ?? [];
    const name =
      value.name.trim() ||
      (isAllSitesCondition(value.condition)
        ? t("tools:csp_all_websites")
        : `${domains[0]}${domains.length > 1 ? ` + ${domains.length - 1}` : ""}`);
    try {
      const result = editingRule
        ? await client.updateRule({
            baseRevision,
            id: editingRule.id,
            patch: { name, condition: value.condition, action: value.action },
          })
        : await client.createRule({
            baseRevision,
            name,
            enabled: value.enabled,
            condition: value.condition,
            action: value.action,
          });
      finishMutation(result);
      setSheetOpen(false);
      return true;
    } catch (error) {
      if (error instanceof NetworkRuleAmbiguousResponseError) {
        if (await reconcileAfterAmbiguousResponse(baseRevision)) {
          setSheetOpen(false);
          return true;
        }
        notify.error(t("tools:csp_storage_error"));
        return false;
      }
      const parsed = parseNetworkRuleError(error);
      if (parsed.snapshot) setSnapshot(parsed.snapshot);
      notify.error(mutationErrorText(t, parsed));
      if (parsed.code === "revision_conflict") {
        setSheetOpen(false);
        setEditingRule(undefined);
      }
      return parsed;
    } finally {
      setBusy(undefined);
    }
  };

  const setRuleEnabled = async (rule: NetworkRule, enabled: boolean) => {
    if (!snapshot) return;
    setBusy(rule.id);
    try {
      finishMutation(await client.setRuleEnabled({ baseRevision: snapshot.state.revision, id: rule.id, enabled }));
    } catch (error) {
      if (error instanceof NetworkRuleAmbiguousResponseError) {
        if (!(await reconcileAfterAmbiguousResponse(snapshot.state.revision)))
          notify.error(t("tools:csp_storage_error"));
        return;
      }
      const parsed = parseNetworkRuleError(error);
      if (parsed.snapshot) setSnapshot(parsed.snapshot);
      notify.error(t(`tools:csp_${parsed.code === "revision_conflict" ? "revision_conflict" : "storage_error"}`));
    } finally {
      setBusy(undefined);
    }
  };

  const deleteRule = async (rule: NetworkRule) => {
    if (!snapshot) return;
    setBusy(rule.id);
    try {
      finishMutation(await client.deleteRule({ baseRevision: snapshot.state.revision, id: rule.id }));
      setVisibleCount((current) => Math.min(current, Math.max(20, (snapshot.state.rules.length || 1) - 1)));
    } catch (error) {
      if (error instanceof NetworkRuleAmbiguousResponseError) {
        if (!(await reconcileAfterAmbiguousResponse(snapshot.state.revision)))
          notify.error(t("tools:csp_storage_error"));
        return;
      }
      const parsed = parseNetworkRuleError(error);
      if (parsed.snapshot) setSnapshot(parsed.snapshot);
      notify.error(t(`tools:csp_${parsed.code === "revision_conflict" ? "revision_conflict" : "storage_error"}`));
    } finally {
      setBusy(undefined);
    }
  };

  const setMasterEnabled = async (enabled: boolean) => {
    if (!snapshot) return;
    setBusy("master");
    try {
      finishMutation(await client.setMasterEnabled({ baseRevision: snapshot.state.revision, enabled }));
    } catch (error) {
      if (error instanceof NetworkRuleAmbiguousResponseError) {
        if (!(await reconcileAfterAmbiguousResponse(snapshot.state.revision)))
          notify.error(t("tools:csp_storage_error"));
        return;
      }
      const parsed = parseNetworkRuleError(error);
      if (parsed.snapshot) setSnapshot(parsed.snapshot);
      notify.error(t(`tools:csp_${parsed.code === "revision_conflict" ? "revision_conflict" : "storage_error"}`));
    } finally {
      setBusy(undefined);
    }
  };

  const retry = async () => {
    setBusy("retry");
    try {
      finishMutation(await client.retryApply());
      setLoadError(undefined);
    } catch (error) {
      setLoadError(parseNetworkRuleError(error));
    } finally {
      setBusy(undefined);
    }
  };

  const state = snapshot?.state;
  const activeRules = state?.rules.filter((rule) => rule.enabled).length ?? 0;
  const hasAllSites = state?.rules.some((rule) => rule.enabled && isAllSitesCondition(rule.condition)) ?? false;
  const viewState = snapshot?.apply.state === "error" ? "error" : !state?.masterEnabled ? "paused" : "applied";

  return (
    <SettingCard
      id="csp-rules"
      title={t("tools:csp_rules")}
      titleAction={
        <button
          type="button"
          title={t("tools:csp_rules_risk")}
          aria-label={t("tools:csp_rules_risk")}
          className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircle className="size-4" />
        </button>
      }
      description={t("tools:csp_rules_description")}
      register={register}
    >
      <p className="text-xs text-muted-foreground">{t("tools:csp_rules_scope")}</p>
      <p className="text-xs text-warning-fg">
        {t("tools:csp_rules_risk")} {t("tools:csp_rules_trusted_types")}
      </p>
      {!cspRuleOwner && (
        <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground" role="status">
          {t("tools:csp_incognito_unavailable")}
        </div>
      )}
      {cspRuleOwner && (
        <SettingRow label={t("tools:csp_run_rules")}>
          <Switch
            checked={state?.masterEnabled ?? true}
            disabled={loading || Boolean(busy) || !state}
            aria-label={t("tools:csp_run_rules")}
            onCheckedChange={(checked) => {
              if (!state) return;
              const hasEnabledAllSites = state.rules.some(
                (rule) => rule.enabled && isAllSitesCondition(rule.condition)
              );
              if (checked && hasEnabledAllSites) {
                setConfirmation({
                  title: t("tools:csp_confirm_all_sites_title"),
                  description: t("tools:csp_confirm_all_sites_description"),
                  run: () => setMasterEnabled(true),
                });
              } else {
                void setMasterEnabled(checked);
              }
            }}
          />
        </SettingRow>
      )}

      {cspRuleOwner && loading && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {cspRuleOwner && !loading && loadError && (
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-4" role="alert">
          <p className="text-sm text-destructive">
            {t(`tools:${loadError.code === "unsupported_schema" ? "csp_unsupported_schema" : "csp_load_error"}`)}
          </p>
          <Button size="sm" variant="outline" disabled={busy === "retry"} onClick={() => void retry()}>
            {busy === "retry" && <Loader2 className="size-4 animate-spin" />}
            {t("tools:csp_retry")}
          </Button>
        </div>
      )}

      {cspRuleOwner && !loading && !loadError && snapshot && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm">
              {viewState === "error" && <AlertTriangle className="size-4 text-destructive" />}
              {viewState === "error" && <span className="text-destructive">{t("tools:csp_apply_error")}</span>}
              {viewState === "paused" && (
                <span className="text-warning-fg">{t("tools:csp_summary_paused", { count: activeRules })}</span>
              )}
              {viewState === "applied" && !hasAllSites && (
                <span>
                  {t("tools:csp_summary_active", { count: activeRules, websites: activeDomainCount(snapshot.state) })}
                </span>
              )}
              {viewState === "applied" && hasAllSites && (
                <span>{t("tools:csp_summary_all_sites", { count: activeRules })}</span>
              )}
            </div>
            {snapshot.state.rules.length > 0 && (
              <Button
                size="sm"
                onClick={openCreate}
                disabled={Boolean(busy) || snapshot.state.rules.length >= MAX_USER_RULES}
              >
                {t("tools:csp_add_rule")}
              </Button>
            )}
          </div>

          {viewState === "error" && snapshot.apply.state === "error" && (
            <div
              className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
              role="alert"
            >
              <p className="text-destructive">{t("tools:csp_apply_error_detail")}</p>
              <details>
                <summary className="cursor-pointer text-destructive">{t("tools:csp_browser_error")}</summary>
                <p className="mt-2 break-words font-mono text-xs text-muted-foreground">{snapshot.apply.message}</p>
              </details>
              <Button size="sm" variant="outline" disabled={busy === "retry"} onClick={() => void retry()}>
                {busy === "retry" && <Loader2 className="size-4 animate-spin" />}
                {t("tools:csp_retry")}
              </Button>
            </div>
          )}

          {snapshot.state.rules.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center">
              <ShieldOff className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">{t("tools:csp_no_rules")}</p>
              <p className="text-xs text-muted-foreground">{t("tools:csp_no_rules_description")}</p>
              <Button size="sm" variant="outline" onClick={openCreate}>
                {t("tools:csp_add_rule")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {orderedRules(snapshot.state)
                .slice(0, visibleCount)
                .map((rule) => {
                  const isBusy = busy === rule.id;
                  const domains = rule.condition.requestDomains ?? [];
                  return (
                    <div
                      key={rule.id}
                      className="flex flex-col gap-3 rounded-md border border-border p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{rule.name}</p>
                          <Badge variant="outline">{t("tools:csp_remove_csp")}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isAllSitesCondition(rule.condition) ? (
                            <Badge variant="warning">{t("tools:csp_all_websites")}</Badge>
                          ) : (
                            <>
                              {domains.slice(0, 3).map((domain) => (
                                <Badge key={domain} variant="secondary">
                                  {domain}
                                </Badge>
                              ))}
                              {domains.length > 3 && (
                                <Badge variant="secondary">
                                  {"+"}
                                  {domains.length - 3}
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 md:shrink-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch
                            checked={rule.enabled}
                            disabled={Boolean(busy)}
                            aria-label={`${rule.name} ${t("tools:csp_enabled_field")}`}
                            onCheckedChange={(checked) => {
                              if (checked && isAllSitesCondition(rule.condition)) {
                                setConfirmation({
                                  title: t("tools:csp_confirm_all_sites_title"),
                                  description: t("tools:csp_confirm_all_sites_description"),
                                  run: () => setRuleEnabled(rule, true),
                                });
                              } else {
                                void setRuleEnabled(rule, checked);
                              }
                            }}
                          />
                          <span>{rule.enabled ? t("tools:csp_enabled") : t("tools:csp_disabled")}</span>
                          {isBusy && <Loader2 className="size-4 animate-spin" />}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={Boolean(busy)}
                              aria-label={t("tools:csp_more_actions")}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(rule)}>{t("tools:csp_edit")}</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() =>
                                setConfirmation({
                                  title: t("tools:csp_delete"),
                                  description: t("tools:csp_delete_description"),
                                  confirmText: t("tools:csp_delete"),
                                  destructive: true,
                                  run: () => deleteRule(rule),
                                })
                              }
                            >
                              {t("tools:csp_delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              {visibleCount < snapshot.state.rules.length && (
                <Button variant="outline" className="w-full" onClick={() => setVisibleCount((current) => current + 20)}>
                  {t("tools:csp_show_more")}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {cspRuleOwner && <p className="text-xs text-muted-foreground">{t("tools:csp_rules_reload")}</p>}
      <CspRuleSheet
        key={`${editingRule?.id ?? "new"}-${sheetOpen ? "open" : "closed"}`}
        open={sheetOpen}
        rule={editingRule}
        baseRevision={snapshot?.state.revision ?? 0}
        existingRules={snapshot?.state.rules ?? []}
        saving={busy === "sheet"}
        onOpenChange={(open) => {
          if (busy === "sheet") return;
          setSheetOpen(open);
          if (!open) setEditingRule(undefined);
        }}
        onSave={saveRule}
      />

      <AlertDialog open={confirmation !== undefined} onOpenChange={(open) => !open && setConfirmation(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmation(undefined)}>{t("tools:csp_cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmation?.destructive ? "destructive" : "default"}
              onClick={() => {
                const action = confirmation?.run;
                setConfirmation(undefined);
                if (action) void action();
              }}
            >
              {confirmation?.confirmText ?? t("tools:csp_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingCard>
  );
}

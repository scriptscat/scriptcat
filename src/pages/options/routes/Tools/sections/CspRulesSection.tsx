import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, HelpCircle, Loader2, MoreHorizontal, ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CspRule, CspRuleState } from "@App/app/repo/csp_rule";
import { CspRuleClient, parseCspRuleError, type CspRuleServiceError } from "@App/app/service/service_worker/client";
import type { CspMutationResult, CspRuleSnapshot } from "@App/app/service/service_worker/csp_rule";
import { message, subscribeMessage } from "@App/pages/store/global";
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
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { SettingCard } from "@App/pages/options/components/SettingCard";
import { SettingRow } from "@App/pages/options/components/SettingRow";
import { Skeleton } from "@App/pages/components/ui/skeleton";
import { Switch } from "@App/pages/components/ui/switch";
import { notify } from "@App/pages/components/ui/toast";
import { CspRuleSheet, type CspRuleFormValue } from "./CspRuleSheet";

type CspRulesSectionProps = {
  register: (id: string) => (el: HTMLElement | null) => void;
  client?: CspRuleClient;
};

type Confirmation = {
  title: string;
  description: string;
  run: () => Promise<void>;
};

function activeDomainCount(state: CspRuleState): number {
  return new Set(
    state.rules
      .filter((rule) => rule.enabled)
      .flatMap((rule) => (rule.target.type === "domains" ? rule.target.domains : []))
  ).size;
}

function outcomeIsApplied(result: CspMutationResult): boolean {
  return result.outcome === "applied" && result.apply.state === "applied";
}

export function CspRulesSection({ register, client: injectedClient }: CspRulesSectionProps) {
  const { t } = useTranslation();
  const client = useMemo(() => injectedClient ?? new CspRuleClient(message), [injectedClient]);
  const [snapshot, setSnapshot] = useState<CspRuleSnapshot>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<CspRuleServiceError>();
  const [busy, setBusy] = useState<string>();
  const [visibleCount, setVisibleCount] = useState(20);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CspRule>();
  const [confirmation, setConfirmation] = useState<Confirmation>();

  const loadState = () => {
    setLoading(true);
    setLoadError(undefined);
    void client
      .getState()
      .then((next) => {
        setSnapshot(next);
        setVisibleCount(20);
      })
      .catch((error: unknown) => setLoadError(parseCspRuleError(error)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    void client
      .getState()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setVisibleCount(20);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(parseCspRuleError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = subscribeMessage<CspRuleSnapshot>("cspRule/stateChanged", (next) => {
      setSnapshot((current) => (current && next.state.revision < current.state.revision ? current : next));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);

  const openCreate = () => {
    setEditingRule(undefined);
    setSheetOpen(true);
  };

  const openEdit = (rule: CspRule) => {
    setEditingRule(rule);
    setSheetOpen(true);
  };

  const finishMutation = (result: CspMutationResult) => {
    setSnapshot(result);
    if (outcomeIsApplied(result)) notify.success(t("tools:csp_rule_saved"));
    else notify.error(t("tools:csp_rule_saved_apply_failed"));
    return true;
  };

  const saveRule = async (value: CspRuleFormValue): Promise<boolean> => {
    if (!snapshot) return false;
    setBusy("sheet");
    const name =
      value.name.trim() ||
      (value.target.type === "allSites"
        ? t("tools:csp_all_websites")
        : `${value.target.domains[0]}${value.target.domains.length > 1 ? ` + ${value.target.domains.length - 1}` : ""}`);
    try {
      const result = editingRule
        ? await client.updateRule({
            baseRevision: snapshot.state.revision,
            id: editingRule.id,
            patch: { name, target: value.target },
          })
        : await client.createRule({
            baseRevision: snapshot.state.revision,
            name,
            enabled: value.enabled,
            target: value.target,
          });
      finishMutation(result);
      setSheetOpen(false);
      return true;
    } catch (error) {
      const parsed = parseCspRuleError(error);
      if (parsed.snapshot) setSnapshot(parsed.snapshot);
      notify.error(t(`tools:csp_${parsed.code === "revision_conflict" ? "revision_conflict" : "storage_error"}`));
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const setRuleEnabled = async (rule: CspRule, enabled: boolean) => {
    if (!snapshot) return;
    setBusy(rule.id);
    try {
      finishMutation(await client.setRuleEnabled({ baseRevision: snapshot.state.revision, id: rule.id, enabled }));
    } catch (error) {
      const parsed = parseCspRuleError(error);
      if (parsed.snapshot) setSnapshot(parsed.snapshot);
      notify.error(t(`tools:csp_${parsed.code === "revision_conflict" ? "revision_conflict" : "storage_error"}`));
    } finally {
      setBusy(undefined);
    }
  };

  const deleteRule = async (rule: CspRule) => {
    if (!snapshot) return;
    setBusy(rule.id);
    try {
      finishMutation(await client.deleteRule({ baseRevision: snapshot.state.revision, id: rule.id }));
      setVisibleCount((current) => Math.min(current, Math.max(20, (snapshot.state.rules.length || 1) - 1)));
    } catch (error) {
      const parsed = parseCspRuleError(error);
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
      const parsed = parseCspRuleError(error);
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
    } catch {
      notify.error(t("tools:csp_load_error"));
    } finally {
      setBusy(undefined);
    }
  };

  const state = snapshot?.state;
  const activeRules = state?.rules.filter((rule) => rule.enabled).length ?? 0;
  const hasAllSites = state?.rules.some((rule) => rule.enabled && rule.target.type === "allSites") ?? false;
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
      <SettingRow label={t("tools:csp_run_rules")}>
        <Switch
          checked={state?.masterEnabled ?? true}
          disabled={loading || Boolean(busy) || !state}
          aria-label={t("tools:csp_run_rules")}
          onCheckedChange={(checked) => {
            if (!state) return;
            const hasEnabledAllSites = state.rules.some((rule) => rule.enabled && rule.target.type === "allSites");
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

      {loading && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!loading && loadError && (
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-4" role="alert">
          <p className="text-sm text-destructive">
            {t(`tools:${loadError.code === "unsupported_schema" ? "csp_unsupported_schema" : "csp_load_error"}`)}
          </p>
          <Button size="sm" variant="outline" disabled={busy === "retry"} onClick={loadState}>
            {busy === "retry" && <Loader2 className="size-4 animate-spin" />}
            {t("tools:csp_retry")}
          </Button>
        </div>
      )}

      {!loading && !loadError && snapshot && (
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
              <Button size="sm" onClick={openCreate} disabled={Boolean(busy)}>
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
              {snapshot.state.rules.slice(0, visibleCount).map((rule) => {
                const isBusy = busy === rule.id;
                const domains = rule.target.type === "domains" ? rule.target.domains : [];
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
                        {rule.target.type === "allSites" ? (
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
                            if (checked && rule.target.type === "allSites") {
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
                          <Popconfirm
                            description={t("tools:csp_delete_description")}
                            confirmText={t("tools:csp_delete")}
                            cancelText={t("tools:csp_cancel")}
                            destructive
                            onConfirm={() => void deleteRule(rule)}
                          >
                            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                              {t("tools:csp_delete")}
                            </DropdownMenuItem>
                          </Popconfirm>
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

      <p className="text-xs text-muted-foreground">{t("tools:csp_rules_reload")}</p>
      <CspRuleSheet
        key={`${editingRule?.id ?? "new"}-${sheetOpen ? "open" : "closed"}`}
        open={sheetOpen}
        rule={editingRule}
        baseRevision={snapshot?.state.revision ?? 0}
        existingRules={snapshot?.state.rules ?? []}
        onOpenChange={setSheetOpen}
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
              onClick={() => {
                const action = confirmation?.run;
                setConfirmation(undefined);
                if (action) void action();
              }}
            >
              {t("tools:csp_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingCard>
  );
}

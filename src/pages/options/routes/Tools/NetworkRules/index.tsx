import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, CircleCheck, CircleSlash, Loader2, Minus, Network, Trash2 } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import type { NetworkRule, NetworkRuleCondition } from "@App/app/repo/network_rule";
import {
  NetworkRuleAmbiguousResponseError,
  parseNetworkRuleError,
  type NetworkRuleClient,
} from "@App/app/service/service_worker/client";
import type { NetworkRuleMutationResult } from "@App/app/service/service_worker/network_rule";
import { networkRuleClient } from "@App/pages/store/features/script";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@App/pages/components/ui/dialog";
import { EmptyState } from "@App/pages/components/ui/empty-state";
import { Input } from "@App/pages/components/ui/input";
import { Label } from "@App/pages/components/ui/label";
import { Pagination } from "@App/pages/components/ui/pagination";
import { SearchInput } from "@App/pages/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { Skeleton } from "@App/pages/components/ui/skeleton";
import { Switch } from "@App/pages/components/ui/switch";
import { notify } from "@App/pages/components/ui/toast";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import MatchTestDialog from "./MatchTestDialog";
import { useActionLabels } from "./RuleParts";
import RuleCards from "./RuleCards";
import RuleSheet, { useTemplateLabels, type NetworkRuleFormValue, type NetworkRuleSaveResult } from "./RuleSheet";
import RuleTable from "./RuleTable";
import { reloadRuleTabs } from "./tabs";
import { useNetworkRuleSnapshot } from "./useNetworkRuleSnapshot";
import type { RuleTemplateId } from "./templates";
import {
  ACTION_FILTER_OPTIONS,
  enabledCount,
  filterRules,
  filtersActive,
  isAllSitesCondition,
  moveRuleTo,
  NETWORK_RULES_PAGE_SIZE,
  orderedRules,
  quotaLimits,
  quotaUsage,
  type ActionFilter,
  type StatusFilter,
} from "./rules";

/**
 * 空态的入口：四个常用场景分属四种动作（删响应头、改请求头、屏蔽、重定向），
 * 末尾的「自定义」对应文案里的「或自己新建一条」。工具栏的新建按钮不在这里重复。
 */
const EMPTY_STATE_TEMPLATES: RuleTemplateId[] = ["csp", "userAgent", "block", "redirect", "custom"];

export default function NetworkRules({ client: injectedClient }: { client?: NetworkRuleClient }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const client = useMemo(() => injectedClient ?? networkRuleClient, [injectedClient]);
  const actionLabels = useActionLabels();
  const templateLabels = useTemplateLabels();

  const { snapshot, setSnapshot, loading, loadError, setLoadError } = useNetworkRuleSnapshot(client);
  const [busy, setBusy] = useState<string>();
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 拖拽/移动期间先按新顺序渲染，保存失败时清空即回滚到服务端顺序。
  const [pendingOrder, setPendingOrder] = useState<string[]>();
  const [movingRule, setMovingRule] = useState<NetworkRule>();
  // 高危确认与删除确认都可能由单条或一批规则触发，所以存待执行的动作而不是某一条规则。
  const [confirmAllSites, setConfirmAllSites] = useState<{ run: () => void }>();
  const [confirmDelete, setConfirmDelete] = useState<NetworkRule[]>();
  const [editingRule, setEditingRule] = useState<NetworkRule>();
  const [sheetTemplate, setSheetTemplate] = useState<RuleTemplateId>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [matchTestOpen, setMatchTestOpen] = useState(false);

  const state = snapshot?.state;
  const paused = state !== undefined && !state.masterEnabled;
  const applyErrored = snapshot?.apply.state === "error";
  const order = useMemo(() => pendingOrder ?? state?.order ?? [], [pendingOrder, state?.order]);
  const rules = useMemo(() => orderedRules(state?.rules ?? [], order), [state?.rules, order]);
  const filters = useMemo(
    () => ({ query, action: actionFilter, status: statusFilter }),
    [query, actionFilter, statusFilter]
  );
  const isFiltered = filtersActive(filters);
  const visible = useMemo(() => filterRules(rules, filters), [rules, filters]);
  const pageCount = Math.max(1, Math.ceil(visible.length / NETWORK_RULES_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRules = useMemo(
    () => visible.slice((currentPage - 1) * NETWORK_RULES_PAGE_SIZE, currentPage * NETWORK_RULES_PAGE_SIZE),
    [visible, currentPage]
  );
  const positionOf = useCallback((rule: NetworkRule) => order.indexOf(rule.id) + 1, [order]);
  const quota = useMemo(() => quotaUsage(rules), [rules]);
  const limits = useMemo(() => quotaLimits(), []);
  // 勾选以当前页为范围，所以翻页与改筛选都会清空选择，批量操作永远只作用于看得见的行。
  const selectedRules = useMemo(() => pageRules.filter((rule) => selected.has(rule.id)), [pageRules, selected]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const clearFilters = () => {
    setQuery("");
    setActionFilter("all");
    setStatusFilter("all");
    setPage(1);
    clearSelection();
  };

  /** 返回是否真的落到了浏览器：写入成功但 DNR 没接受时只报失败，调用方不得再报成功。 */
  const applyResult = useCallback(
    (result: NetworkRuleMutationResult): boolean => {
      setSnapshot(result);
      if (result.outcome !== "applied" || result.apply.state !== "applied") {
        notify.error(t("tools:network_rules_rule_saved_apply_failed"));
        return false;
      }
      return true;
    },
    [setSnapshot, t]
  );

  // 刷新范围由改动波及的规则条件决定，见 tabs.ts。
  const notifyApplied = useCallback(
    (title: string, conditions: NetworkRuleCondition[]) =>
      notify.success(title, {
        description: t("tools:network_rules_reload_hint"),
        action: { label: t("tools:network_rules_reload_tabs"), onClick: () => void reloadRuleTabs(conditions) },
      }),
    [t]
  );

  // service worker 挂起时响应可能丢失，但请求已在后台生效：重新拉取权威 state 判断是否推进了 revision。
  const settleAmbiguous = useCallback(
    async (baseRevision: number): Promise<number | undefined> => {
      try {
        const latest = await client.getState();
        setSnapshot(latest);
        return latest.state.revision > baseRevision ? latest.state.revision : undefined;
      } catch {
        return undefined;
      }
    },
    [client, setSnapshot]
  );

  const mutate = useCallback(
    async (
      key: string,
      run: (baseRevision: number) => Promise<NetworkRuleMutationResult>,
      failureText: string
    ): Promise<boolean> => {
      if (!state) return false;
      const baseRevision = state.revision;
      setBusy(key);
      try {
        return applyResult(await run(baseRevision));
      } catch (error) {
        if (error instanceof NetworkRuleAmbiguousResponseError) {
          if ((await settleAmbiguous(baseRevision)) !== undefined) return true;
          notify.error(failureText);
          return false;
        }
        const parsed = parseNetworkRuleError(error);
        if (parsed.snapshot) setSnapshot(parsed.snapshot);
        notify.error(parsed.code === "revision_conflict" ? t("tools:network_rules_revision_conflict") : failureText);
        return false;
      } finally {
        setBusy(undefined);
      }
    },
    [state, applyResult, settleAmbiguous, setSnapshot, t]
  );

  const persistOrder = useCallback(
    async (nextOrder: string[]) => {
      setPendingOrder(nextOrder);
      const ok = await mutate(
        "reorder",
        (baseRevision) => client.reorderRules({ baseRevision, order: nextOrder }),
        t("tools:network_rules_reorder_failed")
      );
      setPendingOrder(undefined);
      // 顺序即优先级，改一处会牵动全部规则，刷新范围取所有规则的条件。
      if (ok)
        notifyApplied(
          t("tools:network_rules_rule_saved"),
          rules.map((rule) => rule.condition)
        );
    },
    [client, mutate, notifyApplied, rules, t]
  );

  const handleDragEnd = useCallback(
    (activeId: string, overId: string) => {
      const from = order.indexOf(activeId);
      const to = order.indexOf(overId);
      if (from < 0 || to < 0) return;
      void persistOrder(arrayMove(order, from, to));
    },
    [order, persistOrder]
  );

  const moveTo = useCallback(
    (rule: NetworkRule, index: number) => void persistOrder(moveRuleTo(order, rule.id, index)),
    [order, persistOrder]
  );

  const setRuleEnabled = useCallback(
    (rule: NetworkRule, enabled: boolean) =>
      mutate(
        rule.id,
        (baseRevision) => client.setRulesEnabled({ baseRevision, ids: [rule.id], enabled }),
        t("tools:network_rules_storage_error")
      ),
    [client, mutate, t]
  );

  const toggleEnabled = useCallback(
    (rule: NetworkRule, enabled: boolean) => {
      if (enabled && isAllSitesCondition(rule.condition)) {
        setConfirmAllSites({ run: () => void setRuleEnabled(rule, enabled) });
        return;
      }
      void setRuleEnabled(rule, enabled);
    },
    [setRuleEnabled]
  );

  const setSelectedEnabled = (enabled: boolean) => {
    const targets = selectedRules.filter((rule) => rule.enabled !== enabled);
    const run = async () => {
      if (targets.length === 0) {
        clearSelection();
        return;
      }
      const ok = await mutate(
        "bulk",
        (baseRevision) => client.setRulesEnabled({ baseRevision, ids: targets.map((rule) => rule.id), enabled }),
        t("tools:network_rules_storage_error")
      );
      // 整批要么全落地要么全被拒，失败时保留选中项，用户可以直接重试。
      if (ok) clearSelection();
    };
    if (enabled && targets.some((rule) => isAllSitesCondition(rule.condition))) {
      setConfirmAllSites({ run: () => void run() });
      return;
    }
    void run();
  };

  const setMasterEnabled = (enabled: boolean) =>
    void mutate(
      "master",
      (baseRevision) => client.setMasterEnabled({ baseRevision, enabled }),
      t("tools:network_rules_storage_error")
    );

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

  const openSheet = useCallback((rule?: NetworkRule, template?: RuleTemplateId) => {
    setEditingRule(rule);
    setSheetTemplate(template);
    setSheetOpen(true);
  }, []);

  // 抽屉自己展示保存失败的原因，所以这里不走 mutate 的 toast，只把服务端错误原样回传。
  const saveRule = async (value: NetworkRuleFormValue): Promise<NetworkRuleSaveResult> => {
    if (!state) return false;
    const baseRevision = state.revision;
    setBusy("sheet");
    try {
      const result = editingRule
        ? await client.updateRule({
            baseRevision,
            id: editingRule.id,
            patch: { name: value.name, condition: value.condition, action: value.action },
          })
        : await client.createRule({
            baseRevision,
            enabled: true,
            name: value.name,
            condition: value.condition,
            action: value.action,
          });
      if (applyResult(result)) notifyApplied(t("tools:network_rules_rule_saved"), [value.condition]);
      setSheetOpen(false);
      return true;
    } catch (error) {
      if (error instanceof NetworkRuleAmbiguousResponseError) {
        if ((await settleAmbiguous(baseRevision)) !== undefined) {
          setSheetOpen(false);
          return true;
        }
        return false;
      }
      const parsed = parseNetworkRuleError(error);
      if (parsed.snapshot) setSnapshot(parsed.snapshot);
      return parsed;
    } finally {
      setBusy(undefined);
    }
  };

  const deleteRules = async (rules: NetworkRule[]) => {
    const ok = await mutate(
      "bulk",
      (baseRevision) => client.deleteRules({ baseRevision, ids: rules.map((rule) => rule.id) }),
      t("tools:network_rules_storage_error")
    );
    if (!ok) return;
    clearSelection();
    notifyApplied(
      t("tools:network_rules_rule_deleted"),
      rules.map((rule) => rule.condition)
    );
  };

  const toggleSelect = useCallback(
    (id: string, checked: boolean) =>
      setSelected((current) => {
        const next = new Set(current);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      }),
    []
  );
  const selectPage = useCallback(
    (checked: boolean) =>
      setSelected((current) => {
        const next = new Set(current);
        for (const rule of pageRules) {
          if (checked) next.add(rule.id);
          else next.delete(rule.id);
        }
        return next;
      }),
    [pageRules]
  );

  // 每行都是 memo 化的，行处理函数一旦跟着 pageRules 重建，翻页与搜索就会把整页行重算一遍。
  const editRule = useCallback((rule: NetworkRule) => openSheet(rule), [openSheet]);
  const deleteRule = useCallback((rule: NetworkRule) => setConfirmDelete([rule]), []);
  const moveTop = useCallback((rule: NetworkRule) => moveTo(rule, 0), [moveTo]);
  const moveBottom = useCallback((rule: NetworkRule) => moveTo(rule, order.length - 1), [moveTo, order.length]);
  const moveToPosition = useCallback((rule: NetworkRule) => setMovingRule(rule), []);

  const listProps = useMemo(
    () => ({
      rules: pageRules,
      positionOf,
      total: order.length,
      dragDisabled: isFiltered || busy !== undefined,
      busy: busy !== undefined,
      onToggleEnabled: toggleEnabled,
      onDragEnd: handleDragEnd,
      onEdit: editRule,
      onDelete: deleteRule,
      onMoveTop: moveTop,
      onMoveBottom: moveBottom,
      onMoveTo: moveToPosition,
    }),
    [
      pageRules,
      positionOf,
      order.length,
      isFiltered,
      busy,
      toggleEnabled,
      handleDragEnd,
      editRule,
      deleteRule,
      moveTop,
      moveBottom,
      moveToPosition,
    ]
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("tools:network_rules_back")}
          onClick={() => navigate("/tools")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-base font-semibold text-foreground md:text-lg">{t("tools:network_rules_title")}</h1>
        <div className="ml-auto flex items-center gap-2">
          {state && (
            <Badge variant={applyErrored ? "destructive" : paused ? "warning" : "success"} className="gap-1.5">
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {applyErrored
                ? t("tools:network_rules_state_failed")
                : paused
                  ? t("tools:network_rules_state_paused")
                  : t("tools:network_rules_state_active")}
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">{t("tools:network_rules_master_switch")}</span>
          <Switch
            checked={state?.masterEnabled ?? true}
            disabled={loading || busy !== undefined || !state}
            aria-label={t("tools:network_rules_master_switch")}
            onCheckedChange={setMasterEnabled}
          />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-auto scrollbar-custom px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            className="min-w-[200px] flex-1"
            placeholder={t("tools:network_rules_search_placeholder")}
            aria-label={t("tools:network_rules_search_placeholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
              clearSelection();
            }}
          />
          <Select
            value={actionFilter}
            onValueChange={(value: ActionFilter) => {
              setActionFilter(value);
              setPage(1);
              clearSelection();
            }}
          >
            <SelectTrigger className="w-[136px]" aria-label={t("tools:network_rules_filter_action")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tools:network_rules_filter_all_actions")}</SelectItem>
              {ACTION_FILTER_OPTIONS.map((action) => (
                <SelectItem key={action} value={action}>
                  {actionLabels[action]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value: StatusFilter) => {
              setStatusFilter(value);
              setPage(1);
              clearSelection();
            }}
          >
            <SelectTrigger className="w-[120px]" aria-label={t("tools:network_rules_filter_status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tools:network_rules_filter_all_statuses")}</SelectItem>
              <SelectItem value="enabled">{t("tools:network_rules_status_enabled")}</SelectItem>
              <SelectItem value="disabled">{t("tools:network_rules_status_disabled")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setMatchTestOpen(true)}>
            {t("tools:network_rules_test_match")}
          </Button>
          <Button size="sm" disabled={loading || !state} onClick={() => openSheet()}>
            {t("tools:network_rules_new_rule")}
          </Button>
        </div>

        {isFiltered && rules.length > 0 && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
          >
            <span>{t("tools:network_rules_filter_active", { matched: visible.length, total: rules.length })}</span>
            {/* 手柄灰掉是筛选的后果而不是又一次复述按钮，不说明用户无从得知为什么不能拖。 */}
            <span>{t("tools:network_rules_filter_drag_paused")}</span>
            <Button variant="link" size="xs" className="h-auto p-0" onClick={clearFilters}>
              {t("tools:network_rules_clear_filters")}
            </Button>
          </div>
        )}

        {snapshot?.apply.state === "error" && (
          <div
            className="flex flex-wrap items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3"
            role="alert"
          >
            <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <p className="text-destructive">{t("tools:network_rules_apply_error_title")}</p>
              <p className="break-words text-xs text-muted-foreground">
                {t("tools:network_rules_apply_error_detail")} {snapshot.apply.message}
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={busy === "retry"} onClick={() => void retry()}>
              {busy === "retry" && <Loader2 className="size-4 animate-spin" />}
              {t("tools:network_rules_retry")}
            </Button>
          </div>
        )}

        {loading && (
          <div className="space-y-2" aria-busy="true" aria-label={t("loading")}>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!loading && loadError && (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-4" role="alert">
            <p className="text-sm text-destructive">
              {t(
                loadError.code === "unsupported_schema"
                  ? "tools:network_rules_unsupported_schema"
                  : "tools:network_rules_load_error"
              )}
            </p>
            <Button size="sm" variant="outline" disabled={busy === "retry"} onClick={() => void retry()}>
              {busy === "retry" && <Loader2 className="size-4 animate-spin" />}
              {t("tools:network_rules_retry")}
            </Button>
          </div>
        )}

        {!loading && !loadError && rules.length === 0 && (
          <EmptyState
            icon={Network}
            title={t("tools:network_rules_empty_title")}
            description={t("tools:network_rules_empty_description")}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {EMPTY_STATE_TEMPLATES.map((id) => (
                  <Button key={id} variant="outline" size="sm" onClick={() => openSheet(undefined, id)}>
                    {templateLabels[id].title}
                  </Button>
                ))}
              </div>
            }
          />
        )}

        {!loading && !loadError && rules.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={Network}
            title={t("tools:network_rules_no_results_title")}
            description={t("tools:network_rules_no_results_description")}
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("tools:network_rules_clear_filters")}
              </Button>
            }
          />
        )}

        {selectedRules.length > 0 && (
          <div
            role="toolbar"
            aria-label={t("tools:network_rules_bulk_actions")}
            className="flex flex-wrap items-center gap-3 rounded-md bg-primary-light px-3.5 py-2"
          >
            <span
              className="flex size-4 items-center justify-center rounded-sm bg-primary-background"
              aria-hidden="true"
            >
              <Minus className="size-3 text-primary-foreground" />
            </span>
            <span className="flex-1 text-sm font-semibold text-primary" aria-live="polite">
              {t("tools:network_rules_selected_count", { count: selectedRules.length })}
            </span>
            <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => setSelectedEnabled(true)}>
              <CircleCheck />
              {t("tools:network_rules_bulk_enable")}
            </Button>
            <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => setSelectedEnabled(false)}>
              <CircleSlash />
              {t("tools:network_rules_bulk_disable")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== undefined}
              onClick={() => setConfirmDelete(selectedRules)}
            >
              <Trash2 />
              {t("tools:network_rules_bulk_delete")}
            </Button>
            <Button variant="link" size="xs" className="h-auto p-0" onClick={clearSelection}>
              {t("tools:network_rules_clear_selection")}
            </Button>
          </div>
        )}
        {!loading && !loadError && pageRules.length > 0 && (
          <>
            {isMobile ? (
              <RuleCards {...listProps} />
            ) : (
              <RuleTable {...listProps} selected={selected} onSelect={toggleSelect} onSelectPage={selectPage} />
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>
                  {t("tools:network_rules_footer_total", {
                    count: rules.length,
                    enabled: state ? enabledCount(state) : 0,
                  })}
                </span>
                {limits.total !== undefined && (
                  <span data-testid="network-rules-quota">
                    {t("tools:network_rules_quota_total", { used: quota.total, limit: limits.total })}
                    {limits.unsafe !== undefined &&
                      ` · ${t("tools:network_rules_quota_unsafe", { used: quota.unsafe, limit: limits.unsafe })}`}
                  </span>
                )}
              </div>
              {pageCount > 1 && (
                <Pagination
                  page={currentPage}
                  pageCount={pageCount}
                  onPageChange={(next) => {
                    setPage(next);
                    clearSelection();
                  }}
                  previousLabel={t("tools:network_rules_prev_page")}
                  nextLabel={t("tools:network_rules_next_page")}
                />
              )}
            </div>
          </>
        )}
      </div>

      <MoveToDialog
        key={movingRule?.id ?? "none"}
        rule={movingRule}
        total={order.length}
        currentPosition={movingRule ? order.indexOf(movingRule.id) + 1 : 1}
        onClose={() => setMovingRule(undefined)}
        onSubmit={(position) => {
          const rule = movingRule;
          setMovingRule(undefined);
          if (rule) moveTo(rule, position - 1);
        }}
      />

      <MatchTestDialog
        key={matchTestOpen ? "match-open" : "match-closed"}
        open={matchTestOpen}
        rules={rules}
        paused={paused}
        onOpenChange={setMatchTestOpen}
      />

      <RuleSheet
        key={`${editingRule?.id ?? "new"}-${sheetTemplate ?? "pick"}-${sheetOpen ? "open" : "closed"}`}
        open={sheetOpen}
        rule={editingRule}
        initialTemplate={sheetTemplate}
        saving={busy === "sheet"}
        onOpenChange={(next) => {
          if (busy === "sheet") return;
          setSheetOpen(next);
          if (!next) {
            setEditingRule(undefined);
            setSheetTemplate(undefined);
          }
        }}
        onSave={saveRule}
      />

      <AlertDialog open={confirmDelete !== undefined} onOpenChange={(open) => !open && setConfirmDelete(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete && confirmDelete.length > 1
                ? t("tools:network_rules_confirm_bulk_delete_title", { count: confirmDelete.length })
                : t("tools:network_rules_confirm_delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("tools:network_rules_confirm_delete_description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelete(undefined)}>
              {t("tools:network_rules_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const rules = confirmDelete;
                setConfirmDelete(undefined);
                if (rules) void deleteRules(rules);
              }}
            >
              {t("tools:network_rules_confirm_delete_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAllSites !== undefined} onOpenChange={(open) => !open && setConfirmAllSites(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tools:network_rules_confirm_all_sites_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("tools:network_rules_confirm_all_sites_description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmAllSites(undefined)}>
              {t("tools:network_rules_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pending = confirmAllSites;
                setConfirmAllSites(undefined);
                pending?.run();
              }}
            >
              {t("tools:network_rules_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MoveToDialog({
  rule,
  total,
  currentPosition,
  onClose,
  onSubmit,
}: {
  rule: NetworkRule | undefined;
  total: number;
  currentPosition: number;
  onClose: () => void;
  onSubmit: (position: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(`${currentPosition}`);
  const position = Number.parseInt(value, 10);
  const valid = Number.isInteger(position) && position >= 1 && position <= total;

  return (
    <Dialog open={rule !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("tools:network_rules_move_to_title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="network-rule-move-position">{t("tools:network_rules_move_to_label", { total })}</Label>
          <Input
            id="network-rule-move-position"
            type="number"
            min={1}
            max={total}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("tools:network_rules_cancel")}
          </Button>
          <Button disabled={!valid} onClick={() => valid && onSubmit(position)}>
            {t("tools:network_rules_move_to_confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

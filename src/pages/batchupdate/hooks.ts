import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import type { TBatchUpdateRecord, TBatchUpdateResult } from "@App/app/service/service_worker/types";
import { BatchUpdateListActionCode, UpdateStatusCode } from "@App/app/service/service_worker/types";
import { openInCurrentTab } from "@App/pkg/utils/utils";
import {
  requestBatchUpdateListAction,
  requestCheckScriptUpdate,
  requestOpenUpdatePageByUUID,
  scriptClient,
} from "@App/pages/store/features/script";
import { subscribeMessage } from "@App/pages/store/global";
import { assembleRecord, categorize, isRowInFlight, type BatchProgress, type RowState, type UpdateItem } from "./logic";
import type { BatchUpdateViewProps } from "./components";

/** 服务端 onScriptUpdateCheck 广播的消息体 */
interface UpdateCheckMessage {
  status?: number;
  checktime?: number;
  refreshRecord?: boolean;
}

/** 成功后停留展示「已更新 vX」的时长：让用户确认是自己点的那一行成功了，再收拢退场 */
const SUCCESS_HOLD_MS = 450;
/** 退场动画（animate-collapse-bar，200ms）走完后再摘除节点 */
const ROW_EXIT_MS = 220;
/** 批量汇总条在结束后的驻留时长 */
const SUMMARY_LINGER_MS = 5000;

/** options 页脚本列表；脚本列表的排序状态存在 localStorage 里，URL 无法表达，因此只跳转不带排序 */
const SCRIPT_LIST_URL = "/src/options.html#/";

/** 自动关闭倒计时；cancelled 与「URL 未要求自动关闭」必须区分开，后者不应显示药丸 */
type AutoCloseState = { seconds: number | null; cancelled: boolean };

/** 解析 URL 上的 autoclose 参数；> 0 时返回秒数，否则返回 null（不自动关闭） */
function parseAutoClose(): number | null {
  const raw = new URLSearchParams(window.location.search).get("autoclose");
  const n = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 解析 URL 上的 site 参数（触发更新页的当前网址域名）；命中该站点的更新会优先靠前 */
function parseSite(): string {
  return new URLSearchParams(window.location.search).get("site") || "";
}

/** 批量更新页面的数据与交互逻辑 */
export function useBatchUpdate(): BatchUpdateViewProps {
  const { t } = useTranslation();
  const [records, setRecords] = useState<TBatchUpdateRecord[]>([]);
  const [checktime, setChecktime] = useState(0);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [autoCloseState, setAutoCloseState] = useState<AutoCloseState>(() => ({
    seconds: parseAutoClose(),
    cancelled: false,
  }));
  // 触发本次更新页的当前网址：命中该站点的更新在列表中优先靠前。整页生命周期内不变。
  const [site] = useState(parseSite);

  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [recordExpired, setRecordExpired] = useState(false);
  // 已播完退场动画、等待下一次全量刷新兜底的行
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const loadingRef = useRef(false);
  // 标记本次检查由用户主动发起（点击「检查更新」），用于在检查完成后弹出反馈 toast
  const userCheckPendingRef = useRef(false);
  // rowStates 的同步镜像：更新流程在 async 循环里推进，需要读到最新值而不是闭包里的快照
  const rowStatesRef = useRef<Record<string, RowState>>({});
  // 更新过程中收到的 refreshRecord 广播：先记下，等行状态全部落地后再补做，避免全量刷新冲掉乐观 UI
  const deferredReloadRef = useRef<{ finished: boolean } | null>(null);
  const timersRef = useRef<Set<number>>(new Set());

  const loadRecord = useCallback(async (): Promise<TBatchUpdateRecord[] | null> => {
    if (loadingRef.current) return null;
    loadingRef.current = true;
    try {
      const obj = await assembleRecord((i) => scriptClient.getBatchUpdateRecordLite(i));
      const list = obj?.list ?? [];
      setRecords(list);
      if (typeof obj?.checktime === "number") setChecktime(obj.checktime);
      return list;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const setTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  }, []);

  const applyReload = useCallback(
    (finished: boolean) => {
      void loadRecord().then((list) => {
        // list 为 null 表示这次刷新被并发的加载挡掉了，记录并未更新，此时不能清掉已退场的行
        if (list) setDismissed((prev) => (prev.size === 0 ? prev : new Set()));
        // 仅对用户主动发起的检查在完成后给出 toast 反馈（后台/系统检查不打扰）
        if (finished && userCheckPendingRef.current && list) {
          userCheckPendingRef.current = false;
          const { updates } = categorize(list);
          notify.success(
            updates.length > 0
              ? t("install:updatepage.toast_found", { count: updates.length })
              : t("install:updatepage.toast_uptodate")
          );
        }
      });
    },
    [loadRecord, t]
  );

  /** 行状态全部落地（只剩 fail 或为空）时，补做被推迟的全量刷新 */
  const flushDeferredReload = useCallback(() => {
    if (Object.values(rowStatesRef.current).some(isRowInFlight)) return;
    const deferred = deferredReloadRef.current;
    if (!deferred) return;
    deferredReloadRef.current = null;
    applyReload(deferred.finished);
  }, [applyReload]);

  const commitRows = useCallback((mutate: (draft: Record<string, RowState>) => void) => {
    const next = { ...rowStatesRef.current };
    mutate(next);
    rowStatesRef.current = next;
    setRowStates(next);
  }, []);

  // 初始化：订阅状态广播、上报页面已打开、拉取当前状态与记录
  useEffect(() => {
    const unsub = subscribeMessage<UpdateCheckMessage>("onScriptUpdateCheck", (msg) => {
      if (typeof msg.status === "number") {
        setChecking((msg.status & UpdateStatusCode.CHECKING_UPDATE) !== 0);
      }
      if (typeof msg.checktime === "number") setChecktime(msg.checktime);
      const finished = typeof msg.status === "number" && (msg.status & UpdateStatusCode.CHECKING_UPDATE) === 0;
      if (msg.refreshRecord || finished) {
        if (Object.values(rowStatesRef.current).some(isRowInFlight)) {
          deferredReloadRef.current = { finished: finished || (deferredReloadRef.current?.finished ?? false) };
          return;
        }
        applyReload(finished);
      }
    });
    void scriptClient.fetchCheckUpdateStatus();
    void scriptClient.sendUpdatePageOpened();
    void loadRecord();
    return unsub;
  }, [applyReload, loadRecord]);

  // 行状态推进用的定时器只在卸载时清理：不能挂在订阅那个 effect 上，
  // 否则运行时切语言（t 变化导致 effect 重跑）会把正在进行的展示/退场计时一并砍掉
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
    };
  }, []);

  // 自动关闭倒计时：每秒递减一次（标签页不可见或已取消时不动）
  useEffect(() => {
    const id = window.setInterval(() => {
      setAutoCloseState((s) => (s.seconds === null || document.hidden ? s : { ...s, seconds: s.seconds - 1 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (autoCloseState.seconds !== null && autoCloseState.seconds <= 0) window.close();
  }, [autoCloseState.seconds]);

  const cancelAutoClose = useCallback(() => {
    setAutoCloseState((s) => (s.seconds === null ? s : { seconds: null, cancelled: true }));
  }, []);

  const { updates, ignored } = useMemo(() => {
    const grouped = categorize(records, site);
    if (dismissed.size === 0) return grouped;
    return {
      updates: grouped.updates.filter((u) => !dismissed.has(u.uuid)),
      ignored: grouped.ignored.filter((u) => !dismissed.has(u.uuid)),
    };
  }, [records, site, dismissed]);

  /** 成功的行：停留展示 → 收拢退场 → 摘除节点 */
  const scheduleRowExit = useCallback(
    (uuid: string) => {
      setTimer(() => {
        commitRows((draft) => {
          if (draft[uuid]) draft[uuid] = { phase: "exiting" };
        });
        setTimer(() => {
          commitRows((draft) => delete draft[uuid]);
          setDismissed((prev) => new Set(prev).add(uuid));
          flushDeferredReload();
        }, ROW_EXIT_MS);
      }, SUCCESS_HOLD_MS);
    },
    [commitRows, flushDeferredReload, setTimer]
  );

  /**
   * 逐条发起更新：页面自己串行推进，进度即「已回报条数 / 目标条数」。
   * 之所以不让服务端广播增量进度：广播是全局的，多个更新页会互相看到对方的进度，
   * 而单条请求的返回值天然只属于发起它的这一行。
   */
  const runUpdates = useCallback(
    async (items: UpdateItem[], batch: boolean) => {
      const targets = items.filter((item) => !isRowInFlight(rowStatesRef.current[item.uuid]));
      if (targets.length === 0) return;
      cancelAutoClose();
      setRecordExpired(false);
      commitRows((draft) => {
        for (const item of targets) draft[item.uuid] = { phase: batch ? "queued" : "working" };
      });
      if (batch) setBatchProgress({ done: 0, total: targets.length, failed: 0, finished: false });

      let failed = 0;
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        commitRows((draft) => {
          draft[item.uuid] = { phase: "working" };
        });
        const res: TBatchUpdateResult | undefined = await requestBatchUpdateListAction({
          actionCode: BatchUpdateListActionCode.UPDATE,
          actionPayload: [{ uuid: item.uuid }],
        });
        if (res && !res.ok) {
          // 服务端的检查结果已失效，余下的条目连尝试的意义都没有：回到初始态，等用户重新检查
          commitRows((draft) => {
            for (let rest = i; rest < targets.length; rest++) delete draft[targets[rest].uuid];
          });
          setRecordExpired(true);
          setBatchProgress(null);
          flushDeferredReload();
          return;
        }
        const result = res?.items.find((entry) => entry.uuid === item.uuid);
        if (result?.success) {
          commitRows((draft) => {
            draft[item.uuid] = { phase: "success" };
          });
          scheduleRowExit(item.uuid);
        } else {
          failed += 1;
          commitRows((draft) => {
            draft[item.uuid] = { phase: "fail", error: result?.error ?? "" };
          });
        }
        if (batch) {
          setBatchProgress({ done: i + 1, total: targets.length, failed, finished: i + 1 === targets.length });
        }
      }

      if (batch) {
        const updated = targets.length - failed;
        // 汇总条驻留几秒后自动收起；按对象身份比对，避免收掉的是下一批的进度
        const summary: BatchProgress = { done: targets.length, total: targets.length, failed, finished: true };
        setBatchProgress(summary);
        setTimer(() => setBatchProgress((p) => (p === summary ? null : p)), SUMMARY_LINGER_MS);
        if (failed > 0) {
          notify.warning(t("install:updatepage.batch_done_partial", { updated, failed }));
        } else {
          notify.success(t("install:updatepage.batch_done", { count: updated }));
        }
      }
      flushDeferredReload();
    },
    [cancelAutoClose, commitRows, flushDeferredReload, scheduleRowExit, setTimer, t]
  );

  const onUpdate = useCallback(
    (item: UpdateItem) => {
      void runUpdates([item], false);
    },
    [runUpdates]
  );

  const onIgnore = useCallback(
    (item: UpdateItem) => {
      cancelAutoClose();
      void requestBatchUpdateListAction({
        actionCode: BatchUpdateListActionCode.IGNORE,
        actionPayload: [{ uuid: item.uuid, ignoreVersion: item.newVersion }],
      });
    },
    [cancelAutoClose]
  );

  const onUpdateSelected = useCallback(() => {
    const targets = updates.filter((u) => selected.has(u.uuid));
    setSelected(new Set());
    void runUpdates(targets, true);
  }, [updates, selected, runUpdates]);

  const onIgnoreSelected = useCallback(() => {
    cancelAutoClose();
    const payload = updates
      .filter((u) => selected.has(u.uuid))
      .map((u) => ({ uuid: u.uuid, ignoreVersion: u.newVersion }));
    if (payload.length) {
      void requestBatchUpdateListAction({ actionCode: BatchUpdateListActionCode.IGNORE, actionPayload: payload });
    }
    setSelected(new Set());
  }, [updates, selected, cancelAutoClose]);

  const onRestoreAll = useCallback(() => {
    void runUpdates(ignored, true);
  }, [ignored, runUpdates]);

  const onCheckNow = useCallback(() => {
    cancelAutoClose();
    setRecordExpired(false);
    userCheckPendingRef.current = true;
    void requestCheckScriptUpdate({ checkType: "user" });
  }, [cancelAutoClose]);

  const onToggle = useCallback(
    (uuid: string) => {
      cancelAutoClose();
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(uuid)) next.delete(uuid);
        else next.add(uuid);
        return next;
      });
    },
    [cancelAutoClose]
  );

  const onToggleAll = useCallback(() => {
    cancelAutoClose();
    setSelected((prev) => {
      if (updates.length > 0 && updates.every((u) => prev.has(u.uuid))) return new Set();
      return new Set(updates.map((u) => u.uuid));
    });
  }, [updates, cancelAutoClose]);

  const onOpen = useCallback((uuid: string) => {
    void requestOpenUpdatePageByUUID(uuid);
  }, []);

  const onOpenScriptList = useCallback(() => {
    void openInCurrentTab(SCRIPT_LIST_URL);
  }, []);

  return {
    updates,
    ignored,
    totalChecked: records.length,
    checktime,
    checking,
    loading,
    selected,
    autoClose: autoCloseState.seconds,
    autoCloseCancelled: autoCloseState.cancelled,
    rowStates,
    batchProgress,
    recordExpired,
    onToggle,
    onToggleAll,
    onUpdate,
    onIgnore,
    onRestore: onUpdate,
    onUpdateSelected,
    onIgnoreSelected,
    onRestoreAll,
    onCheckNow,
    onCancelAutoClose: cancelAutoClose,
    onOpen,
    onOpenScriptList,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { t } from "@App/locales/locales";
import type { TBatchUpdateRecord } from "@App/app/service/service_worker/types";
import { BatchUpdateListActionCode, UpdateStatusCode } from "@App/app/service/service_worker/types";
import {
  requestBatchUpdateListAction,
  requestCheckScriptUpdate,
  requestOpenUpdatePageByUUID,
  scriptClient,
} from "@App/pages/store/features/script";
import { subscribeMessage } from "@App/pages/store/global";
import { assembleRecord, categorize, type UpdateItem } from "./logic";
import type { BatchUpdateViewProps } from "./components";

/** 服务端 onScriptUpdateCheck 广播的消息体 */
interface UpdateCheckMessage {
  status?: number;
  checktime?: number;
  refreshRecord?: boolean;
}

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
  const [records, setRecords] = useState<TBatchUpdateRecord[]>([]);
  const [checktime, setChecktime] = useState(0);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [autoClose, setAutoClose] = useState<number | null>(() => parseAutoClose());
  // 触发本次更新页的当前网址：命中该站点的更新在列表中优先靠前。整页生命周期内不变。
  const siteRef = useRef(parseSite());

  const loadingRef = useRef(false);
  // 标记本次检查由用户主动发起（点击「检查更新」），用于在检查完成后弹出反馈 toast
  const userCheckPendingRef = useRef(false);

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

  // 初始化：订阅状态广播、上报页面已打开、拉取当前状态与记录
  useEffect(() => {
    const unsub = subscribeMessage<UpdateCheckMessage>("onScriptUpdateCheck", (msg) => {
      if (typeof msg.status === "number") {
        setChecking((msg.status & UpdateStatusCode.CHECKING_UPDATE) !== 0);
      }
      if (typeof msg.checktime === "number") setChecktime(msg.checktime);
      const finished = typeof msg.status === "number" && (msg.status & UpdateStatusCode.CHECKING_UPDATE) === 0;
      if (msg.refreshRecord || finished) {
        void loadRecord().then((list) => {
          // 仅对用户主动发起的检查在完成后给出 toast 反馈（后台/系统检查不打扰）
          if (finished && userCheckPendingRef.current && list) {
            userCheckPendingRef.current = false;
            const { updates } = categorize(list);
            toast.success(
              updates.length > 0
                ? t("install:updatepage.toast_found", { count: updates.length })
                : t("install:updatepage.toast_uptodate")
            );
          }
        });
      }
    });
    void scriptClient.fetchCheckUpdateStatus();
    void scriptClient.sendUpdatePageOpened();
    void loadRecord();
    return unsub;
  }, [loadRecord]);

  // 自动关闭倒计时：每秒递减一次（标签页不可见或已取消时不动）
  useEffect(() => {
    const id = window.setInterval(() => {
      setAutoClose((s) => (s === null || document.hidden ? s : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (autoClose !== null && autoClose <= 0) window.close();
  }, [autoClose]);

  const cancelAutoClose = useCallback(() => setAutoClose(null), []);

  const { updates, ignored } = useMemo(() => categorize(records, siteRef.current), [records]);

  const onUpdate = useCallback(
    (item: UpdateItem) => {
      cancelAutoClose();
      void requestBatchUpdateListAction({
        actionCode: BatchUpdateListActionCode.UPDATE,
        actionPayload: [{ uuid: item.uuid }],
      });
    },
    [cancelAutoClose]
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
    cancelAutoClose();
    const payload = updates.filter((u) => selected.has(u.uuid)).map((u) => ({ uuid: u.uuid }));
    if (payload.length) {
      void requestBatchUpdateListAction({ actionCode: BatchUpdateListActionCode.UPDATE, actionPayload: payload });
    }
    setSelected(new Set());
  }, [updates, selected, cancelAutoClose]);

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
    cancelAutoClose();
    const payload = ignored.map((u) => ({ uuid: u.uuid }));
    if (payload.length) {
      void requestBatchUpdateListAction({ actionCode: BatchUpdateListActionCode.UPDATE, actionPayload: payload });
    }
  }, [ignored, cancelAutoClose]);

  const onCheckNow = useCallback(() => {
    cancelAutoClose();
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

  return {
    updates,
    ignored,
    totalChecked: records.length,
    checktime,
    checking,
    loading,
    selected,
    autoClose,
    onToggle,
    onToggleAll,
    onUpdate,
    onIgnore,
    onRestore: onUpdate,
    onUpdateSelected,
    onIgnoreSelected,
    onRestoreAll,
    onCheckNow,
    onOpen,
  };
}

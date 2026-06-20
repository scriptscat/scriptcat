import { useCallback, useMemo, useState } from "react";
import type { SubscribeStatusType } from "@App/app/repo/subscribe";
import { requestDeleteSubscribe, type SubscribeLoading } from "@App/pages/store/features/subscribe";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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

import SubscribeTable from "./SubscribeTable";
import SubscribeListMobile from "./SubscribeListMobile";
import { useSubscribeDataManagement } from "./hooks";
import { filterAndSortSubscribes, type SubscribeSort, type SubscribeSortField } from "./filter";
import { useIsMobile } from "@App/pages/components/use-is-mobile";

/**
 * 订阅列表主组件
 */
export default function SubscribeList() {
  const { t } = useTranslation();
  const { subscribeList, setSubscribeList, loadingList } = useSubscribeDataManagement();
  const isMobile = useIsMobile();
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<SubscribeStatusType | null>(null);
  const [sort, setSort] = useState<SubscribeSort | null>(null);

  // 更新订阅（以 url 为键，引用稳定）
  const updateSubscribes = useCallback(
    (urls: string[], data: Partial<SubscribeLoading>) => {
      const set = new Set(urls);
      setSubscribeList((list) => {
        let changed = false;
        const newList = list.map((s) => {
          if (set.has(s.url)) {
            let hasDiff = false;
            const next = { ...s };
            for (const [k, v] of Object.entries(data)) {
              if ((s as unknown as Record<string, unknown>)[k] !== v) {
                hasDiff = true;
                (next as unknown as Record<string, unknown>)[k] = v;
              }
            }
            if (hasDiff) {
              changed = true;
              return next;
            }
          }
          return s;
        });
        return changed ? newList : list;
      });
    },
    [setSubscribeList]
  );

  // 状态筛选 + 名称搜索 + 排序
  const filteredList = useMemo(
    () => filterAndSortSubscribes(subscribeList, { statusFilter, keyword: searchKeyword, sort }),
    [subscribeList, statusFilter, searchKeyword, sort]
  );

  // 点击表头切换排序：升序 → 降序 → 取消
  const handleSort = useCallback((field: SubscribeSortField) => {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, order: "asc" };
      if (prev.order === "asc") return { field, order: "desc" };
      return null;
    });
  }, []);

  // 删除二次确认（删除订阅会一并删除其安装的脚本）
  const [pendingDeleteUrl, setPendingDeleteUrl] = useState<string | null>(null);

  const handleDelete = useCallback((subscribe: SubscribeLoading) => {
    setPendingDeleteUrl(subscribe.url);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteUrl) return;
    const url = pendingDeleteUrl;
    setPendingDeleteUrl(null);
    updateSubscribes([url], { actionLoading: true });
    try {
      await requestDeleteSubscribe(url);
      setSubscribeList((list) => list.filter((s) => s.url !== url));
      toast.success(t("delete_success"));
    } catch (e) {
      updateSubscribes([url], { actionLoading: false });
      toast.error(`${t("script:delete_failed")}: ${e}`);
    }
  }, [pendingDeleteUrl, updateSubscribes, setSubscribeList, t]);

  return (
    <div className="flex flex-col h-full">
      {isMobile ? (
        <SubscribeListMobile
          subscribeList={filteredList}
          loadingList={loadingList}
          updateSubscribes={updateSubscribes}
          handleDelete={handleDelete}
          searchKeyword={searchKeyword}
          setSearchKeyword={setSearchKeyword}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      ) : (
        <SubscribeTable
          subscribeList={filteredList}
          loadingList={loadingList}
          updateSubscribes={updateSubscribes}
          handleDelete={handleDelete}
          searchKeyword={searchKeyword}
          setSearchKeyword={setSearchKeyword}
          totalCount={subscribeList.length}
          sort={sort}
          onSort={handleSort}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      )}

      <AlertDialog open={!!pendingDeleteUrl} onOpenChange={(open) => !open && setPendingDeleteUrl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("script:confirm_delete_subscription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("editor:cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

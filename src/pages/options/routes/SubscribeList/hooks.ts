import { useEffect, useState } from "react";
import { fetchSubscribeList, type SubscribeLoading } from "@App/pages/store/features/subscribe";
import { subscribeMessage } from "@App/pages/store/global";
import type { TInstallSubscribe } from "@App/app/service/queue";

const sortByCreatetime = (list: SubscribeLoading[]) => [...list].sort((a, b) => a.createtime - b.createtime);

const isOlderSubscribeUpdate = (current: TInstallSubscribe["subscribe"], incoming: TInstallSubscribe["subscribe"]) =>
  current.updatetime !== undefined && (incoming.updatetime === undefined || incoming.updatetime < current.updatetime);

const upsertSubscribe = (list: SubscribeLoading[], subscribe: TInstallSubscribe["subscribe"]) => {
  const idx = list.findIndex((item) => item.url === subscribe.url);
  if (idx === -1) return sortByCreatetime([...list, subscribe]);

  const current = list[idx];
  if (isOlderSubscribeUpdate(current, subscribe)) return list;

  const newList = [...list];
  newList[idx] = {
    ...current,
    ...subscribe,
    createtime: current.createtime,
    status: current.status,
    checktime: current.checktime,
  };
  return newList;
};

const mergePendingBroadcasts = (list: SubscribeLoading[], broadcasts: Iterable<TInstallSubscribe["subscribe"]>) => {
  const byUrl = new Map(list.map((subscribe) => [subscribe.url, subscribe] as const));
  for (const subscribe of broadcasts) {
    const current = byUrl.get(subscribe.url);
    if (!current) {
      byUrl.set(subscribe.url, subscribe);
      continue;
    }

    // 快照中的操作状态可能比广播更新，广播只负责订阅内容和脚本关联。
    if (isOlderSubscribeUpdate(current, subscribe)) continue;
    byUrl.set(subscribe.url, {
      ...current,
      name: subscribe.name,
      code: subscribe.code,
      author: subscribe.author,
      scripts: subscribe.scripts,
      metadata: subscribe.metadata,
      updatetime: subscribe.updatetime,
    });
  }
  return sortByCreatetime([...byUrl.values()]);
};

/**
 * 管理订阅数据的核心逻辑：挂载时拉取一次列表，之后随后台 upsertSubscribe 广播同步新增/更新的订阅。
 * 订阅的启用/删除在页面侧做乐观更新（与 v1.4 一致，服务端不广播这两类变更）。
 */
export function useSubscribeDataManagement() {
  const [subscribeList, setSubscribeList] = useState<SubscribeLoading[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    let initialFetchPending = true;
    const pendingBroadcasts = new Map<string, TInstallSubscribe["subscribe"]>();
    const unsubscribe = subscribeMessage<TInstallSubscribe>("upsertSubscribe", ({ subscribe }) => {
      if (initialFetchPending) {
        const pending = pendingBroadcasts.get(subscribe.url);
        if (!pending || !isOlderSubscribeUpdate(pending, subscribe)) pendingBroadcasts.set(subscribe.url, subscribe);
      }
      setSubscribeList((list) => upsertSubscribe(list, subscribe));
    });

    void fetchSubscribeList()
      .then((list) => {
        if (!mounted) return;
        setSubscribeList(mergePendingBroadcasts(sortByCreatetime(list), pendingBroadcasts.values()));
        setLoadingList(false);
      })
      .finally(() => {
        initialFetchPending = false;
        pendingBroadcasts.clear();
      });

    return () => {
      mounted = false;
      initialFetchPending = false;
      pendingBroadcasts.clear();
      unsubscribe();
    };
  }, []);

  return { subscribeList, setSubscribeList, loadingList };
}

import { useEffect, useState } from "react";
import { fetchSubscribeList, type SubscribeLoading } from "@App/pages/store/features/subscribe";
import { subscribeMessage } from "@App/pages/store/global";
import type { TInstallSubscribe } from "@App/app/service/queue";

const sortByCreatetime = (list: SubscribeLoading[]) => [...list].sort((a, b) => a.createtime - b.createtime);

/**
 * 管理订阅数据的核心逻辑：挂载时拉取一次列表，之后随后台 upsertSubscribe 广播同步新增/更新的订阅。
 * 订阅的启用/删除在页面侧做乐观更新（与 v1.4 一致，服务端不广播这两类变更）。
 */
export function useSubscribeDataManagement() {
  const [subscribeList, setSubscribeList] = useState<SubscribeLoading[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    // loadingList 初始即为 true（见上方 useState），effect 仅挂载时执行一次，无需再同步置 true
    void fetchSubscribeList().then((list) => {
      if (!mounted) return;
      // 按创建时间升序，保证「#」序号稳定
      setSubscribeList(sortByCreatetime(list));
      setLoadingList(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return subscribeMessage<TInstallSubscribe>("upsertSubscribe", ({ subscribe }) => {
      setSubscribeList((list) => {
        const idx = list.findIndex((s) => s.url === subscribe.url);
        if (idx === -1) return sortByCreatetime([...list, subscribe]);
        const newList = [...list];
        newList[idx] = { ...newList[idx], ...subscribe };
        return newList;
      });
    });
  }, []);

  return { subscribeList, setSubscribeList, loadingList };
}

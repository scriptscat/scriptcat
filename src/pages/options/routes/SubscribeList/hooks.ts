import { useEffect, useState } from "react";
import { fetchSubscribeList, type SubscribeLoading } from "@App/pages/store/features/subscribe";

/**
 * 管理订阅数据的核心逻辑：挂载时拉取一次列表。
 * 订阅的启用/删除在页面侧做乐观更新（与 v1.4 一致，订阅服务端未广播列表变更）。
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
      setSubscribeList([...list].sort((a, b) => a.createtime - b.createtime));
      setLoadingList(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { subscribeList, setSubscribeList, loadingList };
}

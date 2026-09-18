import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  parseNetworkRuleError,
  type NetworkRuleClient,
  type NetworkRuleServiceError,
} from "@App/app/service/service_worker/client";
import type { NetworkRuleSnapshot } from "@App/app/service/service_worker/network_rule";
import { subscribeMessage } from "@App/pages/store/global";

export type NetworkRuleSnapshotState = {
  snapshot: NetworkRuleSnapshot | undefined;
  setSnapshot: Dispatch<SetStateAction<NetworkRuleSnapshot | undefined>>;
  loading: boolean;
  loadError: NetworkRuleServiceError | undefined;
  setLoadError: Dispatch<SetStateAction<NetworkRuleServiceError | undefined>>;
};

/**
 * 列表页与 Tools 摘要卡读的是同一份权威状态：首次拉取 + 订阅 service worker 的广播。
 * 广播可能乱序到达，revision 更旧的一律丢弃。
 */
export function useNetworkRuleSnapshot(client: NetworkRuleClient): NetworkRuleSnapshotState {
  const [snapshot, setSnapshot] = useState<NetworkRuleSnapshot>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<NetworkRuleServiceError>();

  useEffect(() => {
    let active = true;
    void client
      .getState()
      .then((next) => active && setSnapshot(next))
      .catch((error: unknown) => active && setLoadError(parseNetworkRuleError(error)))
      .finally(() => active && setLoading(false));
    const unsubscribe = subscribeMessage<NetworkRuleSnapshot>("networkRule/stateChanged", (next) => {
      setSnapshot((current) => (current && next.state.revision < current.state.revision ? current : next));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);

  return { snapshot, setSnapshot, loading, loadError, setLoadError };
}

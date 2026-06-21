import { useSyncExternalStore } from "react";
import { systemConfig } from "@App/pages/store/global";
import type { SystemConfigKey, SystemConfigValueType } from "@App/pkg/config/config";

export function useSystemConfig<K extends SystemConfigKey>(
  key: K
): [SystemConfigValueType<K> | undefined, (v: SystemConfigValueType<K>) => void] {
  const store = systemConfig.externalStore(key);
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return [value, store.set];
}

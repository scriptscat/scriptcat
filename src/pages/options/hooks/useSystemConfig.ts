import { useMemo, useSyncExternalStore } from "react";
import { systemConfig, subscribeMessage } from "@App/pages/store/global";
import { SystemConfigChange, type SystemConfigKey, type SystemConfigValueType } from "@App/pkg/config/config";
import type { TKeyValue } from "@Packages/message/message_queue";

function createSystemConfigStore<K extends SystemConfigKey>(key: K) {
  type Value = SystemConfigValueType<K> | undefined;

  let value: Value;
  let loadVersion = 0;
  let unsubscribeMessage: (() => void) | undefined;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());
  const load = () => {
    const version = ++loadVersion;
    void Promise.resolve(systemConfig.get(key)).then((next) => {
      if (version !== loadVersion || Object.is(value, next)) return;
      value = next;
      emit();
    });
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      unsubscribeMessage = subscribeMessage<TKeyValue<SystemConfigKey>>(SystemConfigChange, ({ key: changedKey }) => {
        if (changedKey === key) load();
      });
      load();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        unsubscribeMessage?.();
        unsubscribeMessage = undefined;
      }
    };
  };

  const set = (next: SystemConfigValueType<K>) => {
    ++loadVersion;
    if (!Object.is(value, next)) {
      value = next;
      emit();
    }
    systemConfig.set(key, next);
  };

  return { subscribe, getSnapshot: () => value, set };
}

export function useSystemConfig<K extends SystemConfigKey>(
  key: K
): [SystemConfigValueType<K> | undefined, (v: SystemConfigValueType<K>) => void] {
  const store = useMemo(() => createSystemConfigStore(key), [key]);
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return [value, store.set];
}

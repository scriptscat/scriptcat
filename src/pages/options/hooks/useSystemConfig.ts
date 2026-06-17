import { useEffect, useState, useCallback } from "react";
import { systemConfig, subscribeMessage } from "@App/pages/store/global";
import { SystemConfigChange, type SystemConfigKey, type SystemConfigValueType } from "@App/pkg/config/config";
import type { TKeyValue } from "@Packages/message/message_queue";

export function useSystemConfig<K extends SystemConfigKey>(
  key: K
): [SystemConfigValueType<K> | undefined, (v: SystemConfigValueType<K>) => void] {
  const [value, setValue] = useState<SystemConfigValueType<K> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    Promise.resolve(systemConfig.get(key)).then((v) => {
      if (alive) setValue(v);
    });
    const unsub = subscribeMessage<TKeyValue<SystemConfigKey>>(SystemConfigChange, ({ key: k }) => {
      if (k !== key) return;
      Promise.resolve(systemConfig.get(key)).then((v) => {
        if (alive) setValue(v);
      });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [key]);

  const update = useCallback(
    (v: SystemConfigValueType<K>) => {
      setValue(v);
      systemConfig.set(key, v);
    },
    [key]
  );

  return [value, update];
}

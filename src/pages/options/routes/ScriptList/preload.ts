import { useEffect } from "react";
import type { Script, UserConfig } from "@App/app/repo/scripts";
import { valueClient } from "@App/pages/store/features/script";
import { createPreloadableQuery } from "@App/pages/preloadable-query";

export type UserConfigPreloadData = {
  script: Script;
  userConfig: UserConfig;
  values: Record<string, unknown>;
};

const userConfigQuery = createPreloadableQuery<Script, UserConfigPreloadData | null>({
  key: (script) => `${script.uuid}:${script.updatetime ?? 0}`,
  load: async (script, signal) => {
    if (!script.config) return null;
    const values = await valueClient.getScriptValue(script);
    if (signal.aborted) throw new DOMException("UserConfig preload aborted", "AbortError");
    return { script, userConfig: script.config, values };
  },
});

export function preloadUserConfig(script: Script): Promise<UserConfigPreloadData | null> {
  return userConfigQuery.preload(script);
}

export function invalidateUserConfig(script?: Script) {
  userConfigQuery.invalidate(script);
}

export function useUserConfigPreload(script: Script) {
  const query = userConfigQuery.useQuery(script);

  useEffect(() => () => invalidateUserConfig(script), [script]);

  return query;
}

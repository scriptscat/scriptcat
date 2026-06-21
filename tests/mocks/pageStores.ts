type MockOverrides = Record<string, unknown>;

type SystemConfigMock = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => unknown;
};

function withExternalStore(systemConfig: SystemConfigMock) {
  const stores = new Map<
    string,
    {
      subscribe: (listener: () => void) => () => void;
      getSnapshot: () => unknown;
      set: (value: unknown) => void;
    }
  >();

  return {
    ...systemConfig,
    externalStore(key: string) {
      const existing = stores.get(key);
      if (existing) return existing;

      let snapshot: unknown;
      const listeners = new Set<() => void>();
      const store = {
        subscribe(listener: () => void) {
          listeners.add(listener);
          void Promise.resolve(systemConfig.get(key)).then((value) => {
            snapshot = value;
            listeners.forEach((current) => current());
          });
          return () => {
            listeners.delete(listener);
            if (listeners.size === 0) snapshot = undefined;
          };
        },
        getSnapshot: () => snapshot,
        set(value: unknown) {
          snapshot = value;
          listeners.forEach((listener) => listener());
          systemConfig.set(key, value);
        },
      };
      stores.set(key, store);
      return store;
    },
  };
}

export function createGlobalStoreMock(overrides: MockOverrides = {}) {
  const { systemConfig: systemConfigOverride, ...rest } = overrides;
  const systemConfig = {
    get: () => undefined,
    set: () => undefined,
    ...(systemConfigOverride as Partial<SystemConfigMock> | undefined),
  };
  return {
    systemConfig: withExternalStore(systemConfig),
    subscribeMessage: () => () => {},
    ...rest,
  };
}

export function createScriptStoreMock(overrides: MockOverrides = {}) {
  return {
    requestEnableScript: () => Promise.resolve(),
    scriptClient: {
      requestCheckUpdate: () => Promise.resolve(),
    },
    synchronizeClient: {},
    agentClient: {},
    ...overrides,
  };
}

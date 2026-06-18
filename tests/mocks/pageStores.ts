type MockOverrides = Record<string, unknown>;

export function createGlobalStoreMock(overrides: MockOverrides = {}) {
  return {
    systemConfig: {
      get: () => undefined,
      set: () => undefined,
    },
    subscribeMessage: () => () => {},
    ...overrides,
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

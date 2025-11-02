const mockNetworkResponses = new Map<string, any>();

export const setMockNetworkResponse = (url: string, v: any) => {
  mockNetworkResponses.set(url, v);
};

export const getMockNetworkResponse = (url: string) => {
  return mockNetworkResponses.get(url);
};

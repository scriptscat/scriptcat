type MainWorldPageLoadGateState = "waiting" | "opening" | "native" | "fallback" | "fallback-loaded";

export type MainWorldPageLoadGate = {
  onBootstrap: (bootstrapToken: string) => void;
  onFallbackPageLoad: (data: unknown) => void;
};

export const createMainWorldPageLoadGate = (
  openNativeChannel: (bootstrapToken: string) => Promise<boolean>,
  requestFallbackPageLoad: () => void = () => undefined,
  receiveFallbackPageLoad: (data: unknown) => void = () => undefined
): MainWorldPageLoadGate => {
  let state: MainWorldPageLoadGateState = "waiting";

  const finishOpening = (connected: boolean): void => {
    if (state !== "opening") return;
    state = connected ? "native" : "fallback";
    if (!connected) requestFallbackPageLoad();
  };

  return {
    onBootstrap(bootstrapToken) {
      if (state !== "waiting") return;
      state = "opening";
      void openNativeChannel(bootstrapToken).then(finishOpening, () => finishOpening(false));
    },
    onFallbackPageLoad(data) {
      if (state !== "fallback") return;
      state = "fallback-loaded";
      receiveFallbackPageLoad(data);
    },
  };
};

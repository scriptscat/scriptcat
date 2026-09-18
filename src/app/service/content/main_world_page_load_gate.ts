type MainWorldPageLoadGateState = "waiting" | "opening" | "native" | "fallback";

export type MainWorldPageLoadGate = {
  onBootstrap: (bootstrapToken: string) => void;
  onPageLoad: (data: unknown) => void;
};

export const createMainWorldPageLoadGate = (
  openNativeChannel: (bootstrapToken: string) => Promise<boolean>,
  receivePageLoad: (data: unknown) => void,
  requestFallbackPageLoad: () => void = () => undefined
): MainWorldPageLoadGate => {
  let state: MainWorldPageLoadGateState = "waiting";
  let pendingPageLoad: unknown;
  let hasPendingPageLoad = false;

  const finishOpening = (connected: boolean): void => {
    if (state !== "opening") return;
    state = connected ? "native" : "fallback";
    if (state === "fallback") requestFallbackPageLoad();
    if (state === "fallback" && hasPendingPageLoad) {
      receivePageLoad(pendingPageLoad);
    }
    pendingPageLoad = undefined;
    hasPendingPageLoad = false;
  };

  return {
    onBootstrap(bootstrapToken) {
      if (state !== "waiting") return;
      state = "opening";
      void openNativeChannel(bootstrapToken).then(finishOpening, () => finishOpening(false));
    },
    onPageLoad(data) {
      if (state === "fallback") {
        receivePageLoad(data);
        return;
      }
      if (state === "native") return;
      pendingPageLoad = data;
      hasPendingPageLoad = true;
    },
  };
};

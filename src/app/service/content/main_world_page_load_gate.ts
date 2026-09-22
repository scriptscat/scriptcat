type MainWorldPageLoadGateState = "waiting" | "opening" | "native" | "fallback";

export type MainWorldPageLoadGate = {
  onBootstrap: (bootstrapToken: string) => void;
  onPageLoad: (data: unknown) => void;
  suspendOpening: () => void;
  resumeOpening: () => void;
};

export const createMainWorldPageLoadGate = (
  openNativeChannel: (bootstrapToken: string) => Promise<boolean>,
  receivePageLoad: (data: unknown) => void,
  requestFallbackPageLoad: () => unknown = () => undefined
): MainWorldPageLoadGate => {
  let state: MainWorldPageLoadGateState = "waiting";
  let pendingPageLoad: unknown;
  let hasPendingPageLoad = false;

  const finishOpening = (connected: boolean): void => {
    if (state !== "opening") return;
    if (connected) {
      state = "native";
      pendingPageLoad = undefined;
      hasPendingPageLoad = false;
      return;
    }
    const finishFallback = (result: unknown): void => {
      if (state !== "opening") return;
      state = "fallback";
      const pageLoad =
        result && typeof result === "object" && "pageLoad" in result
          ? (result as { pageLoad?: unknown }).pageLoad
          : undefined;
      if (pageLoad !== undefined) receivePageLoad(pageLoad);
      else if (hasPendingPageLoad) receivePageLoad(pendingPageLoad);
      pendingPageLoad = undefined;
      hasPendingPageLoad = false;
    };
    const requested = requestFallbackPageLoad();
    if (requested === undefined) finishFallback(undefined);
    else Promise.resolve(requested).then(finishFallback);
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
    suspendOpening() {
      if (state === "opening") state = "waiting";
    },
    resumeOpening() {
      // A later bootstrap restarts the same generation; the caller controls the token.
    },
  };
};

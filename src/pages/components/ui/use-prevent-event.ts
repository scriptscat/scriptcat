import { useCallback } from "react";

type PreventableEvent = { preventDefault: () => void };

export function usePreventEvent() {
  return useCallback((event: PreventableEvent) => {
    event.preventDefault();
  }, []);
}

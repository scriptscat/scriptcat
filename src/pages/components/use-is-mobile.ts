import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const getSnapshot = () => window.matchMedia(QUERY).matches;

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/** 视口宽度 < MOBILE_BREAKPOINT 时返回 true,随窗口变化更新。唯一移动断点来源。 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

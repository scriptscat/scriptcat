import { useSyncExternalStore } from "react";

const QUERY = "(hover: hover)";

const getSnapshot = () => window.matchMedia(QUERY).matches;

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/**
 * 指针能否 hover（鼠标/触控板为 true,触摸屏为 false）,随设备变化更新。
 * 用于给触摸设备准备点击替代路径:纯 hover 触发的交互在触摸屏上完全够不着。
 */
export function useCanHover(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

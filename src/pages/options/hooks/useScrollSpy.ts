// src/pages/options/hooks/useScrollSpy.ts
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

export interface ScrollSpyResult {
  activeId: string;
  register: (id: string) => (el: HTMLElement | null) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollTo: (id: string) => void;
}

// 触发线距滚动容器顶部的固定像素：top 落在该线之上的最后一个分区即“当前阅读”分区。
// 必须是固定像素而非视口百分比——百分比会随视口增高而下移，使过短的首个分区永远
// 命不中触发线，导致顶部恒高亮第二项（本 bug 根因）。其值须小于首个分区的高度。
const TRIGGER_OFFSET = 96;

/**
 * 按 ids 顺序，取触发线 lineY 之上最靠下的分区；触底时强制末项
 * （过短的尾部分区无法滚动到触发线，否则永远高亮不到）。
 * 抽成纯函数以便单测覆盖选择与边界逻辑。
 * @param topOf 返回分区相对滚动容器顶部的 top(px)，未注册返回 undefined。
 */
export function selectActiveId(
  ids: string[],
  topOf: (id: string) => number | undefined,
  lineY: number,
  atBottom: boolean
): string {
  if (ids.length === 0) return "";
  if (atBottom) return ids[ids.length - 1];
  let current = ids[0];
  for (const id of ids) {
    const top = topOf(id);
    if (top !== undefined && top <= lineY) current = id;
  }
  return current;
}

export function useScrollSpy(ids: string[]): ScrollSpyResult {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? "");
  const elements = useRef<Map<string, HTMLElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 点击导航期间抑制滚动回写，避免平滑滚动途经分区抢占高亮
  const suppressUntil = useRef<number>(0);

  const register = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) elements.current.set(id, el);
      else elements.current.delete(id);
    },
    []
  );

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      if (performance.now() < suppressUntil.current) return;
      const rootTop = root.getBoundingClientRect().top;
      // 内容不足以滚动时不应误判触底，否则会高亮末项
      const scrollable = root.scrollHeight - root.clientHeight > 2;
      const atBottom = scrollable && root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
      const next = selectActiveId(
        ids,
        (id) => {
          const el = elements.current.get(id);
          return el ? el.getBoundingClientRect().top - rootTop : undefined;
        },
        TRIGGER_OFFSET,
        atBottom
      );
      if (next) setActiveId(next);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    root.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    compute();
    return () => {
      root.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids]);

  const scrollTo = useCallback((id: string) => {
    setActiveId(id);
    suppressUntil.current = performance.now() + 800;
    elements.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return useMemo(() => ({ activeId, register, scrollContainerRef, scrollTo }), [activeId, register, scrollTo]);
}

// src/pages/options/hooks/useScrollSpy.ts
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

export interface ScrollSpyResult {
  activeId: string;
  register: (id: string) => (el: HTMLElement | null) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollTo: (id: string) => void;
}

export function useScrollSpy(ids: string[]): ScrollSpyResult {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? "");
  const elements = useRef<Map<string, HTMLElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 点击导航期间抑制 IO 回写，避免动画途经分区抢占高亮
  const suppressUntil = useRef<number>(0);

  const register = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) elements.current.set(id, el);
      else elements.current.delete(id);
    },
    []
  );

  // 用 ids 顺序排序命中分区，取最靠上的可见分区为 active
  useEffect(() => {
    const root = scrollContainerRef.current;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        if (performance.now() < suppressUntil.current) return;
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.spyId;
          if (!id) continue;
          if (e.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const firstVisible = ids.find((id) => visible.has(id));
        if (firstVisible) setActiveId(firstVisible);
      },
      { root, rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    for (const id of ids) {
      const el = elements.current.get(id);
      if (el) {
        el.dataset.spyId = id;
        observer.observe(el);
      }
    }
    return () => observer.disconnect();
  }, [ids]);

  const scrollTo = useCallback((id: string) => {
    setActiveId(id);
    suppressUntil.current = performance.now() + 800;
    elements.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return useMemo(() => ({ activeId, register, scrollContainerRef, scrollTo }), [activeId, register, scrollTo]);
}

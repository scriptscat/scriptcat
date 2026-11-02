import { vi } from "vitest";

/**
 * 可控的 IntersectionObserver 桩：happy-dom 不做布局，原生实现永远不会回调，
 * 测试用 setIntersecting 手动推送某个被观察元素进出可视区。调用方负责用 act 包裹。
 * 传数组表示同一次回调里按时间先后批量投递的多条记录（真实实现在回调排队期间会累积多条）。
 */
export function mockIntersectionObserver() {
  const observers = new Set<MockIntersectionObserver>();

  class MockIntersectionObserver {
    readonly root: Element | Document | null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [0];
    readonly targets = new Set<Element>();

    constructor(
      private readonly callback: IntersectionObserverCallback,
      init?: IntersectionObserverInit
    ) {
      this.root = init?.root ?? null;
      observers.add(this);
    }

    observe(el: Element) {
      this.targets.add(el);
    }
    unobserve(el: Element) {
      this.targets.delete(el);
    }
    disconnect() {
      this.targets.clear();
      observers.delete(this);
    }
    takeRecords() {
      return [];
    }

    notify(target: Element, states: boolean[]) {
      const entries = states.map((isIntersecting) => ({
        target,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
      }));
      this.callback(entries as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
    }
  }

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

  return {
    setIntersecting(target: Element, isIntersecting: boolean | boolean[]) {
      const states = Array.isArray(isIntersecting) ? isIntersecting : [isIntersecting];
      for (const observer of [...observers]) {
        if (observer.targets.has(target)) observer.notify(target, states);
      }
    },
  };
}

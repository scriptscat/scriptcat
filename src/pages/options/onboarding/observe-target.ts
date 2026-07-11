/**
 * 定位 data-tour 目标：已存在则同步回调；否则用 rAF 轮询直至挂载或超时。
 * 消除跨路由（navigate 后目标尚未挂载）的瞬时缺目标。
 */
export function observeTarget(
  target: string,
  onFound: (el: Element | null) => void,
  opts: { timeout?: number } = {}
): () => void {
  if (target === "center") {
    onFound(null);
    return () => {};
  }
  const sel = `[data-tour="${target}"]`;
  const now = document.querySelector(sel);
  if (now) {
    onFound(now);
    return () => {};
  }
  const timeout = opts.timeout ?? 1500;
  let raf = 0;
  let cancelled = false;
  const startTs = performance.now();
  const tick = () => {
    if (cancelled) return;
    const el = document.querySelector(sel);
    if (el) {
      onFound(el);
      return;
    }
    if (performance.now() - startTs >= timeout) {
      onFound(null);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

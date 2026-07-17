export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function spotlightBox(rect: { left: number; top: number; width: number; height: number }, pad = 6): Box {
  return {
    x: rect.left - pad,
    y: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

export function getTargetRect(target: string): DOMRect | null {
  if (target === "center") return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  return el ? el.getBoundingClientRect() : null;
}

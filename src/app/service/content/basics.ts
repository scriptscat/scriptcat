export function addStyle(css: string): HTMLElement {
  const dom = document.createElement("style");
  dom.textContent = css;
  if (document.head) {
    return document.head.appendChild(dom);
  }
  return document.documentElement.appendChild(dom);
}

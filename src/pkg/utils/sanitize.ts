import DOMPurify from "dompurify";

// 允许的安全 CSS 属性白名单
const ALLOWED_CSS_PROPERTIES = new Set(["color", "font-size", "font-weight", "font-style"]);

// 过滤不安全的 CSS 属性，只保留白名单中的属性
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof HTMLElement && node.hasAttribute("style")) {
    const { style } = node;
    for (let i = style.length - 1; i >= 0; i--) {
      if (!ALLOWED_CSS_PROPERTIES.has(style[i])) {
        style.removeProperty(style[i]);
      }
    }
  }
});

// 对 HTML 进行清理，只保留安全的标签和属性
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["b", "i", "a", "br", "p", "strong", "em", "span"],
    ALLOWED_ATTR: ["href", "target", "style"],
  });
}

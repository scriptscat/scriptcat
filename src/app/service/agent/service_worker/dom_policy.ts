// agent_dom_policy.ts — Agent DOM 操作权限守卫
// 防止 Agent 操作浏览器内部页面或其他受限 URL

/**
 * 敏感 URL 前缀黑名单。
 * 初始只包含浏览器内部协议，为后续扩展（如金融域名）预留位置。
 *
 * 格式：每个条目为字符串前缀，会对 URL 做 startsWith 匹配（大小写不敏感）。
 */
export const SENSITIVE_HOST_PATTERNS: readonly string[] = [
  // 浏览器内部页面
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
  "view-source:",
  // 预留位置：如需添加敏感金融/支付域名，可在此追加
];

/**
 * 断言给定 URL 允许被 Agent DOM 操作访问。
 * 不合规则时抛出 Error，由调用方统一向 Agent 报错。
 *
 * @param url 要校验的目标 URL（navigate 传入的字符串，或 tab.url）
 * @throws {Error} 若 URL 匹配黑名单或为空
 */
export function assertDomUrlAllowed(url: string): void {
  // 空字符串拒绝（无法判断目标，安全起见拒绝）
  if (!url) {
    throw new Error("Agent DOM operation not allowed for URL: (empty)");
  }

  // about:blank 是用户刚打开的新标签页，允许
  if (url === "about:blank") {
    return;
  }

  const lower = url.toLowerCase();
  for (const pattern of SENSITIVE_HOST_PATTERNS) {
    if (lower.startsWith(pattern.toLowerCase())) {
      throw new Error(`Agent DOM operation not allowed for URL: ${url}`);
    }
  }
}

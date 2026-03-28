// 过滤掉 undefined 属性，避免 Firefox cookies API 对 undefined 值的处理差异
// Firefox 还需要 firstPartyDomain: null 以在 First-Party Isolation 开启时返回所有 cookie
export function cookieParams<T extends { [key: string]: unknown; firstPartyDomain?: any; }>(params: T): T {
  // @ts-ignore
  const isFirefox = typeof mozInnerScreenX !== "undefined";
  const cleaned = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined)
  ) as T;
  if (isFirefox) {
    cleaned.firstPartyDomain = null;
  }
  return cleaned;
}

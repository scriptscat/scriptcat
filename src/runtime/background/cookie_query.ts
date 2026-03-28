// 过滤掉 undefined 属性，避免 Firefox cookies API 对 undefined 值的处理差异
// Firefox 还需要 firstPartyDomain: null 以在 First-Party Isolation 开启时返回所有 cookie
export function cookieQuery<T extends { [key: string]: unknown; firstPartyDomain?: any; }>(query: T): T {
  const cleaned = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined)
  ) as T;
  // @ts-ignore
  if (typeof mozInnerScreenX !== "undefined") {
    cleaned.firstPartyDomain = null;
  }
  return cleaned;
}

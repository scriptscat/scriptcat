// 判断是否可重试（429 / 5xx / 网络错误，不含 4xx 客户端错误）
export function isRetryableError(e: Error): boolean {
  const msg = e.message;
  return /429|5\d\d|network|fetch|ECONNRESET/i.test(msg) && !/40[0134]/.test(msg);
}

// 指数退避重试，aborted 时立即退出
// delayFn 仅供测试注入，生产代码不传
export async function withRetry<T>(
  fn: () => Promise<T>,
  signal: AbortSignal,
  maxRetries = 3,
  delayFn?: (ms: number, signal: AbortSignal) => Promise<void>
): Promise<T> {
  const wait =
    delayFn ??
    ((ms, sig) =>
      new Promise<void>((r) => {
        const t = setTimeout(r, ms);
        sig.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            r();
          },
          { once: true }
        );
      }));

  let lastError!: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) throw lastError ?? new Error("Aborted");
    try {
      return await fn();
    } catch (e: any) {
      if (signal.aborted) throw e;
      lastError = e;
      if (!isRetryableError(e) || attempt === maxRetries) throw e;
      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
      await wait(delay, signal);
    }
  }
  throw lastError;
}

// 将 Error 分类为 errorCode 字符串
export function classifyErrorCode(e: Error): string {
  const msg = e.message;
  if (/429/.test(msg)) return "rate_limit";
  if (/401|403/.test(msg)) return "auth";
  if (/timed out/.test(msg) || (e as any).errorCode === "tool_timeout") return "tool_timeout";
  return "api_error";
}

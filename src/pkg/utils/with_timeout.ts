/**
 * 带自动清理的超时包装，避免 Promise.race 导致的 unhandled rejection 与定时器泄漏。
 * @param promise 被等待的 Promise
 * @param ms 超时毫秒数
 * @param onTimeoutError 可选：自定义超时错误构造器；默认抛 Error("operation timed out")
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeoutError?: () => Error,
  signal?: AbortSignal
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    if (signal) {
      onAbort = () => reject(new Error("Aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
    }
    timer = setTimeout(() => {
      reject(onTimeoutError ? onTimeoutError() : new Error("operation timed out"));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
    if (signal && onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  });
}

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

// provider 侧因上下文过长拒绝请求时的常见措辞（OpenAI/Anthropic 及兼容实现）。
// 本地的字节数估算是保守启发式，可能低估真实 token 数：估算认为"能放下"
// 而放行的请求仍可能被 provider 真正拒绝。没有逐 provider 精确计数的前提下，把这类错误
// 识别出来并归到与本地预判一致的 errorCode，是唯一可行的兜底恢复路径——至少能让调用方
// （UI/自动压缩）用同一套"上下文超限"处理逻辑响应，而不是当成不透明的 api_error。
const CONTEXT_LENGTH_ERROR_PATTERN =
  /context.{0,20}(length|window|too long|exceed)|exceed.{0,20}context|maximum context length|too many tokens|prompt is too long|input is too long/i;

// 将 Error 分类为 errorCode 字符串
export function classifyErrorCode(e: Error): string {
  // 抛出方已经明确标注过（如 persist_indeterminate）：这类自定义 code 携带的语义比消息
  // 文本匹配更精确，直接透传，不应被下面的启发式规则重新归类为笼统的 api_error。
  if ((e as any).errorCode === "persist_indeterminate") return "persist_indeterminate";
  const msg = e.message;
  if (CONTEXT_LENGTH_ERROR_PATTERN.test(msg)) return "context_too_large";
  if (/429/.test(msg)) return "rate_limit";
  if (/401|403/.test(msg)) return "auth";
  if (/timed out/.test(msg) || (e as any).errorCode === "tool_timeout") return "tool_timeout";
  return "api_error";
}

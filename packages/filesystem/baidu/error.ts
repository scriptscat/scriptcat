import { FileSystemError } from "../error";

export type BaiduErrorResponse = {
  errno?: number;
  httpStatus?: number;
  errmsg?: string;
  error_msg?: string;
  [key: string]: unknown;
};

const BAIDU_FILE_EXISTS_ERRNOS = new Set([31061]);

export function createBaiduFileSystemError(data: BaiduErrorResponse): FileSystemError {
  const code = typeof data.errno === "number" ? String(data.errno) : undefined;
  const status = data.httpStatus;
  const message =
    data.errmsg || data.error_msg || (code ? `Baidu request failed with errno ${code}` : "Baidu request failed");
  const conflict = typeof data.errno === "number" && BAIDU_FILE_EXISTS_ERRNOS.has(data.errno);
  const auth = data.errno === 111 || data.errno === -6 || status === 401;
  const notFound = data.errno === -9 || status === 404;
  const rateLimit = status === 429;
  // 只重试瞬时 5xx；501 等属于永久失败，重试只会空转退避
  const transient = status !== undefined && [500, 502, 503, 504].includes(status);

  return new FileSystemError({
    provider: "baidu",
    message,
    status,
    code,
    conflict,
    auth,
    notFound,
    rateLimit,
    retryable: rateLimit || transient,
    raw: data,
  });
}

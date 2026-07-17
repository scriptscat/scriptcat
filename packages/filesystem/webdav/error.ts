import { FileSystemError } from "../error";

type WebDAVLikeError = {
  message?: string;
  response?: {
    status?: number;
  };
};

export function createWebDAVFileSystemError(error: unknown): unknown {
  const webdavError = error as WebDAVLikeError;
  const status = webdavError?.response?.status;
  if (typeof status !== "number") {
    return error;
  }

  const rateLimit = status === 429;
  // 只重试瞬时 5xx；501/505/507 等属于永久失败，重试只会空转退避
  const transient = [500, 502, 503, 504].includes(status);

  return new FileSystemError({
    provider: "webdav",
    message: webdavError.message || `WebDAV request failed with status ${status}`,
    status,
    auth: status === 401 || status === 403,
    notFound: status === 404,
    // RFC 4918 中 PUT/MKCOL 的 409 是父集合不存在等前置问题，不是资源版本冲突
    conflict: status === 412,
    rateLimit,
    retryable: rateLimit || transient,
    raw: error,
  });
}

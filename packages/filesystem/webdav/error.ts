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

  return new FileSystemError({
    provider: "webdav",
    message: webdavError.message || `WebDAV request failed with status ${status}`,
    status,
    auth: status === 401 || status === 403,
    notFound: status === 404,
    conflict: status === 409 || status === 412,
    rateLimit,
    retryable: rateLimit || status >= 500,
    raw: error,
  });
}

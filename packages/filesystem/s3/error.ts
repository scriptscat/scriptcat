import { FileSystemError } from "../error";
import { S3Error } from "./client";

export function createS3FileSystemError(error: unknown): unknown {
  if (!(error instanceof S3Error)) {
    return error;
  }

  const rateLimit = error.statusCode === 429 || error.code === "SlowDown";
  // 只重试瞬时 5xx；501/505/507 等属于永久失败，重试只会空转退避
  const transient = [500, 502, 503, 504].includes(error.statusCode);

  return new FileSystemError({
    provider: "s3",
    message: error.message,
    status: error.statusCode,
    code: error.code,
    auth: error.statusCode === 401 || error.statusCode === 403,
    notFound: error.statusCode === 404 || error.code === "NoSuchKey" || error.code === "NoSuchBucket",
    conflict: error.statusCode === 409 || error.statusCode === 412 || error.code === "PreconditionFailed",
    rateLimit,
    retryable: rateLimit || transient,
    raw: error,
  });
}

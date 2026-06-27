import { FileSystemError } from "../error";
import { S3Error } from "./client";

export function createS3FileSystemError(error: unknown): unknown {
  if (!(error instanceof S3Error)) {
    return error;
  }

  const rateLimit = error.statusCode === 429 || error.code === "SlowDown";

  return new FileSystemError({
    provider: "s3",
    message: error.message,
    status: error.statusCode,
    code: error.code,
    auth: error.statusCode === 401 || error.statusCode === 403,
    notFound: error.statusCode === 404 || error.code === "NoSuchKey" || error.code === "NoSuchBucket",
    conflict: error.statusCode === 409 || error.statusCode === 412 || error.code === "PreconditionFailed",
    rateLimit,
    retryable: rateLimit || error.statusCode >= 500,
    raw: error,
  });
}

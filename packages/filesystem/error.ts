export class WarpTokenError {
  error: Error;

  constructor(error: Error) {
    this.error = error;
  }
}

export function isWarpTokenError(error: any): error is WarpTokenError {
  return error instanceof WarpTokenError;
}

export class WarpNetworkError {
  error: Error;

  constructor(error: Error) {
    this.error = error;
  }
}

export function isNetworkError(error: any): error is WarpNetworkError {
  return error instanceof WarpNetworkError;
}

export type FileSystemProvider = "googledrive" | "onedrive" | "dropbox" | "baidu" | "webdav" | "s3" | "zip";

export type FileSystemErrorOptions = {
  provider: FileSystemProvider;
  message: string;
  status?: number;
  code?: string;
  retryable?: boolean;
  conflict?: boolean;
  auth?: boolean;
  notFound?: boolean;
  rateLimit?: boolean;
  unsupported?: boolean;
  raw?: unknown;
};

export class FileSystemError extends Error {
  provider: FileSystemProvider;

  status?: number;

  code?: string;

  retryable: boolean;

  conflict: boolean;

  auth: boolean;

  notFound: boolean;

  rateLimit: boolean;

  unsupported: boolean;

  raw?: unknown;

  constructor(options: FileSystemErrorOptions) {
    super(options.message);
    this.name = "FileSystemError";
    this.provider = options.provider;
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.conflict = options.conflict ?? false;
    this.auth = options.auth ?? false;
    this.notFound = options.notFound ?? false;
    this.rateLimit = options.rateLimit ?? false;
    this.unsupported = options.unsupported ?? false;
    this.raw = options.raw;
  }
}

export function fileConflictError(
  provider: FileSystemProvider,
  message: string,
  options: Omit<FileSystemErrorOptions, "provider" | "message" | "conflict"> = {}
): FileSystemError {
  return new FileSystemError({
    ...options,
    provider,
    message,
    conflict: true,
  });
}

export function unsupportedConditionalWriteError(provider: FileSystemProvider, message: string): FileSystemError {
  return new FileSystemError({
    provider,
    message,
    code: "unsupported_conditional_write",
    unsupported: true,
  });
}

export function isNotFoundError(error: unknown): error is FileSystemError {
  return error instanceof FileSystemError && error.notFound;
}

export function isConflictError(error: unknown): error is FileSystemError {
  return error instanceof FileSystemError && error.conflict;
}

export function isRateLimitError(error: unknown): error is FileSystemError {
  return error instanceof FileSystemError && error.rateLimit;
}

export function isAuthError(error: unknown): error is FileSystemError | WarpTokenError {
  return error instanceof FileSystemError ? error.auth : isWarpTokenError(error);
}

import { FileSystemError } from "../error";

export type BaiduErrorResponse = {
  errno?: number;
  errmsg?: string;
  error_msg?: string;
  [key: string]: unknown;
};

const BAIDU_FILE_EXISTS_ERRNOS = new Set([31061]);

export function createBaiduFileSystemError(data: BaiduErrorResponse): FileSystemError {
  const code = typeof data.errno === "number" ? String(data.errno) : undefined;
  const message =
    data.errmsg || data.error_msg || (code ? `Baidu request failed with errno ${code}` : "Baidu request failed");
  const conflict = typeof data.errno === "number" && BAIDU_FILE_EXISTS_ERRNOS.has(data.errno);
  const auth = data.errno === 111 || data.errno === -6;
  const notFound = data.errno === -9;

  return new FileSystemError({
    provider: "baidu",
    message,
    code,
    conflict,
    auth,
    notFound,
    raw: data,
  });
}

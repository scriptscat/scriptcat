import type { FileCreateOptions } from "./filesystem";

export function joinPath(...paths: string[]): string {
  let path = "";
  for (let value of paths) {
    if (!value) {
      continue;
    }
    if (!value.startsWith("/")) {
      value = `/${value}`;
    }
    if (value.endsWith("/")) {
      value = value.substring(0, value.length - 1);
    }
    path += value;
  }
  return path;
}

export function buildConditionalHeaders(opts?: FileCreateOptions): Record<string, string> {
  if (opts?.createOnly) {
    return { "If-None-Match": "*" };
  }
  const expected = opts?.expectedVersion || opts?.expectedDigest;
  return expected ? { "If-Match": expected } : {};
}

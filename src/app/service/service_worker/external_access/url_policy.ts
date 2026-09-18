export const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024; // 2 MiB — 由扩展抓取，从不经过主机进程

export type UrlPolicyResult = { ok: true } | { ok: false; reason: string };

export function validateInstallUrl(rawUrl: string): UrlPolicyResult {
  try {
    new URL(rawUrl);
    return { ok: true };
  } catch {
    return { ok: false, reason: "INVALID_URL" };
  }
}

export class UrlPolicyViolation extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "UrlPolicyViolation";
  }
}

export async function fetchInstallSourceWithPolicy(url: string): Promise<string> {
  const initial = validateInstallUrl(url);
  if (!initial.ok) {
    throw new UrlPolicyViolation(initial.reason);
  }

  const resp = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (resp.status !== 200) {
    throw new Error("fetch script info failed");
  }

  const contentLength = Number(resp.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
    throw new UrlPolicyViolation("PAYLOAD_TOO_LARGE");
  }

  if (!resp.body) {
    const text = await resp.text();
    if (text.length > MAX_DOWNLOAD_BYTES) {
      throw new UrlPolicyViolation("PAYLOAD_TOO_LARGE");
    }
    return text;
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new UrlPolicyViolation("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(concatChunks(chunks, received));
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

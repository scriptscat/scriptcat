// URL 检索策略：`scripts.install.prepare` 携带 url 时，抓取前后都必须
// 通过本模块的校验；抓取本身仍走浏览器自身的 fetch（走浏览器代理/DNS），主机进程从不发起网络请求。
//
// 已知限制：扩展代码无法在建立连接前主动解析域名对应的 IP（浏览器不暴露 DNS 解析
// API），因此本模块只能拦截“语法上明显本地/内网”的目标 —— 字面量回环/私有/链路本地/
// 组播 IP，以及 localhost / *.local 主机名。真正的 DNS-rebinding（域名解析到私网 IP
// 的那一刻才暴露）无法在此层完全杜绝；这是有意为之、已在威胁模型中记录的残余风险。

export const MAX_REDIRECTS = 3;
export const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024; // 2 MiB — 由扩展抓取，从不经过主机进程

export type UrlPolicyResult = { ok: true } | { ok: false; reason: string };

const ALLOWED_SCHEME = "https:";

function isIPv4LoopbackOrPrivate(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return false;
  const [a, b] = parts.map(Number);
  if (parts.some((p) => Number(p) > 255)) return false;
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // private 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16.0.0/12
  if (a === 192 && b === 168) return true; // private 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16
  if (a >= 224 && a <= 239) return true; // multicast 224.0.0.0/4
  if (a === 0) return true; // "this network" 0.0.0.0/8
  return false;
}

function isIPv6LoopbackOrPrivate(host: string): boolean {
  // host is the bracket-stripped IPv6 literal, e.g. "::1", "fe80::1", "fc00::1".
  const lower = host.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower === "::") return true; // unspecified
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  if (lower.startsWith("ff")) return true; // multicast ff00::/8
  return false;
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local");
}

/**
 * Validates a single URL against the install-source policy: scheme, embedded credentials, and
 * syntactically-local/private/loopback/link-local/multicast destinations. Callers must re-invoke
 * this on every redirect hop, not just the initial request — a URL that starts out pointing
 * somewhere allowed can still redirect to a private target.
 */
export function validateInstallUrl(rawUrl: string): UrlPolicyResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "INVALID_URL" };
  }

  if (url.protocol !== ALLOWED_SCHEME) {
    return { ok: false, reason: "SCHEME_NOT_ALLOWED" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "EMBEDDED_CREDENTIALS" };
  }

  let hostname = url.hostname;
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  if (isLocalHostname(hostname)) {
    return { ok: false, reason: "LOCAL_HOSTNAME" };
  }
  if (hostname.includes(":")) {
    // IPv6 literal (URL.hostname keeps the brackets stripped already for IPv6).
    if (isIPv6LoopbackOrPrivate(hostname)) {
      return { ok: false, reason: "PRIVATE_DESTINATION" };
    }
  } else if (isIPv4LoopbackOrPrivate(hostname)) {
    return { ok: false, reason: "PRIVATE_DESTINATION" };
  }

  return { ok: true };
}

export class UrlPolicyViolation extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "UrlPolicyViolation";
  }
}

/**
 * Fetches a candidate install source under the policy above: initial URL validated before the
 * request, final (post-redirect) URL validated against the same policy, response streamed with a
 * hard size-abort cap. `redirect: "manual"` is not usable here — the Fetch spec forces such
 * responses to be opaque (no readable status/headers), so per-hop redirect inspection is not
 * achievable through the standard Fetch API from an extension service worker; this is a
 * documented residual limitation, not an oversight. `resp.redirected`/`resp.url` still let us
 * reject a chain that *ended up* somewhere the policy forbids, even without seeing each hop.
 */
export async function fetchInstallSourceWithPolicy(url: string): Promise<string> {
  const initial = validateInstallUrl(url);
  if (!initial.ok) {
    throw new UrlPolicyViolation(initial.reason);
  }

  const resp = await fetch(url, {
    referrer: new URL(url).origin + "/",
    headers: { "Cache-Control": "no-cache" },
  });

  const finalCheck = validateInstallUrl(resp.url || url);
  if (!finalCheck.ok) {
    throw new UrlPolicyViolation(finalCheck.reason);
  }
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

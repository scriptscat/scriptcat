import { decode as punycodeDecode } from "punycode";

function domainPunycodeDecode(s: string): string {
  if (!s.startsWith("xn--")) return s;

  try {
    // 截取 "xn--" 前缀后进行解码
    const punycodePart = s.slice(4);
    return punycodeDecode(punycodePart);
  } catch {
    return s;
  }
}

/**
 * Converts a machine-encoded URL into a human-readable format.
 */

export const prettyUrl = (s: string | undefined | null, baseUrl?: string): string => {
  if (!s) return "";

  const EXTRA = {
    DECODE_URI: 0,
    DECODE_COMP: 1,
    PRESERVE_Q: 2,
    PRESERVE_H: 4,
  } as const;
  const safeDecode = (val: string, extra: number) => {
    try {
      const decodeFn = extra & EXTRA.DECODE_COMP ? decodeURIComponent : decodeURI;
      let decoded = decodeFn(val);
      // Re-encode delimiters to prevent breaking the URL structure
      if (extra & EXTRA.PRESERVE_Q) decoded = decoded.replace(/[=&]/g, encodeURIComponent);
      if (extra & EXTRA.PRESERVE_H) decoded = decoded.replace(/ /g, encodeURIComponent);
      return decoded;
    } catch {
      return val;
    }
  };

  try {
    const u = new URL(s, baseUrl);

    // 1. Core components: Protocol, Punycode Host, and Port
    const protocol = u.protocol ? `${u.protocol}//` : "";
    const host = u.hostname
      .split(".")
      .map((p) => domainPunycodeDecode(p))
      .join(".");
    const port = u.port ? `:${u.port}` : "";

    // 2. Decode Path and Hash safely
    const path = safeDecode(u.pathname, EXTRA.DECODE_URI);
    let hash = safeDecode(u.hash, EXTRA.DECODE_URI | EXTRA.PRESERVE_H);
    if (!hash && s.endsWith("#")) hash = "#";

    // 3. Search Params: Decode key/value pairs while escaping delimiters
    const params = Array.from(new URLSearchParams(u.search));
    const m = params.map(
      ([k, v]) =>
        `${safeDecode(k, EXTRA.DECODE_COMP | EXTRA.PRESERVE_Q)}=${safeDecode(v, EXTRA.DECODE_COMP | EXTRA.PRESERVE_Q)}`
    );
    const search = params.length ? `?${m.join("&")}` : "";

    // 4. Auth: User and Password
    const user = safeDecode(u.username, EXTRA.DECODE_COMP);
    const pass = safeDecode(u.password, EXTRA.DECODE_COMP);
    const auth = user ? `${user}${pass ? `:${pass}` : ""}@` : "";

    return `${protocol}${auth}${host}${port}${path}${search}${hash}`;
  } catch {
    return s;
  }
};

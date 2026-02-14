import { decodePunycode } from "./punycode";

/**
 * Converts a machine-encoded URL into a human-readable format.
 * 把编码URL变成使用者可以阅读的格式
 */
export const prettyUrl = (s: string | undefined | null, baseUrl?: string): string => {
  if (!s) return "";

  const EXTRA = {
    DECODE_URI: 0,
    DECODE_COMP: 1,
    PRESERVE_Q: 2,
    PRESERVE_H: 4,
    PRESERVE_A: 8,
  } as const;
  const safeDecode = (val: string, extra: number) => {
    try {
      const decodeFn = extra & EXTRA.DECODE_COMP ? decodeURIComponent : decodeURI;
      let decoded = decodeFn(val);
      // Re-encode delimiters to prevent breaking the URL structure
      if (extra & EXTRA.PRESERVE_Q) decoded = decoded.replace(/[=&\s]/g, encodeURIComponent);
      if (extra & EXTRA.PRESERVE_H) decoded = decoded.replace(/\s/g, encodeURIComponent);
      if (extra & EXTRA.PRESERVE_A) decoded = decoded.replace(/[=&:@/\\\s]/g, encodeURIComponent);
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
      .map((p) => (p.startsWith("xn--") ? decodePunycode(p) : p))
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
    const user = safeDecode(u.username, EXTRA.DECODE_COMP | EXTRA.PRESERVE_A);
    const pass = safeDecode(u.password, EXTRA.DECODE_COMP | EXTRA.PRESERVE_A);
    const auth = user ? `${user}${pass ? `:${pass}` : ""}@` : "";

    return `${protocol}${auth}${host}${port}${path}${search}${hash}`;
  } catch {
    return s;
  }
};

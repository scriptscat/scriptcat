const urlSplit = (url: string) => {
  let s = url.split(/(:?\/{2,3}|:?\\{2,3}|[\\/?#])/g);
  const i = s.indexOf("?");
  if (i > 0 && s[i + 1]) {
    const search = s[i + 1];
    s = [...s.slice(0, i), "?", ...search.split(/([&=])/g), ...s.slice(i + 2)];
  }
  return s;
};

export const toEncodedURL = (inputUrl: string) => {
  const STATE = {
    INITIAL: 0,
    PATHNAME: 1,
    SEARCH: 2,
    HASH: 3,
  } as const;

  type STATE = ValueOf<typeof STATE>;
  // 1. let URL sanitize the input
  // 2. Do manual encoding if URL did not encoded correctly.
  const sanitizedInput = new URL(inputUrl);
  const originalSplit = urlSplit(inputUrl);
  const newSplit = urlSplit(sanitizedInput.href);
  let state = 0;
  let pathStartFrom = +Infinity;
  try {
    if (originalSplit.length !== newSplit.length) {
      // https://example.com?a=1&a=2&a=3 -> https://example.com/?a=1&a=2&a=3
      throw new Error("mismatch");
    }
    const finalSanitizedUrl = newSplit
      .map((x, i) => {
        if ((i & 1) === 1) if (newSplit[i] !== originalSplit[i]) throw new Error("mismatch");
        if (i < pathStartFrom) {
          if ((i & 1) === 1 && (x.endsWith("//") || x.endsWith("\\\\"))) pathStartFrom = i + 2;
          return x;
        }
        if ((i & 1) === 1) {
          if (state === STATE.INITIAL && x === "?") state = STATE.SEARCH;
          else if (state === STATE.INITIAL && x === "#") state = STATE.HASH;
          else if (state === STATE.SEARCH && x === "#") state = STATE.HASH;
          return x;
        }
        if (x.includes("%")) {
          if (state === STATE.SEARCH) {
            try {
              decodeURIComponent(x);
              return x;
            } catch {
              //ignored
            }
          } else {
            try {
              decodeURI(x);
              return x;
            } catch {
              //ignored
            }
          }
        }
        const ori = originalSplit[i];
        /*
        encodeURI allows:
        [A-Za-z0-9\-_.!~*'();,/?:@&=+$#]
        encodeURIComponent allows:
        [A-Za-z0-9\-_.!~*'()]
      */
        // const testRe = pathEnded ? /^[%\w\\.!~*'()-]+$/ : /^[%\w\\.!~*'();,/?:@&=+$#-]+$/;
        // const isEncoded = testRe.test(ori);
        // if (isEncoded) return ori;
        return state === STATE.SEARCH ? encodeURIComponent(ori) : encodeURI(ori);
      })
      .join("");
    return finalSanitizedUrl;
  } catch {
    return sanitizedInput.href;
  }
};

/**
 * Decodes Punycode (RFC 3492)
 * Fixed: logic for _adapt and _basicToDigit to match RFC specifications.
 */
const Punycode = {
  BASE: 36,
  TMIN: 1,
  TMAX: 26,
  SKEW: 38,
  DAMP: 700,
  INITIAL_BIAS: 72,
  INITIAL_N: 128,

  decode(input: string) {
    // Punycode is case-insensitive; handle labels individually
    const string = input.toLowerCase().startsWith("xn--") ? input.slice(4) : input;

    let n: number = this.INITIAL_N;
    let i = 0;
    let bias: number = this.INITIAL_BIAS;
    const output: number[] = [];

    const lastDelimiter = string.lastIndexOf("-");
    if (lastDelimiter > 0) {
      for (let j = 0; j < lastDelimiter; j++) {
        output.push(string.charCodeAt(j));
      }
    }

    let pos = lastDelimiter >= 0 ? lastDelimiter + 1 : 0;
    while (pos < string.length) {
      const oldI = i;
      let w = 1;

      for (let k = this.BASE; ; k += this.BASE) {
        const digit = this._basicToDigit(string.charCodeAt(pos++));
        i += digit * w;
        const t = k <= bias ? this.TMIN : k >= bias + this.TMAX ? this.TMAX : k - bias;
        if (digit < t) break;
        w *= this.BASE - t;
      }

      const h = output.length + 1;
      bias = this._adapt(i - oldI, h, oldI === 0);
      n += Math.floor(i / h);
      i %= h;

      output.splice(i++, 0, n);
    }

    return String.fromCodePoint(...output);
  },

  _basicToDigit(code: number) {
    if (code >= 48 && code <= 57) return code - 22; // 0-9 -> 26-35
    if (code >= 65 && code <= 90) return code - 65; // A-Z -> 0-25
    if (code >= 97 && code <= 122) return code - 97; // a-z -> 0-25
    return this.BASE;
  },

  _adapt(delta: number, numPoints: number, firstTime: boolean) {
    delta = firstTime ? Math.floor(delta / this.DAMP) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    const d = this.BASE - this.TMIN;
    const threshold = Math.floor((d * this.TMAX) / 2);
    while (delta > threshold) {
      delta = Math.floor(delta / d);
      k += this.BASE;
    }
    return k + Math.floor(((d + 1) * delta) / (delta + this.SKEW));
  },
} as const;

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
      .map((p) => (p.startsWith("xn--") ? Punycode.decode(p) : p))
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

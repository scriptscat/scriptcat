const maxInt = 2147483647; // 2^31-1
const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128;
const delimiter = "-";
const adaptD = base - tMin; // 35
const adaptL = ((adaptD + 1) * tMax) >>> 1; // 468

const ERR = {
  OVERFLOW: "Overflow: input needs wider integers",
  INVALID: "Invalid Punycode input",
} as const;

const error = (t: string) => {
  throw new RangeError(t);
};

const floor = Math.floor;

const adapt = (delta: number, numPoints: number, firstTime: boolean) => {
  delta = firstTime ? floor(delta / damp) : delta >>> 1;
  delta += floor(delta / numPoints);
  let k = 0;
  for (; delta > adaptL; k += base) delta = floor(delta / adaptD);
  return k + floor(((adaptD + 1) * delta) / (delta + skew));
};

/**
 * Decodes Punycode (RFC 3492)
 * npm package "punycode" is too large. We just need a simple and robust one.
 * Punycode is case-insensitive; decodePunycode handle labels individually without dot split
 */
export const decodePunycode = (input: string) => {
  input = input.toLowerCase();
  input = input.startsWith("xn--") ? input.slice(4) : input;
  if (!input || input.length > 251) error(ERR.INVALID);
  const output: number[] = [];
  const len = input.length;
  let i = 0;
  let n = initialN;
  let bias = initialBias;

  const k = input.lastIndexOf(delimiter);

  let j = 0;
  for (; j < k; ++j) {
    const cp = input.codePointAt(j)!;
    if (cp >= 0x80) error(ERR.INVALID);
    output.push(cp);
  }

  if (j > 0) j++;

  if (j >= len) error(ERR.INVALID);

  while (j < len) {
    const oldi = i;
    let w = 1;

    for (let k = base; ; k += base) {
      if (j >= len) error(ERR.INVALID);
      const cp = input.codePointAt(j++)!;

      let digit = -1;
      // 0-9 / A-Z / a-z
      if (cp >= 0x30 && cp < 0x3a) digit = 26 + (cp - 0x30);
      else if (cp >= 0x41 && cp < 0x5b) digit = cp - 0x41;
      else if (cp >= 0x61 && cp < 0x7b) digit = cp - 0x61;
      else error(ERR.INVALID);

      i += digit * w;
      if (i >= maxInt) error(ERR.OVERFLOW);

      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;

      if (digit < t) break;

      const baseMinusT = base - t;
      w *= baseMinusT;
      if (w >= maxInt) error(ERR.OVERFLOW);
    }

    const out = output.length + 1;
    bias = adapt(i - oldi, out, oldi === 0);
    if (bias > 198) error(ERR.OVERFLOW); // 198 is the theoretical max for 251 bytes decoding to ~0x10ffff
    n += floor(i / out);
    if (n > 0x10ffff) error(ERR.OVERFLOW);
    i %= out;

    output.splice(i++, 0, n);
  }

  return String.fromCodePoint(...output);
};

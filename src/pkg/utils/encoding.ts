import chardet from "chardet";

/**
 * 从 Content-Type header 中解析 charset
 */
export const parseCharsetFromContentType = (ct: string | null): string => {
  const m = ct ? /charset=([^;]+)/i.exec(ct) : null;
  return m ? m[1].trim().toLowerCase().replace(/['"]/g, "") : "";
};

export const decodeUTF32 = (utf32Bytes: Uint8Array, isLE: boolean = true): string => {
  if (!(utf32Bytes instanceof Uint8Array)) {
    throw new TypeError("utf32Bytes must be a Uint8Array");
  }
  const byteLen = utf32Bytes.byteLength;
  if (byteLen % 4 !== 0) {
    throw new RangeError("UTF-32 byte length must be a multiple of 4");
  }
  const numCodePoints = byteLen >>> 2;
  let u32;
  if (isLE) {
    u32 = new Uint32Array(utf32Bytes.buffer, utf32Bytes.byteOffset, numCodePoints);
  } else {
    const view = new DataView(utf32Bytes.buffer, utf32Bytes.byteOffset, byteLen);
    u32 = new Uint32Array(numCodePoints);
    for (let i = 0, j = 0; i < byteLen; i += 4) {
      u32[j++] = view.getUint32(i, false);
    }
  }
  if (u32[0] === 0x0000feff) u32 = u32.subarray(1);
  let out = "";
  for (let i = 0; i < u32.length; i += 16384) {
    out += String.fromCodePoint(...u32.subarray(i, i + 16384));
  }
  return out;
};

export const bytesDecode = (charset: string, bytes: Uint8Array): string => {
  if (charset === "utf-32le") {
    return decodeUTF32(bytes, true);
  } else if (charset === "utf-32be") {
    return decodeUTF32(bytes, false);
  } else {
    return new TextDecoder(charset).decode(bytes);
  }
};

/**
 * 检测字节数组的编码
 * 优先使用 Content-Type header，失败时使用 chardet（仅对前16KB检测以提升性能）
 */
export const detectEncoding = (data: Uint8Array, contentType: string | null): string => {
  // 优先尝试使用 Content-Type header 中的 charset
  const headerCharset = parseCharsetFromContentType(contentType);
  if (headerCharset) {
    try {
      // 验证 charset 是否有效
      new TextDecoder(headerCharset);
      return headerCharset;
    } catch (e: any) {
      console.warn(`Invalid charset from Content-Type header: ${headerCharset}, error: ${e.message}`);
    }
  }

  // 使用 chardet 检测编码，仅检测前16KB以提升性能
  const sampleSize = Math.min(data.length, 16 * 1024); // max 16KB
  const sample = data.subarray(0, sampleSize);
  const analysedResult = chardet.analyse(sample);
  let highestConfidence = 0;
  const results = [];
  let leastCharLen = Infinity;
  for (const entry of analysedResult) {
    const encoding = entry.name.toLowerCase();
    let decodedText;
    try {
      // 验证检测到的编码是否有效
      decodedText = bytesDecode(encoding, sample);
    } catch (_e: any) {
      // ignored
    }
    if (!decodedText) continue;
    if (!highestConfidence) {
      highestConfidence = entry.confidence;
      if (highestConfidence > 90) return encoding;
    } else if (highestConfidence > 70 && entry.confidence < 30) {
      // 不考虑 confidence 过低的编码
      break;
    } else if (highestConfidence > 50 && entry.confidence < 20) {
      // 不考虑 confidence 过低的编码
      break;
    }
    // 当字元符少，不足以自动判断时，改用文本重复性测试
    const chars = new Set(decodedText);
    let charLen = chars.size;
    if (charLen > leastCharLen) continue;
    if (chars.has("\ufffd")) {
      // 发现 REPLACEMENT CHARACTER，每个替代符视为独立字符，并至少增加1
      const rplCharLen = decodedText.split("\ufffd").length - 1;
      charLen += Math.max(rplCharLen, 1);
    }
    results.push({
      encoding,
      charLen: charLen,
    });
    if (charLen < leastCharLen) leastCharLen = charLen;
  }
  const ret = results.find((e) => e.charLen === leastCharLen);
  // 没有有效charset时回退到 UTF-8
  return ret?.encoding || "utf-8";
};

const detectBOM = (u8: Uint8Array): string | null => {
  // UTF-8 BOM
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return "utf-8";

  // UTF-16
  if (u8[0] === 0xff && u8[1] === 0xfe) return u8[2] === 0 && u8[3] === 0 ? "utf-32le" : "utf-16le";
  if (u8[0] === 0xfe && u8[1] === 0xff) return "utf-16be";

  // UTF-32BE
  if (u8[0] === 0 && u8[1] === 0 && u8[2] === 0xfe && u8[3] === 0xff) return "utf-32be";

  return null;
};

function guessByNullPattern(u8: Uint8Array, size = u8.length): string | null {
  if (size < 64) return null;

  const n = [0, 0, 0, 0]; // n[0..3] = count of nulls at pos % 4

  for (let i = 0; i < size; i++) {
    if (u8[i] === 0) n[i & 3]++;
  }
  const total = n[0] + n[1] + n[2] + n[3];

  if (total < size * 0.07) return null;

  const density = total / size;

  // UTF-32 — expect ~75% nulls (even with many CJK chars still ~70%+)
  if (density > 0.54) {
    const beScore = n[0] + n[1] + n[2];
    const leScore = n[1] + n[2] + n[3];

    if (beScore > leScore * 4.5 && beScore > size * 0.3) return "utf-32be";
    if (leScore > beScore * 4.5 && leScore > size * 0.3) return "utf-32le";
    return null;
  }

  // UTF-16 — expect ~25–50% nulls depending on script
  if (density > 0.1) {
    const even = n[0] + n[2];
    const odd = n[1] + n[3];

    if (even > odd * 4.2) return "utf-16be";
    if (odd > even * 4.2) return "utf-16le";
    if (even > odd * 2.1 && density > 0.2) return "utf-16be";
    if (odd > even * 2.1 && density > 0.2) return "utf-16le";
  }

  return null;
}

/**
 * Reads a Blob or File with reasonably good encoding detection
 * Priority: Content-Type header → BOM → strong UTF-16 heuristics → UTF-8 validation → legacy fallback ("windows-1252")
 * @param {Blob|File|Response} blob
 * @returns {Promise<string>}
 */
export const readBlobContent = async (blob: Blob | File | Response, contentType: string | null): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  if (uint8.length === 0) {
    return "";
  }

  // 优先尝试使用 Content-Type header 中的 charset
  const headerCharset = parseCharsetFromContentType(contentType);
  if (headerCharset) {
    try {
      // 验证 charset 是否有效
      return bytesDecode(headerCharset, uint8);
    } catch (e: any) {
      console.warn(`Invalid charset from Content-Type header: ${headerCharset}, error: ${e.message}`);
    }
  }

  // BOM detection (highest priority)
  const bomEncoding = detectBOM(uint8);
  if (bomEncoding) return bytesDecode(bomEncoding, uint8);

  const checkSize = Math.min(uint8.length, 16 * 1024);

  if (uint8.length % 2 === 0) {
    // Heuristic detection (first 16 KB)
    const heuristicEncoding = guessByNullPattern(uint8, checkSize);
    if (heuristicEncoding) return bytesDecode(heuristicEncoding, uint8);
  }

  // UTF-8 validation → legacy fallback
  let encoding = "utf-8";
  try {
    // Strict mode – throws on invalid sequences
    new TextDecoder("utf-8", { fatal: true }).decode(uint8.subarray(0, checkSize));
  } catch {
    // Invalid UTF-8 → most common real-world fallback
    encoding = "windows-1252"; // OR detectEncoding(uint8, null)
  }

  return bytesDecode(encoding, uint8);
};

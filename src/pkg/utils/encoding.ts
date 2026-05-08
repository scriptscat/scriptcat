import chardet from "chardet";

/**
 * 从 Content-Type header 中解析 charset
 */
export const parseCharsetFromContentType = (ct: string | null): string => {
  if (!ct) return "";
  const m = /charset\s*=\s*["']?([^"';\s]+)/i.exec(ct);
  return m ? m[1].toLowerCase() : "";
};

export const decodeUTF32 = (utf32Bytes: Uint8Array, isLE: boolean = true): string => {
  if (!(utf32Bytes instanceof Uint8Array)) {
    throw new TypeError("utf32Bytes must be a Uint8Array");
  }
  const byteLen = utf32Bytes.byteLength;
  if (byteLen % 4 !== 0) {
    throw new RangeError("UTF-32 byte length must be a multiple of 4");
  }
  const view = new DataView(utf32Bytes.buffer, utf32Bytes.byteOffset, byteLen);
  let out = "";
  let chunk: number[] = [];
  for (let i = 0; i < byteLen; i += 4) {
    const codePoint = view.getUint32(i, isLE);
    if (i === 0 && codePoint === 0x0000feff) continue;
    chunk.push(codePoint);
    if (chunk.length >= 16384) {
      out += String.fromCodePoint(...chunk);
      chunk = [];
    }
  }
  if (chunk.length) out += String.fromCodePoint(...chunk);
  return out;
};

export const bytesDecode = (charset: string, bytes: Uint8Array): string => {
  const normalizedCharset = charset.toLowerCase();
  if (normalizedCharset === "utf-32le") {
    return decodeUTF32(bytes, true);
  } else if (normalizedCharset === "utf-32be") {
    return decodeUTF32(bytes, false);
  } else {
    return new TextDecoder(normalizedCharset).decode(bytes);
  }
};

const unicodeEncodings = new Set(["utf-8", "ascii", "utf-16le", "utf-16be", "utf-32le", "utf-32be"]);

const CHECK_SIZE = 16 * 1024;
const FULL_UTF8_VALIDATE_LIMIT = 256 * 1024;
const MAX_UTF8_SAMPLE_RANGES = 8;
const LEGACY_SAMPLE_LIMIT = 32 * 1024;
const HEURISTIC_VALIDATE_LIMIT = 128 * 1024;

type ByteRange = [number, number];

const isUtf8ContinuationByte = (byte: number) => (byte & 0xc0) === 0x80;

const addSampleRange = (ranges: ByteRange[], data: Uint8Array, start: number, end: number) => {
  const n = data.length;
  if (n === 0) return;
  let rangeStart = Math.max(0, Math.min(start, n));
  let rangeEnd = Math.max(rangeStart, Math.min(end, n));
  while (rangeStart > 0 && isUtf8ContinuationByte(data[rangeStart])) {
    rangeStart--;
  }
  while (rangeEnd < n && isUtf8ContinuationByte(data[rangeEnd])) {
    rangeEnd++;
  }
  if (rangeStart >= rangeEnd) return;
  if (ranges.some(([existingStart, existingEnd]) => rangeStart >= existingStart && rangeEnd <= existingEnd)) return;
  ranges.push([rangeStart, rangeEnd]);
};

const createSampleRanges = (
  data: Uint8Array,
  rangeSize = CHECK_SIZE,
  maxRanges = MAX_UTF8_SAMPLE_RANGES
): ByteRange[] => {
  const n = data.length;
  if (n <= rangeSize) return [[0, n]];

  const ranges: ByteRange[] = [];
  const dk = n >>> 1;
  const rk = rangeSize >>> 1;
  addSampleRange(ranges, data, 0, rangeSize);
  addSampleRange(ranges, data, Math.max(0, dk - rk), Math.min(n, dk + rk));
  addSampleRange(ranges, data, Math.max(0, n - rangeSize), n);

  let nextHighByteSearchStart = rangeSize;
  while (ranges.length < maxRanges && nextHighByteSearchStart < n) {
    let highByteIndex = -1;
    for (let i = nextHighByteSearchStart; i < n; i++) {
      if (data[i] >= 0x80) {
        highByteIndex = i;
        break;
      }
    }
    if (highByteIndex < 0) break;

    const start = Math.max(0, highByteIndex - rk);
    const end = Math.min(data.length, start + rangeSize);
    addSampleRange(ranges, data, start, end);
    nextHighByteSearchStart = Math.max(highByteIndex + rangeSize, end);
  }

  return ranges.sort((a, b) => a[0] - b[0]);
};

const createLegacyDetectionSample = (data: Uint8Array): Uint8Array => {
  const n = data.length;
  if (n <= LEGACY_SAMPLE_LIMIT) return data;

  let firstHighByteIndex = -1;
  for (let i = 0; i < n; i++) {
    if (data[i] >= 0x80) {
      firstHighByteIndex = i;
      break;
    }
  }

  if (firstHighByteIndex < 0) {
    return data.subarray(0, LEGACY_SAMPLE_LIMIT);
  }

  const sampleStart = Math.max(0, Math.min(firstHighByteIndex - 8 * 1024, n - LEGACY_SAMPLE_LIMIT));
  return data.subarray(sampleStart, sampleStart + LEGACY_SAMPLE_LIMIT);
};

const assertLikelyUtf8 = (data: Uint8Array): void => {
  if (data.length <= FULL_UTF8_VALIDATE_LIMIT) {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    return;
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const [start, end] of createSampleRanges(data)) {
    decoder.decode(data.subarray(start, end));
  }
};

const decodeMostlyUtf8 = (data: Uint8Array): string | null => {
  const decoded = new TextDecoder("utf-8").decode(data);
  let replacements = 0;
  let nonAsciiSignals = 0;

  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    if (code === 0xfffd) {
      replacements++;
    } else if (code > 0x7f) {
      nonAsciiSignals++;
    }
  }

  if (nonAsciiSignals >= replacements * 4 && replacements > 0 && replacements <= 8) {
    return decoded;
  }

  return null;
};

const hasSuspiciousDecodedControlChars = (text: string): boolean => {
  let controls = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0xfffd || code === 0) return true;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      controls++;
    }
  }
  return controls > Math.max(4, text.length * 0.02);
};

/**
 * Legacy chardet fallback for readBlobContent.
 * Header charset, BOM, UTF null-patterns, and valid UTF-8 are handled before this runs.
 */
const legacyDetectEncoding = (data: Uint8Array): string => {
  const sample = createLegacyDetectionSample(data);
  const analysedResult = chardet.analyse(sample).sort((a, b) => b.confidence - a.confidence);
  let highestConfidence = -1;
  const results = [];
  let leastCharLen = Infinity;
  for (const entry of analysedResult) {
    const encoding = entry.name.toLowerCase();
    if (unicodeEncodings.has(encoding)) continue;
    let decodedText;
    try {
      // 验证检测到的编码是否有效
      decodedText = bytesDecode(encoding, sample);
    } catch (_e: any) {
      // ignored
    }
    if (!decodedText) continue;
    if (highestConfidence < 0) {
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
  return ret?.encoding || "windows-1252";
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
  if (u8.length % 4 === 0 && density > 0.54) {
    const laneSize = size / 4;
    const mostlyNull = laneSize * 0.65;
    const mostlyText = laneSize * 0.35;

    if (n[0] < mostlyText && n[1] > mostlyNull && n[2] > mostlyNull && n[3] > mostlyNull) return "utf-32le";
    if (n[0] > mostlyNull && n[1] > mostlyNull && n[2] > mostlyNull && n[3] < mostlyText) return "utf-32be";
  }

  // UTF-16 — expect ~25–50% nulls depending on script
  if (u8.length % 2 === 0 && density > 0.1) {
    const even = n[0] + n[2];
    const odd = n[1] + n[3];

    if (even > odd * 4.2) return "utf-16be";
    if (odd > even * 4.2) return "utf-16le";
    if (even > odd * 2.1 && density > 0.2) return "utf-16be";
    if (odd > even * 2.1 && density > 0.2) return "utf-16le";
  }

  return null;
}

const validatesHeuristicEncoding = (encoding: string, data: Uint8Array): boolean => {
  try {
    const sample = data.subarray(0, Math.min(HEURISTIC_VALIDATE_LIMIT, data.length));
    const decoded = bytesDecode(encoding, sample);
    return !hasSuspiciousDecodedControlChars(decoded);
  } catch {
    return false;
  }
};

/**
 * Reads a Blob or File with reasonably good encoding detection
 * Priority: Content-Type header → BOM → strong UTF-16/UTF-32 heuristics → UTF-8 validation → legacy detection
 * @param blob
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

  // BOM detection (after Content-Type header)
  const bomEncoding = detectBOM(uint8);
  if (bomEncoding) return bytesDecode(bomEncoding, uint8);

  const checkSize = Math.min(uint8.length, CHECK_SIZE);

  // Heuristic detection (first 16 KB)
  const heuristicEncoding = guessByNullPattern(uint8, checkSize);
  if (heuristicEncoding && validatesHeuristicEncoding(heuristicEncoding, uint8)) {
    try {
      return bytesDecode(heuristicEncoding, uint8);
    } catch {
      // Invalid full decode despite a valid sample: fall through to UTF-8/legacy.
    }
  }

  // UTF-8 validation → legacy detection
  let encoding = "utf-8";
  try {
    assertLikelyUtf8(uint8);
  } catch {
    const mostlyUtf8 = decodeMostlyUtf8(uint8);
    if (mostlyUtf8 !== null) return mostlyUtf8;

    // Invalid UTF-8 → use chardet-based legacy detection
    encoding = legacyDetectEncoding(uint8);
  }

  return bytesDecode(encoding, uint8);
};

import chardet from "chardet";

/**
 * 从 Content-Type header 中解析 charset
 */
export const parseCharsetFromContentType = (contentType: string | null): string | null => {
  if (!contentType) return null;

  const match = contentType.match(/charset=([^;]+)/i);
  if (match && match[1]) {
    return match[1].trim().toLowerCase().replace(/['"]/g, "");
  }
  return null;
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
  const numCodePoints = byteLen >>> 2;
  let u32;
  if (isLE) {
    u32 = new Uint32Array(utf32Bytes.buffer, utf32Bytes.byteOffset, numCodePoints);
  } else {
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
      // order: ++order,
    });
    if (charLen < leastCharLen) leastCharLen = charLen;
  }
  const ret = results.find((e) => e.charLen === leastCharLen);
  // 没有有效charset时回退到 UTF-8
  return ret?.encoding || "utf-8";
};

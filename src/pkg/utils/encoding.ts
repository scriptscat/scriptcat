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
  const sampleSize = Math.min(data.length, 16 * 1024);
  const sample = data.subarray(0, sampleSize);
  const detected = chardet.detect(sample);

  if (detected) {
    const encoding = detected.toLowerCase();
    try {
      // 验证检测到的编码是否有效
      new TextDecoder(encoding);
      return encoding;
    } catch (e: any) {
      console.warn(`Invalid charset detected by chardet: ${encoding}, error: ${e.message}`);
    }
  }

  // 回退到 UTF-8
  return "utf-8";
};

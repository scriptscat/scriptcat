// 检查是不是base64编码
export function isBase64(str: string): boolean {
  if (typeof str !== "string" || str.length === 0) {
    return false;
  }

  // Base64字符串必须只包含有效的Base64字符
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(str)) {
    return false;
  }

  // Base64字符串长度必须是4的倍数（如果有填充），或者没有填充的情况下可以是其他长度
  // 但要确保它不是纯数字或纯字母（避免误判十六进制字符串）
  const lengthMod4 = str.length % 4;
  if (lengthMod4 === 1) {
    // 长度除以4余数为1的字符串不可能是有效的Base64
    return false;
  }

  // 检查是否包含Base64特有的字符（+ 或 /），或者有正确的填充
  // 这样可以避免将纯十六进制字符串误判为Base64
  if (str.includes("+") || str.includes("/") || str.endsWith("=")) {
    return true;
  }

  // 如果没有特殊字符，检查是否可能是有效的Base64（但要排除明显的十六进制）
  // 十六进制字符串只包含0-9和a-f（或A-F），而Base64还包含其他字母
  const hexOnlyRegex = /^[0-9a-fA-F]+$/;
  if (hexOnlyRegex.test(str)) {
    // 这很可能是十六进制字符串，不是Base64
    return false;
  }

  return true;
}

export function base64ToHex(base64: string): string {
  const buffer = Buffer.from(base64, "base64");
  return buffer.toString("hex");
}

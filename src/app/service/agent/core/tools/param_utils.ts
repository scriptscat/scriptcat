/**
 * 工具参数校验辅助函数
 */

/** 获取必填字符串参数 */
export function requireString(args: Record<string, unknown>, name: string): string {
  const val = args[name];
  if (val == null || typeof val !== "string" || val.trim() === "") {
    throw new Error(`缺少必填参数 "${name}" 或类型不正确（需要非空字符串）`);
  }
  return val;
}

/** 获取必填数字参数 */
export function requireNumber(args: Record<string, unknown>, name: string): number {
  const val = args[name];
  if (val == null || typeof val !== "number") {
    throw new Error(`缺少必填参数 "${name}" 或类型不正确（需要数字）`);
  }
  return val;
}

/** 获取可选字符串参数 */
export function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const val = args[name];
  if (val == null) return undefined;
  if (typeof val === "string") return val;
  return String(val);
}

/** 获取可选数字参数（支持字符串转数字） */
export function optionalNumber(args: Record<string, unknown>, name: string): number | undefined {
  const val = args[name];
  if (val == null) return undefined;
  if (typeof val === "number") return val;
  const num = Number(val);
  if (isNaN(num)) return undefined;
  return num;
}

/** 获取可选布尔参数 */
export function optionalBoolean(
  args: Record<string, unknown>,
  name: string,
  defaultValue?: boolean
): boolean | undefined {
  const val = args[name];
  if (val == null) return defaultValue;
  if (typeof val === "boolean") return val;
  if (val === "true") return true;
  if (val === "false") return false;
  return defaultValue;
}

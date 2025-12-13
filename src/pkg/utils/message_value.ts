/**
 * RType 枚举 —— 表示编码后的值类型
 * - STANDARD: 标准类型（包含真实值）
 * - UNDEFINED: 表示 undefined
 * - NULL: 表示 null
 */
export const enum RType {
  STANDARD = 0,
  UNDEFINED = 1,
  NULL = 2,
}

/**
 * R_UNDEFINED —— 表示编码后的 undefined
 * 仅包含一个元素：RType.UNDEFINED
 */
export const R_UNDEFINED = [RType.UNDEFINED] as REncoded<unknown>;

/**
 * R_NULL —— 表示编码后的 null
 * 仅包含一个元素：RType.NULL
 */
export const R_NULL = [RType.NULL] as REncoded<unknown>;

/**
 * REncoded<T>
 * 已编码的结果类型，结构为一个定长元组：
 *
 * - [RType.UNDEFINED] —— 表示 undefined
 * - [RType.NULL] —— 表示 null
 * - [RType.STANDARD, T] —— 包含真实值 T
 *
 * @template T 原始值类型
 */
export type REncoded<T = unknown> = [RType.UNDEFINED] | [RType.NULL] | [RType.STANDARD, T];

/**
 * 表示一个 key-value 的键值对，其中 value 为已编码形式
 * @template T 原始值类型
 */
export type TKeyValuePair<T = unknown> = [string, REncoded<T>];

/**
 * decodeRValue
 * 反编码：将已编码的数据恢复为真实值
 *
 * @param rTyped 已编码的值
 * @returns 解码后的真实值（undefined | null | T）
 *
 * @example
 * decodeRValue([RType.UNDEFINED]) // undefined
 * decodeRValue([RType.NULL]) // null
 * decodeRValue([RType.STANDARD, 123]) // 123
 */
export const decodeRValue = <T = unknown>(rTyped: REncoded<T>) => {
  switch (rTyped[0]) {
    case RType.UNDEFINED:
      return undefined;
    case RType.NULL:
      return null;
    default:
      return rTyped[1] as T;
  }
};

/**
 * encodeRValue
 * 编码：将普通值编码为 REncoded 元组，用于稳定传输与序列化。
 *
 * @param value 原始值
 * @returns REncoded<T>
 *
 * @example
 * encodeRValue(undefined) // [RType.UNDEFINED]
 * encodeRValue(null) // [RType.NULL]
 * encodeRValue(123) // [RType.STANDARD, 123]
 */
export const encodeRValue = <T = unknown>(value: T): REncoded<T> => {
  switch (value) {
    case undefined:
      return R_UNDEFINED as [RType.UNDEFINED];
    case null:
      return R_NULL as [RType.NULL];
    default:
      return [RType.STANDARD, value] as [RType.STANDARD, T];
  }
};

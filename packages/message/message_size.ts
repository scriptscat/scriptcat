/** Chrome's documented per-message runtime limit. */
export const MAX_EXTENSION_MESSAGE_BYTES = 64 * 1024 * 1024;

export class MessageSizeError extends Error {
  constructor(
    public readonly operation: string,
    public readonly actualBytes: number,
    public readonly limitBytes: number,
    reason?: string
  ) {
    super(
      reason
        ? `${operation} message cannot be serialized: ${reason}`
        : `${operation} message exceeds limit: ${actualBytes} bytes (limit ${limitBytes} bytes)`
    );
    this.name = "MessageSizeError";
  }
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function serializeMessage(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("JSON.stringify returned undefined");
  }
  return serialized;
}

export function measureMessageBytes(value: unknown): number {
  return utf8ByteLength(serializeMessage(value));
}

export function measureStructuredMessageBytes(value: unknown): number {
  return measureMessageBytes(value) + measureStructuredBinaryBytes(value);
}

export function assertMessageSize(value: unknown, operation: string, limitBytes = MAX_EXTENSION_MESSAGE_BYTES): number {
  let bytes: number;
  try {
    bytes = measureMessageBytes(value);
  } catch (error) {
    throw new MessageSizeError(
      operation,
      Number.NaN,
      limitBytes,
      error instanceof Error ? error.message : String(error)
    );
  }
  if (bytes > limitBytes) {
    throw new MessageSizeError(operation, bytes, limitBytes);
  }
  return bytes;
}

export function assertStructuredMessageSize(
  value: unknown,
  operation: string,
  limitBytes = MAX_EXTENSION_MESSAGE_BYTES
): number {
  let bytes: number;
  try {
    bytes = measureStructuredMessageBytes(value);
  } catch (error) {
    throw new MessageSizeError(
      operation,
      Number.NaN,
      limitBytes,
      error instanceof Error ? error.message : String(error)
    );
  }
  if (bytes > limitBytes) {
    throw new MessageSizeError(operation, bytes, limitBytes);
  }
  return bytes;
}

function measureStructuredBinaryBytes(value: unknown, seen = new WeakSet<object>()): number {
  if (typeof value !== "object" || value === null || seen.has(value)) return 0;
  seen.add(value);

  if (typeof Blob !== "undefined" && value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return Object.keys(value).length === 0 ? value.byteLength : 0;

  if (value instanceof Map) {
    let total = 0;
    for (const [key, child] of value) {
      total += measureStructuredBinaryBytes(key, seen) + measureStructuredBinaryBytes(child, seen);
    }
    return total;
  }
  if (value instanceof Set) {
    let total = 0;
    for (const child of value) total += measureStructuredBinaryBytes(child, seen);
    return total;
  }

  return Object.values(value).reduce((total, child) => total + measureStructuredBinaryBytes(child, seen), 0);
}

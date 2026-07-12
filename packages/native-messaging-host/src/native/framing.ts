// Chrome native-messaging framing: 4-byte little-endian length prefix + UTF-8 JSON (doc 03 §2).
// Streaming decoder: feed arbitrary chunks (split or coalesced across reads), get back complete
// messages as they arrive. An oversize message drops only THAT message and keeps the stream
// aligned — this is an explicit regression guard against the prelim's `buf = Buffer.alloc(0)` on
// overflow, which discarded any partial data already buffered for the NEXT message and
// permanently desynchronized the stream (doc 03 §2, doc 08 §6).

const LENGTH_PREFIX_BYTES = 4;

export type FrameResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "OVERSIZE" | "PARSE_ERROR"; byteLength?: number };

export class FramingDecoder {
  private buffer: Buffer = Buffer.alloc(0);
  // Bytes of an oversize message body still to discard. Kept out of `buffer` so a multi-chunk
  // oversize payload never grows our own memory usage past maxMessageBytes.
  private skipRemaining = 0;

  constructor(private readonly maxMessageBytes: number) {}

  /** Feed a chunk; returns every complete message decoded from the buffer so far, in order. */
  push(chunk: Buffer): FrameResult[] {
    const results: FrameResult[] = [];
    let offset = 0;

    if (this.skipRemaining > 0) {
      const skipped = Math.min(this.skipRemaining, chunk.length);
      this.skipRemaining -= skipped;
      offset += skipped;
      if (this.skipRemaining === 0) {
        results.push({ ok: false, reason: "OVERSIZE" });
      }
      if (offset >= chunk.length) return results;
    }

    const rest = chunk.subarray(offset);
    this.buffer = this.buffer.length === 0 ? rest : Buffer.concat([this.buffer, rest]);

    for (;;) {
      if (this.buffer.length < LENGTH_PREFIX_BYTES) break;
      const messageLength = this.buffer.readUInt32LE(0);

      if (messageLength > this.maxMessageBytes) {
        const bodyAvailable = this.buffer.length - LENGTH_PREFIX_BYTES;
        if (bodyAvailable >= messageLength) {
          this.buffer = this.buffer.subarray(LENGTH_PREFIX_BYTES + messageLength);
          results.push({ ok: false, reason: "OVERSIZE", byteLength: messageLength });
          continue;
        }
        // Body hasn't fully arrived yet — switch to streaming-skip mode instead of buffering a
        // potentially huge payload in memory while we wait for the rest of it.
        this.skipRemaining = messageLength - bodyAvailable;
        this.buffer = Buffer.alloc(0);
        break;
      }

      if (this.buffer.length < LENGTH_PREFIX_BYTES + messageLength) break; // wait for more data

      const body = this.buffer.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + messageLength);
      this.buffer = this.buffer.subarray(LENGTH_PREFIX_BYTES + messageLength);
      try {
        results.push({ ok: true, value: JSON.parse(body.toString("utf-8")) });
      } catch {
        results.push({ ok: false, reason: "PARSE_ERROR" });
      }
    }

    return results;
  }
}

/** Encodes a single JSON-serializable value into the 4-byte-LE-prefixed native-messaging frame. */
export function encodeFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), "utf-8");
  const header = Buffer.alloc(LENGTH_PREFIX_BYTES);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

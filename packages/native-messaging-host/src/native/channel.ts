import * as crypto from "node:crypto";
import { FramingDecoder, encodeFrame } from "./framing.js";
import type { NativeEnvelope, NativeMessageType } from "../shared/protocol.js";

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Host-side duplex channel to the browser over native messaging. Wraps the framing codec with
 * request/response correlation: `request()` sends a `bridge.request` and resolves when the
 * matching `bridge.response` arrives (same requestId) or the bounded timeout fires. requestId is
 * a cryptographically random UUID, never a sequential counter (predictable IDs would let one
 * client guess or interfere with another's in-flight request), and the pending map is bounded —
 * entries are removed on resolve/reject/timeout, never accumulate. Unsolicited
 * extension-initiated messages (`pair.decision`, `client.revoke`, `operations.changed`, `pong`)
 * are delivered to `onMessage` listeners instead.
 */
export class NativeChannel {
  private readonly decoder: FramingDecoder;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly messageListeners: Array<(envelope: NativeEnvelope) => void> = [];

  constructor(
    maxMessageBytes: number,
    private readonly requestTimeoutMs: number,
    private readonly write: (buf: Buffer) => void
  ) {
    this.decoder = new FramingDecoder(maxMessageBytes);
  }

  /** Feed raw bytes read from the native-messaging stdin stream. */
  feed(chunk: Buffer): void {
    for (const result of this.decoder.push(chunk)) {
      if (!result.ok) continue; // oversize/malformed frame: drop it, stream stays aligned
      this.handleEnvelope(result.value as NativeEnvelope);
    }
  }

  private handleEnvelope(envelope: NativeEnvelope): void {
    if (envelope.type === "bridge.response") {
      const pending = this.pending.get(envelope.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(envelope.requestId);
        pending.resolve(envelope.payload);
      }
      return;
    }
    for (const listener of this.messageListeners) listener(envelope);
  }

  /** Subscribe to unsolicited extension-initiated messages; returns an unsubscribe function. */
  onMessage(listener: (envelope: NativeEnvelope) => void): () => void {
    this.messageListeners.push(listener);
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index >= 0) this.messageListeners.splice(index, 1);
    };
  }

  /** Fire-and-forget send (used for ping, bridge.shutdown, etc.). */
  send(type: NativeMessageType, payload: unknown, requestId: string = crypto.randomUUID()): void {
    const envelope: NativeEnvelope = { v: 1, type, requestId, payload };
    this.write(encodeFrame(envelope));
  }

  /** Sends a request and resolves with the correlated response payload, or rejects on timeout. */
  request(type: NativeMessageType, payload: unknown): Promise<unknown> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("NATIVE_REQUEST_TIMEOUT"));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.send(type, payload, requestId);
    });
  }

  /** Rejects every in-flight request (e.g. on stdin close) so callers don't hang forever. */
  rejectAllPending(reason: Error): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(reason);
      this.pending.delete(requestId);
    }
  }
}

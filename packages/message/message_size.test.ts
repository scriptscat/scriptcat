import { describe, expect, it, vi } from "vitest";
import {
  MAX_EXTENSION_MESSAGE_BYTES,
  MessageSizeError,
  assertMessageSize,
  measureMessageBytes,
  measureStructuredMessageBytes,
  utf8ByteLength,
} from "./message_size";
import { ExtensionMessage } from "./extension_message";

describe("message size accounting", () => {
  it("counts UTF-8 bytes after JSON escaping", () => {
    const value = { data: '你好"\\😀' };
    const serialized = JSON.stringify(value);

    expect(utf8ByteLength(serialized)).toBe(new TextEncoder().encode(serialized).byteLength);
    expect(measureMessageBytes(value)).toBe(utf8ByteLength(serialized));
    expect(measureMessageBytes(value)).toBeGreaterThan(value.data.length);
  });

  it("measures the complete envelope and accepts exact limits", () => {
    const envelope = { messageId: "m1", type: "sendMessage", data: { action: "resource", data: "x" } };
    const bytes = measureMessageBytes(envelope);

    expect(() => assertMessageSize(envelope, "test-channel", bytes)).not.toThrow();
    expect(() => assertMessageSize(envelope, "test-channel", bytes - 1)).toThrow(
      new MessageSizeError("test-channel", bytes, bytes - 1).message
    );
  });

  it("includes base64 expansion and reports deterministic over-limit diagnostics", () => {
    const envelope = {
      msgQueue: "backup",
      data: { action: "message", message: { base64: "data:image/png;base64," + "A0==" } },
    };
    const bytes = measureMessageBytes(envelope);
    const error = (() => {
      try {
        assertMessageSize(envelope, "message-queue", bytes - 1);
        return undefined;
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(MessageSizeError);
    expect((error as MessageSizeError).message).toBe(
      `message-queue message exceeds limit: ${bytes} bytes (limit ${bytes - 1} bytes)`
    );
  });

  it("counts binary payloads on structured-clone channels", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" });
    const envelope = { messageId: "m1", type: "sendMessage", data: { blob } };

    expect(measureStructuredMessageBytes(envelope)).toBe(measureMessageBytes(envelope) + blob.size);
  });

  it("counts binary values nested in Map and Set structured-clone payloads", () => {
    const mapBlob = new Blob([new Uint8Array([1, 2])]);
    const setBlob = new Blob([new Uint8Array([3, 4, 5])]);
    const envelope = { data: new Map([["blob", mapBlob]]), values: new Set([setBlob]) };

    expect(measureStructuredMessageBytes(envelope)).toBe(measureMessageBytes(envelope) + mapBlob.size + setBlob.size);
  });

  it("rejects an oversized extension message before calling chrome.runtime", async () => {
    const sendMessage = vi.spyOn(chrome.runtime, "sendMessage");
    const message = new ExtensionMessage();

    await expect(
      message.sendMessage({ action: "large", data: "x".repeat(MAX_EXTENSION_MESSAGE_BYTES) })
    ).rejects.toBeInstanceOf(MessageSizeError);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { REQUEST_SEQUENCE_WINDOW_SIZE, RequestSequenceWindow } from "./request_sequence_window";

describe("RequestSequenceWindow", () => {
  it("accepts out-of-order requests once within its bounded window", () => {
    const window = new RequestSequenceWindow();

    window.consume(1);
    window.consume(3);
    window.consume(2);

    expect(() => window.consume(2)).toThrow("already used");
  });

  it("accepts a large forward gap on a fresh window", () => {
    // 本地 CAT_createBlobUrl / CAT_fetchBlob / CAT_fetchDocument 等 broker-only
    // 请求会消耗上下文序列号但从不到达 SW，因此 SW 端合法请求的序列号
    // 可能一次性领先超过 4096。
    const window = new RequestSequenceWindow();

    expect(() => window.consume(REQUEST_SEQUENCE_WINDOW_SIZE + 1)).not.toThrow();
  });

  it("resets the bitmap in bounded work exactly at the window-size boundary", () => {
    const window = new RequestSequenceWindow();

    window.consume(1);
    expect(() => window.consume(1 + REQUEST_SEQUENCE_WINDOW_SIZE)).not.toThrow();
    expect(() => window.consume(1)).toThrow("replay window");
  });

  it("accepts forward gaps larger than the window size", () => {
    const window = new RequestSequenceWindow();

    window.consume(1);
    expect(() => window.consume(1 + REQUEST_SEQUENCE_WINDOW_SIZE * 3)).not.toThrow();
  });

  it("still rejects a duplicate sequence after a large forward jump", () => {
    const window = new RequestSequenceWindow();
    const farSequence = REQUEST_SEQUENCE_WINDOW_SIZE * 5;

    window.consume(farSequence);

    expect(() => window.consume(farSequence)).toThrow("already used");
  });

  it("still rejects a sequence older than the retained history after a large forward jump", () => {
    const window = new RequestSequenceWindow();

    window.consume(1);
    window.consume(1 + REQUEST_SEQUENCE_WINDOW_SIZE);

    expect(() => window.consume(1)).toThrow("replay window");
  });

  it("keeps fixed-size replay state as sequence numbers advance", () => {
    const window = new RequestSequenceWindow();

    for (let sequence = 1; sequence <= REQUEST_SEQUENCE_WINDOW_SIZE * 4; sequence += 1) {
      window.consume(sequence);
    }

    expect((window as unknown as { bitmap: Uint32Array }).bitmap).toHaveLength(REQUEST_SEQUENCE_WINDOW_SIZE / 32);
    expect(() => window.consume(1)).toThrow("replay window");
  });

  it("keeps fixed-size replay state after an arbitrarily large forward jump", () => {
    const window = new RequestSequenceWindow();

    window.consume(Number.MAX_SAFE_INTEGER - 10);

    expect((window as unknown as { bitmap: Uint32Array }).bitmap).toHaveLength(REQUEST_SEQUENCE_WINDOW_SIZE / 32);
  });

  it("rejects non-positive and non-safe sequence numbers", () => {
    const window = new RequestSequenceWindow();

    expect(() => window.consume(0)).toThrow("sequence is invalid");
    expect(() => window.consume(Number.MAX_SAFE_INTEGER + 1)).toThrow("sequence is invalid");
  });
});

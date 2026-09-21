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

  it("rejects sequences outside the forward and replay window", () => {
    const window = new RequestSequenceWindow();

    expect(() => window.consume(REQUEST_SEQUENCE_WINDOW_SIZE + 1)).toThrow("replay window");
    window.consume(1);
    window.consume(REQUEST_SEQUENCE_WINDOW_SIZE + 1);

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

  it("rejects non-positive and non-safe sequence numbers", () => {
    const window = new RequestSequenceWindow();

    expect(() => window.consume(0)).toThrow("sequence is invalid");
    expect(() => window.consume(Number.MAX_SAFE_INTEGER + 1)).toThrow("sequence is invalid");
  });
});

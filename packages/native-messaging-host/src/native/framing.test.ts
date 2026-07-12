import { describe, it, expect } from "vitest";
import { FramingDecoder, encodeFrame } from "./framing";

const MAX = 1024;

describe("FramingDecoder - 4 字节小端长度前缀分帧", () => {
  it("单个完整帧一次性到达时正确解码", () => {
    const decoder = new FramingDecoder(MAX);
    const results = decoder.push(encodeFrame({ hello: "world" }));
    expect(results).toEqual([{ ok: true, value: { hello: "world" } }]);
  });

  it("一次 push 内包含多个拼接在一起的完整帧", () => {
    const decoder = new FramingDecoder(MAX);
    const combined = Buffer.concat([encodeFrame({ a: 1 }), encodeFrame({ b: 2 })]);
    const results = decoder.push(combined);
    expect(results).toEqual([
      { ok: true, value: { a: 1 } },
      { ok: true, value: { b: 2 } },
    ]);
  });

  it("单个帧被拆分成多次 push 到达时仍正确重组", () => {
    const decoder = new FramingDecoder(MAX);
    const frame = encodeFrame({ split: "message", padding: "x".repeat(100) });
    const mid = Math.floor(frame.length / 2);
    expect(decoder.push(frame.subarray(0, mid))).toEqual([]);
    expect(decoder.push(frame.subarray(mid))).toEqual([
      { ok: true, value: { split: "message", padding: "x".repeat(100) } },
    ]);
  });

  it("拆分点恰好落在长度前缀内部也能正确重组", () => {
    const decoder = new FramingDecoder(MAX);
    const frame = encodeFrame({ tiny: 1 });
    expect(decoder.push(frame.subarray(0, 2))).toEqual([]);
    expect(decoder.push(frame.subarray(2))).toEqual([{ ok: true, value: { tiny: 1 } }]);
  });

  it("超大帧（一次性到达完整体）只丢弃该帧，不影响后续帧 —— 回归内部缓冲区被整体清空导致后续帧丢失的 bug", () => {
    const decoder = new FramingDecoder(MAX);
    const oversizeBody = Buffer.from(JSON.stringify({ big: "x".repeat(MAX + 100) }), "utf-8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(oversizeBody.length, 0);
    const oversizeFrame = Buffer.concat([header, oversizeBody]);
    const nextFrame = encodeFrame({ ok: "still aligned" });

    const results = decoder.push(Buffer.concat([oversizeFrame, nextFrame]));
    expect(results).toEqual([
      { ok: false, reason: "OVERSIZE", byteLength: oversizeBody.length },
      { ok: true, value: { ok: "still aligned" } },
    ]);
  });

  it("超大帧体跨多次 push 到达时也只丢弃该帧，且不在内存中缓冲整个超大体", () => {
    const decoder = new FramingDecoder(MAX);
    const oversizeLen = MAX + 500;
    const header = Buffer.alloc(4);
    header.writeUInt32LE(oversizeLen, 0);
    const firstHalf = Buffer.alloc(300, "a");
    const secondHalf = Buffer.alloc(oversizeLen - 300, "b");
    const nextFrame = encodeFrame({ recovered: true });

    expect(decoder.push(Buffer.concat([header, firstHalf]))).toEqual([]);
    const results = decoder.push(Buffer.concat([secondHalf, nextFrame]));
    expect(results).toEqual([
      { ok: false, reason: "OVERSIZE" },
      { ok: true, value: { recovered: true } },
    ]);
  });

  it("请求恰好等于上限时被接受", () => {
    const decoder = new FramingDecoder(MAX);
    // Construct a payload whose encoded body is exactly MAX bytes.
    const filler = "x".repeat(MAX - JSON.stringify({ p: "" }).length);
    const value = { p: filler };
    const frame = encodeFrame(value);
    expect(Buffer.byteLength(JSON.stringify(value), "utf-8")).toBeLessThanOrEqual(MAX);
    const results = decoder.push(frame);
    expect(results).toEqual([{ ok: true, value }]);
  });

  it("消息体不是合法 JSON 时返回 PARSE_ERROR，且不影响下一帧", () => {
    const decoder = new FramingDecoder(MAX);
    const badBody = Buffer.from("not json", "utf-8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(badBody.length, 0);
    const badFrame = Buffer.concat([header, badBody]);
    const nextFrame = encodeFrame({ recovered: true });

    const results = decoder.push(Buffer.concat([badFrame, nextFrame]));
    expect(results).toEqual([
      { ok: false, reason: "PARSE_ERROR" },
      { ok: true, value: { recovered: true } },
    ]);
  });

  it("空 push 不产生任何结果", () => {
    const decoder = new FramingDecoder(MAX);
    expect(decoder.push(Buffer.alloc(0))).toEqual([]);
  });
});

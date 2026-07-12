import { describe, it, expect, vi, afterEach } from "vitest";
import { NativeChannel } from "./channel";
import { encodeFrame } from "./framing";
import type { NativeEnvelope } from "../shared/protocol";

const MAX = 1024 * 1024;

describe("NativeChannel - 主机↔浏览器请求关联（doc 03 §2, doc 02 §6）", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("request() 发送 bridge.request，收到匹配 requestId 的 bridge.response 后 resolve", async () => {
    const written: Buffer[] = [];
    const channel = new NativeChannel(MAX, 30_000, (buf) => written.push(buf));

    const promise = channel.request("bridge.request", { action: "scripts.list" });
    // Simulate the extension replying: decode what we wrote to recover the requestId.
    const sentEnvelope = decodeLastWritten(written);
    channel.feed(
      encodeFrame({ v: 1, type: "bridge.response", requestId: sentEnvelope.requestId, payload: { ok: true } })
    );

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("不匹配 requestId 的 bridge.response 不会 resolve 无关请求", async () => {
    const written: Buffer[] = [];
    const channel = new NativeChannel(MAX, 200, (buf) => written.push(buf));
    const promise = channel.request("bridge.request", {});
    channel.feed(encodeFrame({ v: 1, type: "bridge.response", requestId: "unrelated-id", payload: { ok: true } }));

    await expect(promise).rejects.toThrow("NATIVE_REQUEST_TIMEOUT");
  });

  it("超过超时时间未收到响应时 reject", async () => {
    vi.useFakeTimers();
    const channel = new NativeChannel(MAX, 1000, () => {});
    const promise = channel.request("bridge.request", {});
    const assertion = expect(promise).rejects.toThrow("NATIVE_REQUEST_TIMEOUT");
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it("send() 是即发即忘，不建立 pending 条目", async () => {
    const written: Buffer[] = [];
    const channel = new NativeChannel(MAX, 30_000, (buf) => written.push(buf));
    channel.send("ping", {});
    expect(written).toHaveLength(1);
    const envelope = decodeLastWritten(written);
    expect(envelope.type).toBe("ping");
  });

  it("onMessage 订阅收到非响应类的未经请求消息（如 pong / client.sync）", () => {
    const channel = new NativeChannel(MAX, 30_000, () => {});
    const received: NativeEnvelope[] = [];
    channel.onMessage((envelope) => received.push(envelope));

    channel.feed(encodeFrame({ v: 1, type: "pong", requestId: "x", payload: {} }));
    channel.feed(encodeFrame({ v: 1, type: "client.sync", requestId: "y", payload: { clients: [] } }));

    expect(received.map((e) => e.type)).toEqual(["pong", "client.sync"]);
  });

  it("取消订阅后不再收到消息", () => {
    const channel = new NativeChannel(MAX, 30_000, () => {});
    const received: NativeEnvelope[] = [];
    const unsubscribe = channel.onMessage((envelope) => received.push(envelope));
    unsubscribe();
    channel.feed(encodeFrame({ v: 1, type: "pong", requestId: "x", payload: {} }));
    expect(received).toHaveLength(0);
  });

  it("rejectAllPending 使所有在途请求立即 reject", async () => {
    const channel = new NativeChannel(MAX, 30_000, () => {});
    const p1 = channel.request("bridge.request", {});
    const p2 = channel.request("bridge.request", {});
    channel.rejectAllPending(new Error("stdin closed"));
    await expect(p1).rejects.toThrow("stdin closed");
    await expect(p2).rejects.toThrow("stdin closed");
  });

  it("跨多个 chunk 拆分到达的帧仍能正确关联响应", async () => {
    const written: Buffer[] = [];
    const channel = new NativeChannel(MAX, 30_000, (buf) => written.push(buf));
    const promise = channel.request("bridge.request", {});
    const sentEnvelope = decodeLastWritten(written);
    const frame = encodeFrame({ v: 1, type: "bridge.response", requestId: sentEnvelope.requestId, payload: "done" });
    const mid = Math.floor(frame.length / 2);
    channel.feed(frame.subarray(0, mid));
    channel.feed(frame.subarray(mid));
    await expect(promise).resolves.toBe("done");
  });
});

function decodeLastWritten(written: Buffer[]): NativeEnvelope {
  const buf = written[written.length - 1];
  const bodyLength = buf.readUInt32LE(0);
  return JSON.parse(buf.subarray(4, 4 + bodyLength).toString("utf-8"));
}

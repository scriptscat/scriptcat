import { describe, it, expect } from "vitest";
import { SSEParser } from "./sse_parser";

describe("SSEParser", () => {
  it("应正确解析单个 SSE 事件", () => {
    const parser = new SSEParser();
    const events = parser.parse('data: {"text":"hello"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("message");
    expect(events[0].data).toBe('{"text":"hello"}');
  });

  it("应正确解析带 event 字段的事件", () => {
    const parser = new SSEParser();
    const events = parser.parse('event: content_block_delta\ndata: {"delta":"hi"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("content_block_delta");
    expect(events[0].data).toBe('{"delta":"hi"}');
  });

  it("应正确处理跨 chunk 的事件", () => {
    const parser = new SSEParser();
    const events1 = parser.parse('data: {"text":');
    expect(events1).toHaveLength(0);
    const events2 = parser.parse('"hello"}\n\n');
    expect(events2).toHaveLength(1);
    expect(events2[0].data).toBe('{"text":"hello"}');
  });

  it("应正确解析多个连续事件", () => {
    const parser = new SSEParser();
    const events = parser.parse('data: {"a":1}\n\ndata: {"b":2}\n\n');
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe('{"a":1}');
    expect(events[1].data).toBe('{"b":2}');
  });

  it("应忽略注释行", () => {
    const parser = new SSEParser();
    const events = parser.parse(": comment\ndata: test\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("test");
  });

  it("应正确处理 \\r\\n 换行符", () => {
    const parser = new SSEParser();
    const events = parser.parse("data: hello\r\n\r\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello");
  });

  it("应正确处理多行 data 字段（拼接为换行符分隔）", () => {
    const parser = new SSEParser();
    const events = parser.parse("data: line1\ndata: line2\ndata: line3\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("line1\nline2\nline3");
  });

  it("应忽略没有冒号的行", () => {
    const parser = new SSEParser();
    const events = parser.parse("invalid-line\ndata: valid\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("valid");
  });

  it("空行但无 data 时不应产生事件", () => {
    const parser = new SSEParser();
    const events = parser.parse("\n\n");
    expect(events).toHaveLength(0);
  });

  it("data 冒号后无空格时应正确解析", () => {
    const parser = new SSEParser();
    const events = parser.parse("data:no-space\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("no-space");
  });

  it("data 为空字符串时应正确解析", () => {
    const parser = new SSEParser();
    const events = parser.parse("data: \n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("");
  });

  it("reset 后应清除所有状态", () => {
    const parser = new SSEParser();
    // 先输入一个不完整的事件
    parser.parse("data: partial");
    parser.reset();
    // reset 后新的输入应从头开始
    const events = parser.parse("data: fresh\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("fresh");
  });

  it("reset 后之前的 event 字段不应残留", () => {
    const parser = new SSEParser();
    parser.parse("event: old_type\n");
    parser.reset();
    const events = parser.parse("data: new\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("message"); // 不应是 old_type
  });

  it("应处理跨多个 chunk 的复杂场景", () => {
    const parser = new SSEParser();
    // chunk1: event 和部分 data
    const e1 = parser.parse("event: test\ndata: part");
    expect(e1).toHaveLength(0);
    // chunk2: data 剩余部分和空行
    const e2 = parser.parse("ial\n\n");
    expect(e2).toHaveLength(1);
    expect(e2[0].event).toBe("test");
    expect(e2[0].data).toBe("partial");
  });

  it("连续空行不应产生重复事件", () => {
    const parser = new SSEParser();
    const events = parser.parse("data: once\n\n\n\n");
    expect(events).toHaveLength(1);
  });

  it("应忽略未知字段", () => {
    const parser = new SSEParser();
    const events = parser.parse("id: 123\nretry: 5000\ndata: hello\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello");
  });
});

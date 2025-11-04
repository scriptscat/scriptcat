import { describe, it, expect } from "vitest";
import { type IGetSender } from "@Packages/message/server";
import { type ExtMessageSender } from "@Packages/message/types";
import { isConnectMatched } from "./gm_api";

// 小工具：建立假的 IGetSender
const makeSender = (url?: string): IGetSender => ({
  getSender: () => (url ? { url } : {}),
  getType: () => 0,
  isType: (_type: any) => false,
  getExtMessageSender: () => null as unknown as ExtMessageSender,
  getConnect: () => undefined,
});

describe.concurrent("isConnectMatched", () => {
  it.concurrent("回传 false 当 metadataConnect 为 undefined 或空阵列", () => {
    const req = new URL("https://api.example.com/v1");
    expect(isConnectMatched(undefined, req, makeSender("https://app.example.com"))).toBe(false);
    expect(isConnectMatched([], req, makeSender("https://app.example.com"))).toBe(false);
  });

  it.concurrent('遇到 "*" 应回传 true', () => {
    const req = new URL("https://anything.example.com/path");
    expect(isConnectMatched(["*"], req, makeSender())).toBe(true);
  });

  it.concurrent("尾缀网域比对成功时回传 true（example.com 比对 api.example.com）", () => {
    const req = new URL("https://api.example.com/users");
    expect(isConnectMatched(["example.com"], req, makeSender())).toBe(true);
    expect(isConnectMatched(["foo.com", "bar.net", "example.com"], req, makeSender())).toBe(true);
    expect(isConnectMatched(["foo.com", "bar.net", "api.example.com"], req, makeSender())).toBe(true);
    expect(isConnectMatched(["foo.com", "bar.net", "apiexample.com"], req, makeSender())).toBe(false);
  });

  it.concurrent("尾缀网域比对成功时回传 true（myapple.com vs apple.com）", () => {
    const req = new URL("https://myapple.com/users");
    expect(isConnectMatched(["myapple.com"], req, makeSender())).toBe(true);
    expect(isConnectMatched(["apple.com"], req, makeSender())).toBe(false);
  });

  it.concurrent('metadata 包含 "self" 且 sender.url 与 reqURL 主机相同时回传 true', () => {
    const req = new URL("https://app.example.com/dashboard");
    const sender = makeSender("https://app.example.com/some-page");
    expect(isConnectMatched(["self"], req, sender)).toBe(true);
  });

  it.concurrent('metadata 包含 "self" 但 sender.url 与 reqURL 主机不同时回传 false（若无其他规则命中）', () => {
    const req = new URL("https://api.example.com/resource");
    const sender = makeSender("https://news.example.com/article");
    expect(isConnectMatched(["self"], req, sender)).toBe(false);
  });

  it.concurrent(
    '当 sender.getSender() 回传没有 url 或无效 URL 时，"self" 不应报错且回传 false（若无其他规则命中）',
    () => {
      const req = new URL("https://example.com/path");

      // 无 url
      const senderNoUrl = makeSender();
      expect(isConnectMatched(["self"], req, senderNoUrl)).toBe(false);

      // 无效 URL（try/catch 会吞掉错误）
      const senderBadUrl = makeSender("not a valid url");
      expect(isConnectMatched(["self"], req, senderBadUrl)).toBe(false);
    }
  );

  it.concurrent('当 "self" 不符合但尾缀规则符合时仍应回传 true（走到后续条件）', () => {
    const req = new URL("https://api.example.com/data");
    const sender = makeSender("https://other.site.com/");
    expect(isConnectMatched(["self", "example.com"], req, sender)).toBe(true);
  });

  it.concurrent("完全不匹配时回传 false", () => {
    const req = new URL("https://api.foo.com");
    const sender = makeSender("https://bar.com");
    expect(isConnectMatched(["baz.com", "qux.net"], req, sender)).toBe(false);
  });

  it.concurrent("域名不区分大小写", () => {
    const req = new URL("https://API.Example.COM/Path");
    expect(isConnectMatched(["example.com"], req, makeSender())).toBe(true);
    expect(isConnectMatched(["EXAMPLE.COM"], req, makeSender())).toBe(true);
    expect(isConnectMatched(["Api.Example.com"], req, makeSender())).toBe(true);
  });
});

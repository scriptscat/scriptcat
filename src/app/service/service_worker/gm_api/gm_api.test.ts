import { describe, it, expect } from "vitest";
import { type IGetSender } from "@Packages/message/server";
import { type ExtMessageSender } from "@Packages/message/types";
import { ConnectMatch, getConnectMatched } from "./gm_api";

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
    expect(getConnectMatched(undefined, req, makeSender("https://app.example.com"))).toBe(ConnectMatch.NONE);
    expect(getConnectMatched([], req, makeSender("https://app.example.com"))).toBe(ConnectMatch.NONE);
  });

  it.concurrent('遇到 "*" 应回传 true', () => {
    const req = new URL("https://anything.example.com/path");
    expect(getConnectMatched(["*"], req, makeSender())).toBe(ConnectMatch.ALL);
  });

  it.concurrent("尾缀网域比对成功时回传 true（example.com 比对 api.example.com）", () => {
    const req = new URL("https://api.example.com/users");
    expect(getConnectMatched(["example.com"], req, makeSender())).toBe(ConnectMatch.DOMAIN);
    expect(getConnectMatched(["foo.com", "bar.net", "example.com"], req, makeSender())).toBe(ConnectMatch.DOMAIN);
    expect(getConnectMatched(["foo.com", "bar.net", "api.example.com"], req, makeSender())).toBe(ConnectMatch.DOMAIN);
    expect(getConnectMatched(["foo.com", "bar.net", "apiexample.com"], req, makeSender())).toBe(ConnectMatch.NONE);
  });

  it.concurrent("尾缀网域比对成功时回传 true（myapple.com vs apple.com）", () => {
    const req = new URL("https://myapple.com/users");
    expect(getConnectMatched(["myapple.com"], req, makeSender())).toBe(ConnectMatch.DOMAIN);
    expect(getConnectMatched(["apple.com"], req, makeSender())).toBe(ConnectMatch.NONE);
  });

  it.concurrent('metadata 包含 "self" 且 sender.url 与 reqURL 主机相同时回传 true', () => {
    const req = new URL("https://app.example.com/dashboard");
    const sender = makeSender("https://app.example.com/some-page");
    expect(getConnectMatched(["self"], req, sender)).toBe(ConnectMatch.SELF);
  });

  it.concurrent('metadata 包含 "self" 但 sender.url 与 reqURL 主机不同时回传 false（若无其他规则命中）', () => {
    const req = new URL("https://api.example.com/resource");
    const sender = makeSender("https://news.example.com/article");
    expect(getConnectMatched(["self"], req, sender)).toBe(ConnectMatch.NONE);
  });

  it.concurrent(
    '当 sender.getSender() 回传没有 url 或无效 URL 时，"self" 不应报错且回传 false（若无其他规则命中）',
    () => {
      const req = new URL("https://example.com/path");

      // 无 url
      const senderNoUrl = makeSender();
      expect(getConnectMatched(["self"], req, senderNoUrl)).toBe(ConnectMatch.NONE);

      // 无效 URL（try/catch 会吞掉错误）
      const senderBadUrl = makeSender("not a valid url");
      expect(getConnectMatched(["self"], req, senderBadUrl)).toBe(ConnectMatch.NONE);
    }
  );

  it.concurrent('当 "self" 不符合但尾缀规则符合时仍应回传 true（走到后续条件）', () => {
    const req = new URL("https://api.example.com/data");
    const sender = makeSender("https://other.site.com/");
    expect(getConnectMatched(["self", "example.com"], req, sender)).toBe(ConnectMatch.DOMAIN);
  });

  it.concurrent("完全不匹配时回传 false", () => {
    const req = new URL("https://api.foo.com");
    const sender = makeSender("https://bar.com");
    expect(getConnectMatched(["baz.com", "qux.net"], req, sender)).toBe(ConnectMatch.NONE);
  });

  it.concurrent("域名不区分大小写", () => {
    const req = new URL("https://API.Example.COM/Path");
    expect(getConnectMatched(["example.com"], req, makeSender())).toBe(ConnectMatch.DOMAIN);
    expect(getConnectMatched(["EXAMPLE.COM"], req, makeSender())).toBe(ConnectMatch.DOMAIN);
    expect(getConnectMatched(["Api.Example.com"], req, makeSender())).toBe(ConnectMatch.DOMAIN);
  });
});

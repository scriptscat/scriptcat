import { describe, it, expect, vi } from "vitest";
import { type IGetSender } from "@Packages/message/server";
import { type ExtMessageSender } from "@Packages/message/types";
import GMApi, {
  ConnectMatch,
  getConnectMatched,
  getExtensionSiteAccessOriginPattern,
  MockGMExternalDependencies,
} from "./gm_api";
import { PermissionVerifyApiGet } from "../permission_verify";
import { SystemConfig } from "@App/pkg/config/config";
import PermissionVerify from "../permission_verify";
import { Server } from "@Packages/message/server";
import { MockMessage } from "@Packages/message/mock_message";
import { MessageQueue } from "@Packages/message/message_queue";
import EventEmitter from "eventemitter3";
import { initTestEnv } from "@Tests/utils";
// 触发所有 GM API 装饰器注册（与 gm_api.ts 中的 import 保持同步）
import "./gm_api";

initTestEnv();

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

  it.concurrent("无 connect 时，可以同域匹配成功，但是子/上级域不匹配", () => {
    const req = new URL("https://service.example.com/data");
    const sender = makeSender("https://service.example.com/page");
    expect(getConnectMatched(undefined, req, sender)).toBe(ConnectMatch.EXACT);
    const subdomainSender = makeSender("https://sub.service.example.com/page");
    expect(getConnectMatched(undefined, req, subdomainSender)).toBe(ConnectMatch.NONE);
    const topdomainSender = makeSender("https://example.com/page");
    expect(getConnectMatched(undefined, req, topdomainSender)).toBe(ConnectMatch.NONE);
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
    expect(getConnectMatched(["self"], req, sender)).toBe(ConnectMatch.EXACT);

    const req2 = new URL("https://app.example.com/dashboard");
    const sender2 = makeSender("https://example.com/some-page");
    expect(getConnectMatched(["self"], req2, sender2)).toBe(ConnectMatch.DOMAIN);
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

describe.concurrent("GM API 注册完整性", () => {
  it.concurrent("CAT_agentDom 应已注册", () => {
    const api = PermissionVerifyApiGet("CAT_agentDom");
    expect(api).toBeDefined();
    expect(api!.param.link).toContain("CAT.agent.dom");
  });

  it.concurrent("Agent 相关 API 应全部注册", () => {
    // 确保 Agent 相关的 GM API 不会因 import 遗漏而丢失
    const agentApis = ["CAT_agentConversation", "CAT_agentConversationChat", "CAT_agentSkills", "CAT_agentDom"];
    for (const name of agentApis) {
      expect(PermissionVerifyApiGet(name), `${name} 应已注册`).toBeDefined();
    }
  });
});

describe.concurrent("getExtensionSiteAccessOriginPattern", () => {
  it.concurrent("应生成不带端口的扩展站点访问权限 pattern", () => {
    expect(getExtensionSiteAccessOriginPattern(new URL("http://127.0.0.1:3000/get"))).toBe("http://127.0.0.1/*");
    expect(getExtensionSiteAccessOriginPattern(new URL("https://example.com:8443/path"))).toBe("https://example.com/*");
  });

  it.concurrent("应忽略非 http/https 协议", () => {
    expect(getExtensionSiteAccessOriginPattern(new URL("data:text/plain,hello"))).toBeUndefined();
    expect(getExtensionSiteAccessOriginPattern(new URL("file:///tmp/test.txt"))).toBeUndefined();
  });
});

function createGMApi(): GMApi {
  const ee = new EventEmitter<string, any>();
  const message = new MockMessage(ee);
  const messageQueue = new MessageQueue();
  const systemConfig = new SystemConfig(messageQueue);
  const server = new Server("serviceWorker", message);
  const permissionVerify = new PermissionVerify(server.group("permissionVerify"), messageQueue);
  return new GMApi(
    systemConfig,
    permissionVerify,
    server.group("runtime"),
    message,
    messageQueue,
    {} as any,
    new MockGMExternalDependencies()
  );
}

const makeAudioSender = (tabId: number): IGetSender => ({
  getSender: () => ({}),
  getType: () => 0,
  isType: () => false,
  getExtMessageSender: () => ({ tabId }) as ExtMessageSender,
  getConnect: () => undefined,
});

describe("GM_audio getState", () => {
  it("tab 未静音时不应返回 muteReason（即使 mutedInfo.reason 仍带有上次静音/取消静音的原因）", async () => {
    const gmApi = createGMApi();
    (chrome.tabs as any).get = vi.fn().mockResolvedValueOnce({
      mutedInfo: { muted: false, reason: "extension" },
      audible: true,
    } as chrome.tabs.Tab);

    const state = await gmApi.GM_audio({ params: ["getState"] } as any, makeAudioSender(1));

    expect(state).toEqual({ isMuted: false, isAudible: true });
  });

  it("tab 静音时应返回 muteReason", async () => {
    const gmApi = createGMApi();
    (chrome.tabs as any).get = vi.fn().mockResolvedValueOnce({
      mutedInfo: { muted: true, reason: "user" },
      audible: false,
    } as chrome.tabs.Tab);

    const state = await gmApi.GM_audio({ params: ["getState"] } as any, makeAudioSender(1));

    expect(state).toEqual({ isMuted: true, muteReason: "user", isAudible: false });
  });
});

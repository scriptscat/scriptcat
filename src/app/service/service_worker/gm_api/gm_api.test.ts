import { describe, it, expect, afterEach, vi } from "vitest";
import { type IGetSender } from "@Packages/message/server";
import { type ExtMessageSender } from "@Packages/message/types";
import GMApi, { ConnectMatch, getConnectMatched, getExtensionSiteAccessOriginPattern } from "./gm_api";
import { PermissionVerifyApiGet, type ConfirmParam } from "../permission_verify";
import type { GMApiRequest } from "../types";
// 触发所有 GM API 装饰器注册（与 gm_api.ts 中的 import 保持同步）
import "./gm_api";

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

// 建立假的 IGetSender（getConnect 回传一个只有 sendMessage/disconnect 的假连结，供错误路径使用）
const makeConnSender = (pageUrl?: string): IGetSender =>
  ({
    getSender: () => (pageUrl ? { url: pageUrl } : {}),
    getType: () => 0,
    isType: () => false,
    getExtMessageSender: () => null as unknown as ExtMessageSender,
    getConnect: () => ({ sendMessage: () => {}, disconnect: () => {} }) as any,
  }) as IGetSender;

const makeReq = (opts: { connect?: string[]; url: string; downloadMode?: string }): GMApiRequest<any> =>
  ({
    uuid: "uuid-test",
    api: "GM_download",
    runFlag: "run",
    params: [{ url: opts.url, downloadMode: opts.downloadMode, name: "" }],
    script: {
      uuid: "uuid-test",
      name: "测试脚本",
      metadata: opts.connect ? { connect: opts.connect } : {},
    },
  }) as unknown as GMApiRequest<any>;

// 假的 GMApi：仅提供 verifyXhrConnect 依赖的 gmExternalDependencies / permissionVerify，并挂上真实的 verifyXhrConnect
const makeGmApi = (opts?: { blacklist?: boolean; allow?: boolean }) =>
  ({
    gmExternalDependencies: { isBlacklistNetwork: () => opts?.blacklist ?? false },
    permissionVerify: { queryPermission: async () => (opts?.allow ? { allow: true } : undefined) },
    verifyXhrConnect: (GMApi.prototype as any).verifyXhrConnect,
  }) as any;

const downloadConfirm = PermissionVerifyApiGet("GM_download")!.param.confirm!;
const xhrConfirm = PermissionVerifyApiGet("GM_xmlhttpRequest")!.param.confirm!;

describe.concurrent("native GM_download 的 @connect 校验（verifyXhrConnect 软/硬确认）", () => {
  it.concurrent("downloadMode 非 native（browser）时直接放行，不做跨域校验", async () => {
    // 即使 @connect 未匹配，browser 下载也不触发校验，保证浏览器下载行为不变
    const req = makeReq({ url: "https://not-connected.com/f.zip", downloadMode: "browser", connect: ["example.com"] });
    const ret = await downloadConfirm(req, makeConnSender(), makeGmApi());
    expect(ret).toBe(true);
  });

  it.concurrent("native 下载：@connect 已声明但域名未匹配时，返回确认弹窗而非直接拒绝", async () => {
    // 这是本次改动的核心：软确认（softConnect=true）不再硬拒绝，而是弹窗交给用户决定
    const req = makeReq({ url: "https://not-connected.com/f.zip", downloadMode: "native", connect: ["example.com"] });
    const ret = await downloadConfirm(req, makeConnSender(), makeGmApi());
    expect(ret).not.toBe(true);
    expect((ret as ConfirmParam).permission).toBe("cors");
  });

  it.concurrent("native 下载：完全未声明 @connect 时，返回确认弹窗", async () => {
    const req = makeReq({ url: "https://not-connected.com/f.zip", downloadMode: "native" });
    const ret = await downloadConfirm(req, makeConnSender(), makeGmApi());
    expect((ret as ConfirmParam).permission).toBe("cors");
  });

  it.concurrent("native 下载：域名命中 @connect 时放行", async () => {
    const req = makeReq({ url: "https://api.example.com/f.zip", downloadMode: "native", connect: ["example.com"] });
    const ret = await downloadConfirm(req, makeConnSender(), makeGmApi());
    expect(ret).toBe(true);
  });

  it.concurrent("native 下载：黑名单域名始终硬拒绝（软确认也不放行）", async () => {
    const req = makeReq({ url: "https://blocked.com/f.zip", downloadMode: "native", connect: ["*"] });
    await expect(downloadConfirm(req, makeConnSender(), makeGmApi({ blacklist: true }))).rejects.toThrow(/blacklisted/);
  });

  it.concurrent("native 下载：用户此前已授权该域名（cors 记录 allow）时放行", async () => {
    const req = makeReq({ url: "https://not-connected.com/f.zip", downloadMode: "native", connect: ["example.com"] });
    const ret = await downloadConfirm(req, makeConnSender(), makeGmApi({ allow: true }));
    expect(ret).toBe(true);
  });

  it.concurrent("对照：GM_xmlhttpRequest（硬校验）对未匹配 @connect 的域名直接拒绝", async () => {
    // 与 native GM_download 的软确认形成对比，锁定 softConnect 分叉
    const req = makeReq({ url: "https://not-connected.com/api", connect: ["example.com"] });
    await expect(xhrConfirm(req, makeConnSender(), makeGmApi())).rejects.toThrow(/not a part of the @connect list/);
  });
});

describe("GM_cookie 的 firstPartyDomain 参数（Firefox First-Party Isolation）", () => {
  const makeCookieReq = (
    detail: GMTypes.CookieDetails,
    action: string
  ): GMApiRequest<[string, GMTypes.CookieDetails]> =>
    ({
      uuid: "uuid-test",
      api: "GM_cookie",
      runFlag: "run",
      params: [action, detail],
      script: { uuid: "uuid-test", name: "测试脚本", metadata: {} },
    }) as unknown as GMApiRequest<[string, GMTypes.CookieDetails]>;

  // tabId 为 -1 以跳过 chrome.cookies.getAllCookieStores 查询
  const cookieSender = makeSender("https://example.com/page") as unknown as IGetSender & {
    getExtMessageSender: () => ExtMessageSender;
  };
  (cookieSender as any).getExtMessageSender = () => ({ tabId: -1 }) as ExtMessageSender;

  // chrome.cookies.getAll/set/remove 是重载函数（Promise 或 callback 两种签名），vi.spyOn 只能推断出最后一个重载（callback/void）；
  // 这里narrowing 到实际调用的 Promise 签名，避免 mockResolvedValue 类型报错
  const cookiesApi = chrome.cookies as unknown as {
    getAll(details: chrome.cookies.GetAllDetails): Promise<chrome.cookies.Cookie[]>;
    set(details: chrome.cookies.SetDetails): Promise<chrome.cookies.Cookie>;
    remove(details: chrome.cookies.CookieDetails): Promise<chrome.cookies.CookieDetails>;
  };
  const makeCookieGMApi = () => ({ logger: { warn: vi.fn() }, warnedFirstPartyDomainScriptUuids: new Set<string>() });

  afterEach(() => {
    vi.restoreAllMocks();
    // 仅还原本 describe 块自行 stub 的 mozInnerScreenX，避免影响 setup 文件里的全局 chrome stub
    delete (globalThis as any).mozInnerScreenX;
  });

  it("每个脚本首次使用 firstPartyDomain 时只在开发者工具警告一次", async () => {
    const getAllSpy = vi.spyOn(cookiesApi, "getAll").mockResolvedValue([]);
    const warn = vi.fn();
    const gmApi = { logger: { warn }, warnedFirstPartyDomainScriptUuids: new Set<string>() };
    const req = makeCookieReq({ url: "https://example.com", firstPartyDomain: "example.com" }, "list");
    const otherScriptReq = {
      ...req,
      uuid: "other-uuid-test",
      script: { ...req.script, uuid: "other-uuid-test", name: "另一个测试脚本" },
    };

    await (GMApi.prototype as any).GM_cookie.call(gmApi, req, cookieSender);
    await (GMApi.prototype as any).GM_cookie.call(gmApi, req, cookieSender);
    await (GMApi.prototype as any).GM_cookie.call(gmApi, otherScriptReq, cookieSender);

    expect(getAllSpy).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(
      1,
      "GM_cookie firstPartyDomain is only supported by Firefox and is ignored in this browser.",
      { uuid: "uuid-test", name: "测试脚本", component: "GM_cookie" }
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      "GM_cookie firstPartyDomain is only supported by Firefox and is ignored in this browser.",
      { uuid: "other-uuid-test", name: "另一个测试脚本", component: "GM_cookie" }
    );
  });

  it("Firefox 环境下会提示 firstPartyDomain 的跨浏览器兼容性", async () => {
    vi.stubGlobal("mozInnerScreenX", 0);
    const getAllSpy = vi.spyOn(cookiesApi, "getAll").mockResolvedValue([]);
    const warn = vi.fn();
    const gmApi = { logger: { warn }, warnedFirstPartyDomainScriptUuids: new Set<string>() };
    const req = makeCookieReq({ url: "https://example.com", firstPartyDomain: "example.com" }, "list");

    await (GMApi.prototype as any).GM_cookie.call(gmApi, req, cookieSender);

    expect(getAllSpy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "GM_cookie firstPartyDomain is Firefox-specific and may behave differently in other browsers.",
      { uuid: "uuid-test", name: "测试脚本", component: "GM_cookie" }
    );
  });

  it("非 Firefox 环境下，firstPartyDomain 不会传递给 chrome.cookies.getAll（Chrome 会拒绝未知参数）", async () => {
    const getAllSpy = vi.spyOn(cookiesApi, "getAll").mockResolvedValue([]);
    const req = makeCookieReq({ url: "https://example.com", firstPartyDomain: "example.com" }, "list");
    await (GMApi.prototype as any).GM_cookie.call(makeCookieGMApi(), req, cookieSender);
    expect(getAllSpy).toHaveBeenCalledTimes(1);
    expect(getAllSpy.mock.calls[0][0]).not.toHaveProperty("firstPartyDomain");
  });

  it("Firefox 环境下，firstPartyDomain 会被裁剪空白后传递给 chrome.cookies.getAll", async () => {
    vi.stubGlobal("mozInnerScreenX", 0); // 模拟 isFirefox() 为 true
    const getAllSpy = vi.spyOn(cookiesApi, "getAll").mockResolvedValue([]);
    const req = makeCookieReq({ url: "https://example.com", firstPartyDomain: "  example.com  " }, "list");
    await (GMApi.prototype as any).GM_cookie.call(makeCookieGMApi(), req, cookieSender);
    expect(getAllSpy.mock.calls[0][0].firstPartyDomain).toBe("example.com");
  });

  it("Firefox 环境下，set 操作也会传递 firstPartyDomain 给 chrome.cookies.set", async () => {
    vi.stubGlobal("mozInnerScreenX", 0);
    const setSpy = vi.spyOn(cookiesApi, "set").mockResolvedValue({} as chrome.cookies.Cookie);
    const req = makeCookieReq(
      { url: "https://example.com", name: "n", value: "v", firstPartyDomain: "example.com" },
      "set"
    );
    await (GMApi.prototype as any).GM_cookie.call(makeCookieGMApi(), req, cookieSender);
    expect(setSpy.mock.calls[0][0].firstPartyDomain).toBe("example.com");
  });

  it("Firefox 环境下，list 未提供 firstPartyDomain 时补字面量 null（Firefox 的 getAll 专门区分「完全没有该 key」与「该 key 为 null」，只有前者在 FPI 开启时报错，见 violentmonkey#746）", async () => {
    vi.stubGlobal("mozInnerScreenX", 0);
    const getAllSpy = vi.spyOn(cookiesApi, "getAll").mockResolvedValue([]);
    const req = makeCookieReq({ url: "https://example.com" }, "list");
    await (GMApi.prototype as any).GM_cookie.call({}, req, cookieSender);
    expect(getAllSpy.mock.calls[0][0].firstPartyDomain).toBeNull();
  });

  it("Firefox 环境下，delete 未提供 firstPartyDomain 时直接省略该字段（remove 对 null 与未提供一视同仁，补 null 无意义）", async () => {
    vi.stubGlobal("mozInnerScreenX", 0);
    const removeSpy = vi.spyOn(cookiesApi, "remove").mockResolvedValue({} as chrome.cookies.CookieDetails);
    const req = makeCookieReq({ url: "https://example.com", name: "n" }, "delete");
    await (GMApi.prototype as any).GM_cookie.call({}, req, cookieSender);
    expect(removeSpy.mock.calls[0][0]).not.toHaveProperty("firstPartyDomain");
  });

  it("Firefox 环境下，set/delete 未提供 firstPartyDomain 且 FPI 开启时，Firefox 的拒绝会原样传播给调用方，而不是被吞掉", async () => {
    vi.stubGlobal("mozInnerScreenX", 0);
    const fpiError = new Error(
      "First-Party Isolation is enabled, but the required 'firstPartyDomain' attribute was not set."
    );
    vi.spyOn(cookiesApi, "set").mockRejectedValue(fpiError);
    vi.spyOn(cookiesApi, "remove").mockRejectedValue(fpiError);

    await expect(
      (GMApi.prototype as any).GM_cookie.call(
        {},
        makeCookieReq({ url: "https://example.com", name: "n", value: "v" }, "set"),
        cookieSender
      )
    ).rejects.toThrow(fpiError.message);

    await expect(
      (GMApi.prototype as any).GM_cookie.call(
        {},
        makeCookieReq({ url: "https://example.com", name: "n" }, "delete"),
        cookieSender
      )
    ).rejects.toThrow(fpiError.message);
  });

  it("Firefox 环境下，显式传空字符串 firstPartyDomain 时应保留空字符串（代表 FPI 关闭时创建的 cookie），而非当作未提供", async () => {
    vi.stubGlobal("mozInnerScreenX", 0);
    const getAllSpy = vi.spyOn(cookiesApi, "getAll").mockResolvedValue([]);
    const setSpy = vi.spyOn(cookiesApi, "set").mockResolvedValue({} as chrome.cookies.Cookie);
    const removeSpy = vi.spyOn(cookiesApi, "remove").mockResolvedValue({} as chrome.cookies.CookieDetails);

    await (GMApi.prototype as any).GM_cookie.call(
      makeCookieGMApi(),
      makeCookieReq({ url: "https://example.com", firstPartyDomain: "" }, "list"),
      cookieSender
    );
    expect(getAllSpy.mock.calls[0][0].firstPartyDomain).toBe("");

    await (GMApi.prototype as any).GM_cookie.call(
      makeCookieGMApi(),
      makeCookieReq({ url: "https://example.com", name: "n", value: "v", firstPartyDomain: "   " }, "set"),
      cookieSender
    );
    expect(setSpy.mock.calls[0][0].firstPartyDomain).toBe("");

    await (GMApi.prototype as any).GM_cookie.call(
      makeCookieGMApi(),
      makeCookieReq({ url: "https://example.com", name: "n", firstPartyDomain: "" }, "delete"),
      cookieSender
    );
    expect(removeSpy.mock.calls[0][0].firstPartyDomain).toBe("");
  });

  it("Firefox 环境下，set 未提供 firstPartyDomain 时直接省略该字段（无法用 null 表达新 cookie 的归属，不能补默认值）", async () => {
    vi.stubGlobal("mozInnerScreenX", 0);
    const setSpy = vi.spyOn(cookiesApi, "set").mockResolvedValue({} as chrome.cookies.Cookie);

    await (GMApi.prototype as any).GM_cookie.call(
      {},
      makeCookieReq({ url: "https://example.com", name: "n", value: "v" }, "set"),
      cookieSender
    );
    expect(setSpy.mock.calls[0][0]).not.toHaveProperty("firstPartyDomain");
  });
});

import type { BrowserContext, Page } from "@playwright/test";
import { test, expect, startMockServer, type MockServer } from "./server-fixtures";
import { installScriptByCode } from "./utils";

/**
 * GM_xmlhttpRequest 跨域 / 站点访问权限处理 (#1477) 与 MV3 DNR 标记 (mv3_utils)
 *
 * #1477 修复“缺少站点访问权限时跨域请求异常”。其配套的 mv3_utils 在 Chrome 上用
 * ChromiumHeaderMarkerLinker：给后台发起的请求加 x-sc-request-marker 头用于把响应关联回
 * content 端，并通过 DNR 规则在真正发出前把该标记头删掉，因此目标服务器收不到它。
 *
 * 端到端可观察点（均不依赖外网，靠 host-resolver 映射到本地 mock server）：
 *  - 声明了 @connect 的跨域 GET 能成功（请求不再异常）
 *  - 自定义请求头能透传到服务器；而 x-sc-request-marker 标记头被 DNR 剥离（服务器收不到）
 *  - 未在 @connect 列表中的域名被拒绝（onerror）
 *
 * 关于 extension-site-access 确认弹窗路径（confirmExtensionSiteAccess）：
 * 它只在“扩展缺少目标站点访问权限”时触发。本扩展 host_permissions 为 <all_urls>，
 * 加载的未打包扩展默认即拥有站点访问权限，故默认不会触发。试图通过 developerPrivate
 * 把 hostAccess 改为 ON_CLICK 来制造“缺权限”状态时，会连带导致脚本在其宿主页面也无法注入
 * （扩展对宿主页同样失去访问权），脚本根本不运行、也就不会发起请求——因此该弹窗分支无法在
 * headless 下干净复现。其分支逻辑由 SW 侧逻辑/单测覆盖；这里用更可靠的方式覆盖 #1477 的核心：
 * 跨域请求成功 + DNR 标记剥离 + 非 @connect 拒绝。
 */

const SENTINEL = "[XHR_E2E]";

async function runXhr(
  context: BrowserContext,
  targetPageUrl: string,
  timeoutMs = 15_000
): Promise<{ data: any; logs: string[] }> {
  const page: Page = await context.newPage();
  const logs: string[] = [];
  let resolved: any = null;
  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(text);
    const idx = text.indexOf(SENTINEL);
    if (idx >= 0) {
      try {
        resolved = JSON.parse(text.slice(idx + SENTINEL.length));
      } catch {
        /* ignore */
      }
    }
  });

  await page.goto(targetPageUrl, { waitUntil: "domcontentloaded" });
  await expect
    .poll(
      async () => {
        if (resolved) return true;
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
        return !!resolved;
      },
      { timeout: timeoutMs, intervals: [500, 1_000, 1_500] }
    )
    .toBe(true)
    .catch(() => undefined);
  await page.close();
  if (!resolved) throw new Error(`no sentinel from ${targetPageUrl}\nlogs:\n${logs.join("\n")}`);
  return { data: resolved, logs };
}

function xhrScript(opts: {
  name: string;
  matchHost: string;
  connect: string[];
  url: string;
  port: number;
  headers?: Record<string, string>;
}): string {
  const connectLines = opts.connect.map((c) => `// @connect      ${c}`).join("\n");
  return `// ==UserScript==
// @name         ${opts.name}
// @namespace    https://e2e.test
// @version      1.0.0
// @description  gm xhr e2e
// @match        http://${opts.matchHost}:${opts.port}/*
${connectLines}
// @grant        GM_xmlhttpRequest
// @noframes
// ==/UserScript==

(function () {
  function emit(o) { console.log("${SENTINEL}" + JSON.stringify(o)); }
  try {
    GM_xmlhttpRequest({
      method: "GET",
      url: ${JSON.stringify(opts.url)},
      headers: ${JSON.stringify(opts.headers || {})},
      onload: function (r) {
        var parsed = null;
        try { parsed = JSON.parse(r.responseText); } catch (e) {}
        emit({ phase: "load", status: r.status, ok: parsed && parsed.ok === true, method: parsed && parsed.method });
      },
      onerror: function (e) {
        emit({ phase: "error", error: (e && (e.error || e.statusText || e.message)) || String(e) });
      },
    });
  } catch (e) {
    emit({ phase: "throw", error: String(e) });
  }
})();
`;
}

test.describe("GM_xmlhttpRequest site-access & DNR marker (#1477)", () => {
  let server: MockServer;

  test.beforeEach(async () => {
    server = await startMockServer();
  });
  test.afterEach(async () => {
    await server.close();
  });

  test("声明 @connect 的跨域 GET 请求成功", async ({ context, extensionId }) => {
    const code = xhrScript({
      name: "XHR connect ok",
      matchHost: "sitea.test",
      connect: ["xhrtarget.test"],
      url: server.url("xhrtarget.test", "/xhr"),
      port: server.port,
    });
    await installScriptByCode(context, extensionId, code);

    const { data, logs } = await runXhr(context, server.url("sitea.test", "/page"));
    expect(data.phase, `期望 load，实际: ${JSON.stringify(data)}\n${logs.join("\n")}`).toBe("load");
    expect(data.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.method).toBe("GET");
  });

  test("自定义请求头透传到服务器，x-sc-request-marker 标记头被 DNR 剥离", async ({ context, extensionId }) => {
    const code = xhrScript({
      name: "XHR header marker",
      matchHost: "sitea.test",
      connect: ["xhrtarget.test"],
      url: server.url("xhrtarget.test", "/xhr"),
      port: server.port,
      headers: { "X-Custom-E2e": "hello-123" },
    });
    await installScriptByCode(context, extensionId, code);

    const { data } = await runXhr(context, server.url("sitea.test", "/page"));
    expect(data.phase).toBe("load");
    expect(data.status).toBe(200);

    // 以服务器实际收到的请求为准（DNR 在网络层剥离标记头）
    const xhrReq = server.requestLog.find((r) => r.pathname === "/xhr");
    expect(xhrReq, "服务器未收到 /xhr 请求").toBeTruthy();
    const headerKeys = Object.keys(xhrReq!.headers).map((k) => k.toLowerCase());
    expect(headerKeys, "自定义头未透传").toContain("x-custom-e2e");
    expect(xhrReq!.headers["x-custom-e2e"]).toBe("hello-123");
    expect(headerKeys, "x-sc-request-marker 不应到达服务器").not.toContain("x-sc-request-marker");
  });

  test("请求未在 @connect 列表中的域名被拒绝（onerror）", async ({ context, extensionId }) => {
    const code = xhrScript({
      name: "XHR connect reject",
      matchHost: "sitea.test",
      connect: ["xhrtarget.test"], // 列了 connect，但请求另一个域名
      url: server.url("noconnect.test", "/xhr"),
      port: server.port,
    });
    await installScriptByCode(context, extensionId, code);

    const { data } = await runXhr(context, server.url("sitea.test", "/page"));
    expect(data.phase, `期望 error，实际: ${JSON.stringify(data)}`).toBe("error");
    // 服务器不应收到该被拒绝域名的请求
    expect(server.requestLog.find((r) => r.host === "noconnect.test")).toBeFalsy();
  });
});

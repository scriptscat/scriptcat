import type { BrowserContext, Page } from "@playwright/test";
import { test, expect, startMockServer, type MockServer } from "./server-fixtures";
import { installScriptByCode } from "./utils";

/**
 * 资源（@require / @resource）更新逻辑重构 + 并发控制 (#1193, 313e464e)
 *
 * 验证用户可观察到的行为：
 *  - @require 远程库被拉取、注入并在脚本中可用；@resource 可通过 GM_getResourceText 读取
 *  - 24h TTL 缓存：两个脚本引用同一个 @require URL，在 TTL 内只下载一次（link 复用）
 *  - 拉取失败时优雅降级：脚本仍然安装并执行，不抛异常（资源为空）
 *  - 多个 @require 经并发控制后全部成功加载，不丢请求
 *
 * 并发上限(MAX_ACTIVE_FETCHES=5)、滑动窗口超时(withTimeoutNotify) 等精确语义由单测
 * src/pkg/utils/concurrency-control.test.ts 覆盖，这里只验证端到端可观察结果。
 */

const SENTINEL = "[RES_E2E]";

/** 等待 mock server 收到某个 pathname 的请求 */
async function waitForHit(server: MockServer, pathname: string, timeoutMs = 15_000): Promise<void> {
  await expect
    .poll(() => server.hits(pathname), {
      message: `waiting for request to ${pathname} (got: ${JSON.stringify(server.requestLog.map((r) => r.pathname))})`,
      timeout: timeoutMs,
      intervals: [100, 250, 500, 1_000],
    })
    .toBeGreaterThan(0);
}

/**
 * 打开目标页面并等待脚本输出哨兵 JSON 行。脚本注入相对安装存在异步窗口，
 * 因此在拿不到结果时重新加载页面重试。
 */
async function runAndCapture(
  context: BrowserContext,
  targetUrl: string,
  timeoutMs = 20_000
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
        /* ignore partial */
      }
    }
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await expect
    .poll(
      async () => {
        if (resolved) return true;
        // 脚本可能尚未注册完成，重载重试
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
        return !!resolved;
      },
      { timeout: timeoutMs, intervals: [500, 1_000, 2_000] }
    )
    .toBe(true)
    .catch(() => undefined);
  await page.close();
  if (!resolved) throw new Error(`no sentinel captured from ${targetUrl}\nlogs:\n${logs.join("\n")}`);
  return { data: resolved, logs };
}

function selfTestScript(opts: {
  name: string;
  matchHost: string;
  requireUrls?: string[];
  resourceUrl?: string;
  port: number;
}): string {
  const requires = (opts.requireUrls || []).map((u) => `// @require      ${u}`).join("\n");
  const resourceLine = opts.resourceUrl ? `// @resource     cfg ${opts.resourceUrl}` : "";
  const grants = opts.resourceUrl ? "// @grant        GM_getResourceText" : "// @grant        none";
  return `// ==UserScript==
// @name         ${opts.name}
// @namespace    https://e2e.test
// @version      1.0.0
// @description  resource e2e
// @match        http://${opts.matchHost}:${opts.port}/*
${requires}
${resourceLine}
${grants}
// @noframes
// ==/UserScript==

(function () {
  var out = {
    libVersion: (typeof window.__LIB_VERSION__ !== "undefined") ? window.__LIB_VERSION__ : null,
    lib2: (typeof window.__LIB2_OK__ !== "undefined") ? window.__LIB2_OK__ : null,
    bodyRan: true,
  };
  ${opts.resourceUrl ? 'try { out.res = GM_getResourceText("cfg"); } catch (e) { out.resErr = String(e); }' : ""}
  console.log("${SENTINEL}" + JSON.stringify(out));
})();
`;
}

test.describe("Resource update & concurrency (#1193)", () => {
  let server: MockServer;

  test.beforeEach(async () => {
    server = await startMockServer();
  });
  test.afterEach(async () => {
    await server.close();
  });

  test("@require 远程库被注入可用，@resource 可被 GM_getResourceText 读取，各下载一次", async ({
    context,
    extensionId,
  }) => {
    const libUrl = server.url("reslib.test", "/lib.js");
    const resUrl = server.url("reslib.test", "/res.txt");
    const code = selfTestScript({
      name: "RES Basic",
      matchHost: "sitea.test",
      requireUrls: [libUrl],
      resourceUrl: resUrl,
      port: server.port,
    });
    await installScriptByCode(context, extensionId, code);
    await waitForHit(server, "/lib.js");
    await waitForHit(server, "/res.txt");

    const { data } = await runAndCapture(context, server.url("sitea.test", "/page"));
    expect(data.bodyRan).toBe(true);
    expect(data.libVersion).toBe(1); // 第一次拉取，server 返回的版本号为 1
    expect(data.res).toBe("RESOURCE_OK");

    // 每个资源仅下载一次
    expect(server.hits("/lib.js")).toBe(1);
    expect(server.hits("/res.txt")).toBe(1);
  });

  test("24h TTL：两个脚本引用同一 @require URL，TTL 内只下载一次（link 复用）", async ({ context, extensionId }) => {
    const libUrl = server.url("reslib.test", "/lib.js");

    // 脚本 A 匹配 sitea，脚本 B 匹配 siteb，二者 @require 同一个 URL
    await installScriptByCode(
      context,
      extensionId,
      selfTestScript({ name: "RES Share A", matchHost: "sitea.test", requireUrls: [libUrl], port: server.port })
    );
    await waitForHit(server, "/lib.js");
    expect(server.hits("/lib.js")).toBe(1);

    await installScriptByCode(
      context,
      extensionId,
      selfTestScript({ name: "RES Share B", matchHost: "siteb.test", requireUrls: [libUrl], port: server.port })
    );
    // 两个脚本都能拿到同一份（version 1）缓存内容
    const a = await runAndCapture(context, server.url("sitea.test", "/page"));
    const b = await runAndCapture(context, server.url("siteb.test", "/page"));
    expect(a.data.libVersion).toBe(1);
    expect(b.data.libVersion).toBe(1);
    expect(server.hits("/lib.js")).toBe(1);
  });

  test("@require 拉取失败时优雅降级：脚本仍执行、不抛异常，库不可用", async ({ context, extensionId }) => {
    server.failPath("/lib.js"); // 让 require 拉取返回 500
    const libUrl = server.url("reslib.test", "/lib.js");
    await installScriptByCode(
      context,
      extensionId,
      selfTestScript({ name: "RES Fail", matchHost: "sitea.test", requireUrls: [libUrl], port: server.port })
    );
    await waitForHit(server, "/lib.js");

    const { data } = await runAndCapture(context, server.url("sitea.test", "/page"));
    // 关键：脚本主体仍然执行（未因资源失败而崩溃），但库未注入
    expect(data.bodyRan).toBe(true);
    expect(data.libVersion).toBe(null);
  });

  test("多个 @require 经并发控制后全部成功加载，不丢请求", async ({ context, extensionId }) => {
    // 8 个不同的 @require URL（lib.js + lib2.js + 6 个带不同 token 的 lib.js 视为不同资源）
    const urls = [server.url("reslib.test", "/lib.js"), server.url("reslib2.test", "/lib2.js")];
    for (let i = 0; i < 6; i++) {
      urls.push(server.url("reslib.test", `/lib.js?token=t${i}`));
    }
    await installScriptByCode(
      context,
      extensionId,
      selfTestScript({ name: "RES Concurrency", matchHost: "sitea.test", requireUrls: urls, port: server.port })
    );
    await waitForHit(server, "/lib2.js");
    await expect
      .poll(() => server.requestLog.filter((r) => r.pathname === "/lib.js").length, {
        message: `waiting for all /lib.js requests (got: ${JSON.stringify(server.requestLog.map((r) => r.url))})`,
        timeout: 15_000,
        intervals: [100, 250, 500, 1_000],
      })
      .toBe(7);

    const { data } = await runAndCapture(context, server.url("sitea.test", "/page"));
    expect(data.bodyRan).toBe(true);
    expect(data.lib2).toBe(true); // lib2.js 成功注入
    expect(data.libVersion).not.toBeNull(); // lib.js 成功注入

    // 全部 8 个不同 URL 都被请求过（lib.js 1 次 + 6 个 token + lib2.js 1 次 = 8）
    const libHits = server.requestLog.filter((r) => r.pathname === "/lib.js").length;
    expect(libHits).toBe(7); // 无 token 1 次 + 6 个 token 各 1 次
    expect(server.hits("/lib2.js")).toBe(1);
  });
});

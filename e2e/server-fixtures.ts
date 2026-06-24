import fs from "fs";
import os from "os";
import path from "path";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import type { AddressInfo } from "net";
import { test as base, expect, chromium, type BrowserContext } from "@playwright/test";

/**
 * 共享网络测试 fixture。
 *
 * 与 e2e/fixtures.ts 的 testWithUserScripts 类似（两阶段启动 + userScripts 权限），
 * 但额外通过 --host-resolver-rules 把一组测试域名映射到本地 127.0.0.1，
 * 这样可以用真实的跨域 URL（含自定义主机名）驱动 @require/@resource 拉取与 GM_xmlhttpRequest，
 * 而完全不依赖外网。
 *
 * 被 resource-update.spec.ts 与 gm-xhr-site-access.spec.ts 复用。
 */

const pathToExtension = path.resolve(__dirname, "../dist/ext");

/** 全部映射到本地 mock server 的测试域名 */
export const TEST_HOSTS = [
  "reslib.test",
  "reslib2.test",
  "sitea.test",
  "siteb.test",
  "xhrtarget.test",
  "noconnect.test",
  "content-security-policy.test",
];

const hostResolverRule = `--host-resolver-rules=MAP ${TEST_HOSTS.join(" 127.0.0.1,MAP ")} 127.0.0.1,EXCLUDE localhost`;

const chromeArgs = [
  `--disable-extensions-except=${pathToExtension}`,
  `--load-extension=${pathToExtension}`,
  hostResolverRule,
];

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-net-"));

    // Phase 1: 启用 userScripts 权限
    const ctx1 = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
    });
    let [bg] = ctx1.serviceWorkers();
    if (!bg) bg = await ctx1.waitForEvent("serviceworker", { timeout: 30_000 });
    const extensionId = bg.url().split("/")[2];
    const extPage = await ctx1.newPage();
    await extPage.goto("chrome://extensions/");
    await extPage.waitForLoadState("domcontentloaded");
    await extPage.waitForFunction(() => !!(chrome as any).developerPrivate, { timeout: 10_000 });
    await extPage.evaluate(async (id) => {
      await (chrome as any).developerPrivate.updateExtensionConfiguration({
        extensionId: id,
        userScriptsAccess: true,
      });
    }, extensionId);
    await extPage.close();
    await ctx1.close();

    // Phase 2: 重新启动，权限已持久化
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
    });
    const [sw] = context.serviceWorkers();
    if (!sw) await context.waitForEvent("serviceworker", { timeout: 30_000 });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");
    const extensionId = background.url().split("/")[2];
    const initPage = await context.newPage();
    await initPage.goto(`chrome-extension://${extensionId}/src/options.html`);
    await initPage.waitForLoadState("domcontentloaded");
    await initPage.evaluate(() => localStorage.setItem("firstUse", "false"));
    await initPage.close();
    await use(extensionId);
  },
});

export { expect };

export type RequestRecord = {
  method: string;
  host: string; // 不含端口
  path: string; // 含 query
  pathname: string;
  headers: Record<string, string | string[] | undefined>;
};

export type MockServer = {
  port: number;
  /** 已收到的全部请求 */
  requestLog: RequestRecord[];
  /** 针对某 pathname 统计命中次数 */
  hits: (pathname: string) => number;
  /** 构造一个映射到本地的 URL，host 必须在 TEST_HOSTS 中 */
  url: (host: string, pathOrQuery: string) => string;
  /** 让某个 pathname 之后的请求返回 500 */
  failPath: (pathname: string) => void;
  /** 取消某 pathname 的失败模式 */
  unfailPath: (pathname: string) => void;
  reset: () => void;
  close: () => Promise<void>;
};

/**
 * 启动一个本地 mock HTTP server。
 *
 * 约定路由：
 *  - /page        → 一个普通 HTML 页面（作为 @match 注入目标）
 *  - /lib.js      → @require 脚本；内容里写入 window.__LIB_VERSION__ = <该路径的累计命中序号>，
 *                   以及 window.__LIB_TOKEN__ = <query 中的 token>。借此区分“重新下载”与“命中缓存”。
 *  - /lib2.js     → 第二个 @require，window.__LIB2_OK__ = true
 *  - /res.txt     → 文本 @resource，内容 "RESOURCE_OK"
 *  - /xhr         → 返回 JSON：{ ok:true, gotHeaders:<请求头>, method }
 *  - /redirect    → 302 跳到 /xhr
 *  - 其它          → HTML 页面
 *
 * 所有响应都带 Access-Control-Allow-Origin: *。CSP 目标主机额外下发严格 CSP 头。
 */
export async function startMockServer(): Promise<MockServer> {
  const requestLog: RequestRecord[] = [];
  const pathHitCount = new Map<string, number>();
  const failingPaths = new Set<string>();

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const hostHeader = req.headers.host || "127.0.0.1";
    const hostNoPort = hostHeader.split(":")[0];
    const url = new URL(req.url || "/", `http://${hostHeader}`);
    const pathname = url.pathname;

    requestLog.push({
      method: req.method || "GET",
      host: hostNoPort,
      path: req.url || "/",
      pathname,
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
    pathHitCount.set(pathname, (pathHitCount.get(pathname) || 0) + 1);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Expose-Headers", "*");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (failingPaths.has(pathname)) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("mock failure");
      return;
    }

    if (pathname === "/lib.js") {
      const version = pathHitCount.get(pathname) || 1;
      const token = url.searchParams.get("token") || "";
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(`window.__LIB_VERSION__ = ${version};\nwindow.__LIB_TOKEN__ = ${JSON.stringify(token)};\n`);
      return;
    }

    if (pathname === "/lib2.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(`window.__LIB2_OK__ = true;\n`);
      return;
    }

    if (pathname === "/res.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("RESOURCE_OK");
      return;
    }

    if (pathname === "/xhr") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          method: req.method,
          gotHeaders: req.headers,
        })
      );
      return;
    }

    if (pathname === "/redirect") {
      res.writeHead(302, { Location: `http://${hostHeader}/xhr` });
      res.end();
      return;
    }

    if (hostNoPort === "content-security-policy.test") {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self'; connect-src 'self'"
      );
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><html><head><title>SC Net E2E</title></head><body><main class="container"><div class="masthead">SC Net E2E ${hostNoPort}</div></main></body></html>`
    );
  };

  const server: Server = createServer(handler);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const port = (server.address() as AddressInfo).port;

  return {
    port,
    requestLog,
    hits: (pathname: string) => pathHitCount.get(pathname) || 0,
    url: (host: string, pathOrQuery: string) => {
      const sep = pathOrQuery.startsWith("/") ? "" : "/";
      return `http://${host}:${port}${sep}${pathOrQuery}`;
    },
    failPath: (pathname: string) => failingPaths.add(pathname),
    unfailPath: (pathname: string) => failingPaths.delete(pathname),
    reset: () => {
      requestLog.length = 0;
      pathHitCount.clear();
      failingPaths.clear();
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        // 强制断开 keep-alive 连接，避免 close() 等待挂起的浏览器连接
        server.closeAllConnections?.();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

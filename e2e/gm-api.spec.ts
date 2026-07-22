import fs from "fs";
import path from "path";
import os from "os";
import { createServer, STATUS_CODES, type IncomingMessage, type ServerResponse } from "http";
import type { AddressInfo } from "net";
import { test as base, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { autoApprovePermissions, installScriptByCode } from "./utils";

const MOCK_CONNECT_HOST = "127.0.0.1";
const CSP_TARGET_HOST = "content-security-policy.test";

const pathToExtension = path.resolve(__dirname, "../dist/ext");
const chromeArgs = [
  `--disable-extensions-except=${pathToExtension}`,
  `--load-extension=${pathToExtension}`,
  `--host-resolver-rules=MAP ${CSP_TARGET_HOST} ${MOCK_CONNECT_HOST},EXCLUDE localhost`,
  "--disable-gpu",
];

// CI（GitHub Actions）跑在非 root 用户下不会自动应用 --no-sandbox，关掉沙箱能省下每次
// launchPersistentContext 的 sandbox/fork 开销；本地开发机上仍保留沙箱隔离。
const chromiumSandbox = !process.env.CI;

type GMApiMockServer = {
  origin: string;
  cspOrigin: string;
  close: () => Promise<void>;
};

type SCTestBrowserApi = {
  create(options: { name: string; reporter: string }): {
    describe(name: string, register: () => void): void;
    it(name: string, run: () => void): void;
    expect(value: unknown): { toBe(expected: unknown): void };
    run(): Promise<unknown>;
  };
};

const test = base.extend<
  {
    context: BrowserContext;
    extensionId: string;
  },
  { gmApiProfileDir: string }
>({
  // Worker 级 fixture：启用 user scripts 权限的 Phase 1（含 chrome://extensions 导航 +
  // developerPrivate 调用）每个 worker 只做一次，而不是每个 test 都重新做一遍。
  // 之前每个 test 都要完整走两次 launchPersistentContext，CI 下 workers 并行时
  // 大量并发 Chrome 启动会互相抢占 CPU，把扩展 service worker 的启动拖到超过 30s 超时。
  gmApiProfileDir: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-profile-"));

      const ctx1 = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ["--headless=new", ...chromeArgs],
        timeout: 60_000,
        chromiumSandbox,
      });
      let [bg] = ctx1.serviceWorkers();
      if (!bg) bg = await ctx1.waitForEvent("serviceworker", { timeout: 14_000 });
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

      await use(userDataDir);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
    { scope: "worker" },
  ],
  context: async ({ gmApiProfileDir }, use) => {
    // 每个测试使用从预配置 profile 拷贝出的独立目录，避免脚本/storage 状态泄漏到后续测试，
    // 同时跳过每个测试都重新做一次的 Phase 1 权限配置。
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-test-"));
    fs.cpSync(gmApiProfileDir, userDataDir, { recursive: true });

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
      timeout: 60_000,
      chromiumSandbox,
    });
    const [sw] = context.serviceWorkers();
    if (!sw) await context.waitForEvent("serviceworker", { timeout: 14_000 });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker", { timeout: 14_000 });
    const extensionId = background.url().split("/")[2];
    const initPage = await context.newPage();
    await initPage.goto(`chrome-extension://${extensionId}/src/options.html`);
    await initPage.waitForLoadState("domcontentloaded");
    await initPage.evaluate(() => localStorage.setItem("firstUse", "false"));
    await initPage.close();
    await use(extensionId);
  },
});

function patchScriptCode(code: string): string {
  return code
    .replace(/^(\/\/\s*@(?:require|resource)\s+.*?)#sha(?:256|384|512)[=-][^\s]+/gm, "$1")
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\//g, "https://unpkg.com/");
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const pair of (req.headers.cookie || "").split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}

function streamInChunks(
  res: ServerResponse,
  body: Buffer,
  contentType: string,
  chunkCount: number,
  gapMs: number,
  delayMs: number
): void {
  res.writeHead(200, { "Content-Type": contentType });
  const chunkSize = Math.ceil(body.length / chunkCount);
  let sent = 0;
  const tick = () => {
    if (res.destroyed) return;
    if (sent >= body.length) {
      res.end();
      return;
    }
    res.write(body.subarray(sent, sent + chunkSize));
    sent += chunkSize;
    setTimeout(tick, gapMs);
  };
  setTimeout(tick, delayMs);
}

// 大响应体：前段按 120ms 分块下发，保证 readyState 3 的 progress 事件；尾段一次灌完并立刻
// 结束——Chrome XHR 的 progress 节流（50ms 内只派发一次，其余推迟）会把尾段最后一个 progress
// 推迟到 readyState 已是 4 之后才派发，gm_xhr_test.js 的事件集合断言正依赖这个事件。
function streamLargeBody(res: ServerResponse, body: Buffer, contentType: string): void {
  res.writeHead(200, { "Content-Type": contentType });
  const head = Math.floor(body.length / 6);
  res.write(body.subarray(0, head));
  setTimeout(() => {
    if (res.destroyed) return;
    res.write(body.subarray(head, head * 2));
    setTimeout(() => {
      if (res.destroyed) return;
      res.end(body.subarray(head * 2));
    }, 120);
  }, 120);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function startGMApiMockServer(): Promise<GMApiMockServer> {
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/get") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const args = Object.fromEntries([...url.searchParams].map(([name, value]) => [name, [value]]));
      res.end(
        JSON.stringify(
          {
            // Include the query string — gm_xhr_redirect_test.js asserts the reflected url matches
            // the exact request URL it sent, search params included (mirrors real httpbingo.org/get).
            url: `http://${req.headers.host}${url.pathname}${url.search}`,
            method: req.method,
            args,
            headers: req.headers,
          },
          null,
          2
        )
      );
      return;
    }

    if (url.pathname === "/repos/scriptscat/scriptcat") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          name: "scriptcat",
          full_name: "scriptscat/scriptcat",
          description: "ScriptCat",
        })
      );
      return;
    }

    if (url.pathname === "/favicon.ico") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          "base64"
        )
      );
      return;
    }

    if (url.pathname === "/lib/sctest.js") {
      const source = fs.readFileSync(path.join(__dirname, "../example/tests/lib/sctest.js"), "utf-8");
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(source);
      return;
    }

    if (url.pathname === "/redirect-to") {
      const target = url.searchParams.get("url") || "/";
      res.writeHead(302, { Location: target });
      res.end();
      return;
    }

    // 以下路由复刻 httpbingo.org 上 gm_xhr_test.js 用到的端点语义，让整套用例不依赖外网。
    const base64Match = url.pathname.match(/^\/base64\/(.+)$/);
    if (base64Match) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(Buffer.from(base64Match[1], "base64"));
      return;
    }

    const statusMatch = url.pathname.match(/^\/status\/(\d{3})$/);
    if (statusMatch) {
      const code = Number(statusMatch[1]);
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code, description: STATUS_CODES[code] || "" }, null, 2));
      return;
    }

    if (url.pathname === "/ip") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ origin: req.socket.remoteAddress || MOCK_CONNECT_HOST }));
      return;
    }

    if (url.pathname === "/headers") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ headers: req.headers }, null, 2));
      return;
    }

    if (url.pathname === "/response-headers") {
      const echoed = Object.fromEntries(url.searchParams.entries());
      res.writeHead(200, { ...echoed, "Content-Type": "application/json" });
      res.end(JSON.stringify(echoed, null, 2));
      return;
    }

    if (url.pathname === "/cookies/set" && url.searchParams.size > 0) {
      const [name, value] = url.searchParams.entries().next().value as [string, string];
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": `${name}=${value}; Path=/`,
      });
      res.end(JSON.stringify({ cookies: parseCookies(req) }));
      return;
    }

    if (url.pathname === "/cookies/delete") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": [...url.searchParams.keys()].map((name) => `${name}=; Path=/; Max-Age=0`),
      });
      res.end(JSON.stringify({ cookies: {} }));
      return;
    }

    if (url.pathname === "/cookies") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ cookies: parseCookies(req) }));
      return;
    }

    const basicAuthMatch = url.pathname.match(/^\/basic-auth\/([^/]+)\/([^/]+)$/);
    if (basicAuthMatch) {
      const expected = `Basic ${Buffer.from(`${basicAuthMatch[1]}:${basicAuthMatch[2]}`).toString("base64")}`;
      if (req.headers.authorization !== expected) {
        res.writeHead(401, {
          "WWW-Authenticate": 'Basic realm="Fake Realm"',
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify({ authenticated: false }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ authenticated: true, user: basicAuthMatch[1] }));
      return;
    }

    if (url.pathname === "/post" || url.pathname === "/delete") {
      void readBody(req).then((raw) => {
        if (res.destroyed) return;
        const data = raw.toString("utf-8");
        const contentType = `${req.headers["content-type"] || ""}`;
        const form: Record<string, string[]> = {};
        let json: unknown = null;
        if (contentType.includes("application/x-www-form-urlencoded")) {
          for (const [name, value] of new URLSearchParams(data)) {
            (form[name] ??= []).push(value);
          }
        }
        if (contentType.includes("application/json")) {
          try {
            json = JSON.parse(data);
          } catch {
            json = null;
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ method: req.method, args: Object.fromEntries(url.searchParams), data, form, json }));
      });
      return;
    }

    // httpbingo /drip：延迟 delay 秒后，把 numbytes 字节分批写完，跨度 duration 秒。
    // 用例断言至少 4 次 onprogress，所以必须真的分多块下发而不是一次性写完。
    if (url.pathname === "/drip") {
      const numbytes = Number(url.searchParams.get("numbytes") || 10);
      const duration = Number(url.searchParams.get("duration") || 0) * 1000;
      const delay = Number(url.searchParams.get("delay") || 0) * 1000;
      streamInChunks(res, Buffer.alloc(numbytes, "a"), "application/octet-stream", 8, duration / 8, delay);
      return;
    }

    // raw.githubusercontent.com 上的三个固定文件：用例只断言事件序列与响应体类型，
    // 不断言文件内容，所以这里只需复刻「小文本 / 大非 JSON 文本 / 大 JSON」三种形态。
    const rawMatch = url.pathname.match(/^\/raw\/(.+)$/);
    if (rawMatch) {
      if (rawMatch[1] === "large-file.json") {
        const body = Buffer.from(JSON.stringify(Array.from({ length: 20_000 }, (_, i) => ({ id: i, name: `n${i}` }))));
        streamLargeBody(res, body, "application/json");
        return;
      }
      if (rawMatch[1] === "big.txt") {
        streamLargeBody(res, Buffer.alloc(600_000, "the quick brown fox "), "text/plain");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("root = true\n\n[*]\nindent_style = space\nindent_size = 2\n");
      return;
    }

    if (url.pathname === "/translate_a/single") {
      // 复刻 translate.googleapis.com 的响应头，用例断言的正是这几个头字段透传是否正确。
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Reporting-Endpoints": 'default="/_/TranslateApiHttp/web-reports?context=eJzj4tDSz8ksLtHPTS3JSC0GAB6vBQA"',
        "Cross-Origin-Opener-Policy": "same-origin",
      });
      res.end(JSON.stringify({ sentences: [{ trans: "来了！！", orig: "くる！！" }], src: "ja" }));
      return;
    }

    const bytesMatch = url.pathname.match(/^\/bytes\/(\d+)$/);
    if (bytesMatch) {
      const size = Number(bytesMatch[1]);
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(Buffer.alloc(size, "a"));
      return;
    }

    const delayMatch = url.pathname.match(/^\/delay\/(\d+)$/);
    if (delayMatch) {
      const delayMs = Number(delayMatch[1]) * 1000;
      setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ url: `http://${req.headers.host}${url.pathname}` }));
      }, delayMs);
      return;
    }

    if (req.headers.host?.startsWith(CSP_TARGET_HOST)) {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self'; connect-src 'self'"
      );
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      '<!doctype html><html><head><title>ScriptCat E2E</title></head><body><main class="container"><div class="masthead">ScriptCat E2E</div></main></body></html>'
    );
  });

  // Node 的 HTTP 解析器只认标准方法，会把 gm_xhr_test.js 的 `method: "FOOBAR"` 直接判为协议错误。
  // 真实 httpbingo 对未知方法回 405，这里手写同样的响应，避免退化成连接被重置。
  server.on("clientError", (err: NodeJS.ErrnoException, socket) => {
    if (err.code === "HPE_INVALID_METHOD" && socket.writable) {
      socket.end("HTTP/1.1 405 Method Not Allowed\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, MOCK_CONNECT_HOST, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    origin: `http://${MOCK_CONNECT_HOST}:${address.port}`,
    cspOrigin: `http://${CSP_TARGET_HOST}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

function patchTargetMatchCode(code: string, targetUrl: string): string {
  const url = new URL(targetUrl);
  const targetPattern = `${url.protocol}//${url.hostname}/*${url.search}`;
  return code.replace(
    /^\/\/\s*@match\s+.*\?(gm_api_sync|gm_api_async|inject_content|early_inject_content|early_inject_page|WINDOW_MESSAGE_TEST_SC|SANDBOX_TEST_SC|unwrap_e2e_test|GM_XHR_REDIRECT_TEST_SC|GM_DOWNLOAD_TEST_SC|GM_XHR_TEST_SC)$/gm,
    `// @match        ${targetPattern}`
  );
}

// 把框架的 CDN @require 重写到本地 mock server：CI 不依赖外网，且始终测工作区版本而非 CDN 上的旧版。
function patchRequireCode(code: string, origin: string): string {
  return code.replace(
    /https:\/\/cdn\.jsdelivr\.net\/gh\/scriptscat\/scriptcat@[^/]+\/example\/tests\/lib\/sctest\.js/g,
    `${origin}/lib/sctest.js`
  );
}

function patchGMApiTestCode(code: string, mockOrigin: string): string {
  const mockHost = new URL(mockOrigin).host;
  return (
    code
      .replace(/^\/\/\s*@connect\s+api\.github\.com$/gm, `// @connect      ${MOCK_CONNECT_HOST}`)
      .replace(/^\/\/\s*@connect\s+httpbingo\.org$/gm, `// @connect      ${MOCK_CONNECT_HOST}`)
      .replace(/https:\/\/api\.github\.com\/repos\/scriptscat\/scriptcat/g, `${mockOrigin}/repos/scriptscat/scriptcat`)
      .replace(/https:\/\/httpbingo\.org\/get/g, `${mockOrigin}/get`)
      .replace(/https:\/\/httpbingo\.org\/bytes\/64/g, `${mockOrigin}/bytes/64`)
      .replace(/https:\/\/httpbingo\.org\/delay\/5/g, `${mockOrigin}/delay/5`)
      .replace(/https:\/\/www\.tampermonkey\.net\/favicon\.ico/g, `${mockOrigin}/favicon.ico`)
      .replace(/api\.github\.com\/repos\/scriptscat\/scriptcat/g, `${mockHost}/repos/scriptscat/scriptcat`)
      .replace(/httpbingo\.org\/get/g, `${mockHost}/get`)
      // gm_xhr_redirect_test.js / gm_download_test.js / gm_xhr_test.js build every request URL off
      // this constant rather than writing literal https://httpbingo.org/... URLs.
      .replace(/const HB = "https:\/\/httpbingo\.org";/, `const HB = "${mockOrigin}";`)
      // gm_xhr_test.js 拉三个固定的 raw.githubusercontent.com 文件，按文件名映射到本地 /raw/<file>。
      // 这两个域的 @connect 行刻意保持原样：改写后会和 httpbingo 那行一起变成重复的
      // @connect 127.0.0.1，而重复的 @connect 值会让脚本完全不执行。
      .replace(/https:\/\/raw\.githubusercontent\.com\/\S*?\/([\w.-]+)\?/g, `${mockOrigin}/raw/$1?`)
      .replace(/https:\/\/translate\.googleapis\.com/g, mockOrigin)
  );
}

async function runTestScript(
  context: BrowserContext,
  extensionId: string,
  scriptFile: string,
  targetUrl: string,
  timeoutMs: number,
  options?: {
    patchCode?: (code: string) => string;
    requireOrigin?: string;
    // B 类文件的 sctest 套件是 auto:false（真实下载副作用），页面加载不会自动跑，需要先点面板的
    // 「运行」按钮。首次加载时 ConsoleReporter 已经打过一次汇总（那时用例全被预置为 skip，
    // 即 "通过: 0 / 失败: 0"），所以点击后必须等**新的一次**汇总，不能沿用已有值。
    beforeCollect?: (page: Page) => Promise<void>;
  }
): Promise<{ passed: number; failed: number; logs: string[] }> {
  let code = fs.readFileSync(path.join(__dirname, `../example/tests/${scriptFile}`), "utf-8");
  code = patchScriptCode(code);
  if (options?.requireOrigin) code = patchRequireCode(code, options.requireOrigin);
  code = patchTargetMatchCode(code, targetUrl);
  code = options?.patchCode ? options.patchCode(code) : code;

  await installScriptByCode(context, extensionId, code);
  autoApprovePermissions(context);

  const page = await context.newPage();
  const logs: string[] = [];
  let passed = -1;
  let failed = -1;

  // 「失败:」是三行汇总里的最后一行，用它计数即可判定又打完了一整组汇总。
  let summaryCount = 0;

  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(text);
    const passMatch = text.match(/(通过|Passed)[:：]\s*(\d+)/);
    const failMatch = text.match(/(失败|Failed)[:：]\s*(\d+)/);
    if (passMatch) passed = parseInt(passMatch[2], 10);
    if (failMatch) {
      failed = parseInt(failMatch[2], 10);
      summaryCount++;
    }
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

  if (options?.beforeCollect) {
    // 顺序很重要：先等页面加载时那组汇总打完（那时 auto:false 的用例还全是 skip，
    // 汇总是 "通过: 0 / 失败: 0"），再点按钮，最后等下一组汇总。
    // 若在 goto 之后立刻取快照，首次汇总往往还没打，会让第二个轮询被它立即满足而读到 0/0。
    await expect
      .poll(() => summaryCount > 0, { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] })
      .toBe(true)
      .catch(() => undefined);
    const seenBefore = summaryCount;
    await options.beforeCollect(page);
    await expect
      .poll(() => summaryCount > seenBefore, { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] })
      .toBe(true)
      .catch(() => undefined);
  } else {
    await expect
      .poll(() => passed >= 0 && failed >= 0, { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] })
      .toBe(true)
      .catch(() => undefined);
  }

  await page.close();
  return { passed, failed, logs };
}

// 设计稿统一为“运行全部”入口；旧面板若仍提供 suite 专属按钮则优先使用。
// 两条路径都只执行自动用例，itManual 保持待人工确认。
function clickSuiteRunButton(suiteName: string) {
  return async (page: Page): Promise<void> => {
    const host = page.locator("#sctest-panel-host");
    await host.waitFor({ state: "attached", timeout: 15_000 });
    const clicked = await host.evaluate((el: HTMLElement, name: string) => {
      const root = el.shadowRoot;
      const button =
        root?.querySelector<HTMLButtonElement>(`[data-sctest-suite="${name}"]`) ??
        root?.querySelector<HTMLButtonElement>('[data-sctest="run-all"]');
      button?.click();
      return Boolean(button);
    }, suiteName);
    expect(clicked, `No panel run button found for suite: ${suiteName}`).toBe(true);
  };
}

test.describe("GM API", () => {
  let gmApiMockServer: GMApiMockServer;

  test.beforeAll(async () => {
    gmApiMockServer = await startGMApiMockServer();
  });

  test.afterAll(async () => {
    await gmApiMockServer.close();
  });

  function patchCode(code: string): string {
    return patchGMApiTestCode(code, gmApiMockServer.origin);
  }

  test.setTimeout(300_000);

  test("local CSP target blocks page inline scripts", async ({ context }) => {
    const page = await context.newPage();
    await page.goto(`${gmApiMockServer.cspOrigin}/?csp_probe`, { waitUntil: "domcontentloaded" });

    const inlineRan = await page.evaluate(async () => {
      const key = `__scriptcat_csp_probe_${Date.now()}`;
      const script = document.createElement("script");
      script.textContent = `window["${key}"] = true;`;
      document.head.appendChild(script);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return Boolean((window as Record<string, unknown>)[key]);
    });

    await page.close();
    expect(inlineRan, "The local target page must enforce script-src CSP").toBe(false);
  });

  test("SCTest panel keeps its layout when the page blocks inline styles", async ({ context }) => {
    const page = await context.newPage();
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) violations.push(message.text());
    });
    await page.goto(`${gmApiMockServer.cspOrigin}/?sctest_panel_csp`, { waitUntil: "domcontentloaded" });
    await page.evaluate(fs.readFileSync(path.resolve(__dirname, "../example/tests/lib/sctest.js"), "utf8"));

    const result = await page.evaluate(async () => {
      const testRun = (window as typeof window & { SCTest: SCTestBrowserApi }).SCTest.create({
        name: "CSP panel",
        reporter: "panel",
      });
      testRun.describe("suite", () => testRun.it("case", () => testRun.expect(1).toBe(1)));
      await testRun.run();
      const panel = document.getElementById("sctest-panel-host")?.shadowRoot?.querySelector<HTMLElement>(".sc-panel");
      const styles = panel && getComputedStyle(panel);
      return {
        position: styles?.position,
        width: styles?.width,
        adoptedStyleSheets:
          panel?.getRootNode() instanceof ShadowRoot ? panel.getRootNode().adoptedStyleSheets.length : 0,
      };
    });

    expect(result).toEqual({ position: "fixed", width: "440px", adoptedStyleSheets: 1 });
    expect(violations).toEqual([]);
    await page.close();
  });

  test("GM_ sync API tests (gm_api_sync_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_api_sync_test.js",
      `${gmApiMockServer.cspOrigin}/?gm_api_sync`,
      90_000,
      { patchCode, requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[gm_api_sync_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_api_sync_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM_ sync API tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("GM.* async API tests (gm_api_async_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_api_async_test.js",
      `${gmApiMockServer.cspOrigin}/?gm_api_async`,
      90_000,
      { patchCode, requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[gm_api_async_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_api_async_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM.* async API tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("Content inject tests (inject_content_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "inject_content_test.js",
      `${gmApiMockServer.cspOrigin}/?inject_content`,
      60_000,
      { requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[inject_content_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[inject_content_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some content inject tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("@early-start page world 脚本应在 CSP 页面的解析早期执行", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "early_inject_page_test.js",
      `${gmApiMockServer.cspOrigin}/?early_inject_page`,
      60_000,
      { requireOrigin: gmApiMockServer.origin }
    );

    if (failed !== 0) console.log("[early_inject_page_test] logs:", logs.join("\n"));
    expect(failed, "Some early page-world injection tests failed").toBe(0);
    expect(passed, "No early page-world results found - script may not have run").toBeGreaterThan(0);
  });

  test("@early-start content world 脚本应在 CSP 页面的解析早期执行", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "early_inject_content_test.js",
      `${gmApiMockServer.cspOrigin}/?early_inject_content`,
      60_000,
      { requireOrigin: gmApiMockServer.origin }
    );

    if (failed !== 0) console.log("[early_inject_content_test] logs:", logs.join("\n"));
    expect(failed, "Some early content-world injection tests failed").toBe(0);
    expect(passed, "No early content-world results found - script may not have run").toBeGreaterThan(0);
  });

  test("Unwrap scriptlet tests (unwrap_e2e_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "unwrap_e2e_test.js",
      `${gmApiMockServer.cspOrigin}/?unwrap_e2e_test`,
      60_000,
      { requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[unwrap_e2e_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[unwrap_e2e_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some unwrap scriptlet tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("WindowMessage Transport Test (window_message_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "window_message_test.js",
      `${gmApiMockServer.cspOrigin}/?WINDOW_MESSAGE_TEST_SC`,
      8_000,
      { patchCode, requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[window_message_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[window_message_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some window message tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("Sandbox Test (sandbox_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "sandbox_test.js",
      `${gmApiMockServer.cspOrigin}/?SANDBOX_TEST_SC`,
      8_000,
      { requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[sandbox_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[sandbox_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some sandbox tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("GM_xhr redirect tests (gm_xhr_redirect_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_xhr_redirect_test.js",
      `${gmApiMockServer.origin}/?GM_XHR_REDIRECT_TEST_SC`,
      90_000,
      { patchCode, requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[gm_xhr_redirect_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_xhr_redirect_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM_xhr redirect tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("GM_download tests (gm_download_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_download_test.js",
      `${gmApiMockServer.origin}/?GM_DOWNLOAD_TEST_SC`,
      120_000,
      {
        patchCode,
        requireOrigin: gmApiMockServer.origin,
        // 两个 suite 都是 auto:false；统一入口会执行自动用例，itManual 仍保持待人工确认。
        beforeCollect: clickSuiteRunButton("GM_download 自动套件"),
      }
    );

    console.log(`[gm_download_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_download_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM_download tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("GM_xhr tests (gm_xhr_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_xhr_test.js",
      `${gmApiMockServer.origin}/?GM_XHR_TEST_SC`,
      // 138 个用例（69 个基础用例 × xhr/fetch 两轮），其中含多个秒级的 delay/drip 端点。
      180_000,
      {
        patchCode,
        requireOrigin: gmApiMockServer.origin,
        beforeCollect: clickSuiteRunButton("GM_xmlhttpRequest"),
      }
    );

    console.log(`[gm_xhr_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_xhr_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM_xhr tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });
});

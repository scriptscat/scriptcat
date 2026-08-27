#!/usr/bin/env node
/**
 * 驱动一个已经启动的本地验证会话（见 session.mjs）。
 *
 * 每次调用都是一个短命进程：附着到会话的 CDP 端口，做一件事，记一笔，然后退出。
 * 浏览器状态留在会话里，所以可以一条一条地探查，而不是把整段操作先写成 spec 再重跑。
 *
 * 每条命令都会追加到 <scenario>/actions.log —— 报告里的「如何驱动」直接来自它。
 */
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { liveSessions, readSession, isAlive, scenarioDir } from "./session.mjs";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");

function resolveSession(explicit) {
  if (explicit) {
    const session = readSession(explicit);
    if (!session) fail(`没有会话：${explicit}，先跑 node e2e/session.mjs start ${explicit}`);
    if (!isAlive(session)) fail(`会话已退出：${explicit}，重新 start`);
    return session;
  }
  const live = liveSessions();
  if (live.length === 1) return live[0];
  if (live.length === 0) fail("没有存活的会话，先跑 node e2e/session.mjs start <scenario>");
  fail(`有多个会话，需要指定 --scenario：${live.map((s) => s.scenario).join(", ")}`);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function activeFile(session) {
  return path.join(scenarioDir(session.scenario), ".active");
}

function readActive(session) {
  try {
    const value = fs.readFileSync(activeFile(session), "utf8").trim();
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return { url: value };
    }
  } catch {
    return null;
  }
}

function clearActive(session) {
  fs.rmSync(activeFile(session), { force: true });
}

async function pageTargetId(context, page) {
  const cdp = await context.newCDPSession(page);
  try {
    const { targetInfo } = await cdp.send("Target.getTargetInfo");
    return targetInfo.targetId;
  } finally {
    await cdp.detach().catch(() => {});
  }
}

async function writeActive(context, session, page) {
  fs.writeFileSync(
    activeFile(session),
    `${JSON.stringify({ targetId: await pageTargetId(context, page), url: page.url() })}\n`
  );
}

function logAction(session, line) {
  fs.appendFileSync(path.join(scenarioDir(session.scenario), "actions.log"), `${new Date().toISOString()} ${line}\n`);
}

/** 扩展页优先：storage / sendMessage 只有在扩展来源的页面里才能调 chrome.* */
function extensionPages(context, session) {
  return context.pages().filter((page) => page.url().startsWith(`chrome-extension://${session.extensionId}/`));
}

async function anyExtensionPage(context, session) {
  const [existing] = extensionPages(context, session);
  if (existing) return existing;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${session.extensionId}/src/options.html`, { waitUntil: "domcontentloaded" });
  return page;
}

/**
 * 按 CDP targetId 而不是下标定位当前页：扩展自己会开引导页，下标随时会错位。
 * 旧的 URL 标记仍可读取，并依次退让到「同源同路径」（hash 路由跳转）和最后一个页面。
 */
export async function activePage(context, session) {
  const pages = context.pages();
  if (!pages.length) fail("会话里没有打开的页面，先 open 或 goto");
  const wanted = readActive(session);
  if (!wanted) return pages[pages.length - 1];
  if (wanted.targetId) {
    for (const page of pages) {
      if ((await pageTargetId(context, page)) === wanted.targetId) return page;
    }
  }
  const exact = pages.filter((page) => page.url() === wanted.url).pop();
  if (exact) return exact;
  const base = wanted.url.split("#")[0];
  const sameDocument = pages.filter((page) => page.url().split("#")[0] === base).pop();
  return sameDocument ?? pages[pages.length - 1];
}

const PAGE_ALIASES = {
  options: "src/options.html",
  popup: "src/popup.html",
  editor: "src/options.html#/script/editor",
  logger: "src/options.html#/logger",
  setting: "src/options.html#/setting",
  tools: "src/options.html#/tools",
  subscribe: "src/options.html#/subscribe",
  install: "src/install.html",
  import: "src/import.html",
  batchupdate: "src/batchupdate.html",
};

/**
 * 字符串形式的用户代码：带 return 的当成函数体，否则当成表达式。
 * 两种写法都要能用 await。
 */
function wrapEvalSource(source) {
  return /\breturn\b/.test(source) ? `(async () => { ${source} })()` : `(async () => (${source}))()`;
}

function print(value) {
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

async function run() {
  const argv = process.argv.slice(2);
  const scenarioFlagIndex = argv.indexOf("--scenario");
  let explicitScenario;
  if (scenarioFlagIndex !== -1) {
    explicitScenario = argv[scenarioFlagIndex + 1];
    argv.splice(scenarioFlagIndex, 2);
  }
  const [command, ...args] = argv;
  if (!command || command === "help") return usage();

  const session = resolveSession(explicitScenario);
  const dir = scenarioDir(session.scenario);

  // console 只读会话记录的日志文件，不必附着浏览器
  if (command === "console") {
    const file = path.join(dir, "console.log");
    const count = parseInt(args[0], 10) || 50;
    logAction(session, `console ${count}`);
    if (!fs.existsSync(file)) return console.log("（还没有 console 输出）");
    const lines = fs.readFileSync(file, "utf8").trimEnd().split("\n");
    return console.log(lines.slice(-count).join("\n"));
  }

  // 同 session.mjs：驱动延后到真正要附着浏览器时才加载，上面的 console 命令因此也不必付这份代价。
  const { chromium } = require("@playwright/test");
  const browser = await chromium.connectOverCDP(session.cdp);
  const context = browser.contexts()[0];

  try {
    switch (command) {
      case "open": {
        const target = args[0] ?? "options";
        const suffix = PAGE_ALIASES[target] ?? target.replace(/^\//, "");
        const url = `chrome-extension://${session.extensionId}/${suffix}`;
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await writeActive(context, session, page);
        logAction(session, `open ${target} → ${url}`);
        console.log(`✓ ${await page.title()} — ${url}`);
        break;
      }
      case "goto": {
        if (!args[0]) fail("goto 需要一个 URL");
        const page = await activePage(context, session);
        await page.goto(args[0], { waitUntil: "domcontentloaded" });
        await writeActive(context, session, page);
        logAction(session, `goto ${args[0]}`);
        console.log(`✓ ${await page.title()} — ${page.url()}`);
        break;
      }
      case "click": {
        const page = await activePage(context, session);
        await page.locator(args[0]).first().click({ timeout: 10_000 });
        logAction(session, `click ${args[0]}`);
        console.log(`✓ clicked ${args[0]}`);
        break;
      }
      case "fill": {
        const page = await activePage(context, session);
        await page.locator(args[0]).first().fill(args.slice(1).join(" "), { timeout: 10_000 });
        logAction(session, `fill ${args[0]}`);
        console.log(`✓ filled ${args[0]}`);
        break;
      }
      case "press": {
        const page = await activePage(context, session);
        await page.keyboard.press(args[0]);
        logAction(session, `press ${args[0]}`);
        console.log(`✓ pressed ${args[0]}`);
        break;
      }
      case "wait": {
        const page = await activePage(context, session);
        await page
          .locator(args[0])
          .first()
          .waitFor({ timeout: parseInt(args[1], 10) || 15_000 });
        logAction(session, `wait ${args[0]}`);
        console.log(`✓ appeared ${args[0]}`);
        break;
      }
      case "text": {
        const page = await activePage(context, session);
        const text = await page
          .locator(args[0] ?? "body")
          .first()
          .innerText();
        logAction(session, `text ${args[0] ?? "body"}`);
        console.log(text);
        break;
      }
      case "shot": {
        const page = await activePage(context, session);
        const shots = path.join(dir, "shots");
        fs.mkdirSync(shots, { recursive: true });
        const seq = String(fs.readdirSync(shots).filter((f) => f.endsWith(".png")).length + 1).padStart(2, "0");
        const file = path.join(shots, `${seq}-${args[0] ?? "shot"}.png`);
        await page.screenshot({ path: file, fullPage: args.includes("--full") });
        logAction(session, `shot → ${path.relative(REPO_ROOT, file)}`);
        console.log(`✓ ${path.relative(REPO_ROOT, file)}`);
        break;
      }
      case "eval": {
        const page = await activePage(context, session);
        const result = await page.evaluate(wrapEvalSource(args.join(" ")));
        logAction(session, `eval ${args.join(" ").slice(0, 80)}`);
        print(result);
        break;
      }
      case "sw": {
        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
        const result = await worker.evaluate(wrapEvalSource(args.join(" ")));
        logAction(session, `sw ${args.join(" ").slice(0, 80)}`);
        print(result);
        break;
      }
      case "storage": {
        const page = await anyExtensionPage(context, session);
        const key = args[0] ?? null;
        const result = await page.evaluate((k) => new Promise((resolve) => chrome.storage.local.get(k, resolve)), key);
        logAction(session, `storage ${key ?? "(all)"}`);
        print(key ? result[key] : Object.keys(result));
        break;
      }
      case "install": {
        if (!args[0]) fail("install 需要一个 .user.js 文件路径");
        const code = fs.readFileSync(path.resolve(args[0]), "utf8");
        const page = await anyExtensionPage(context, session);
        // 走 SW 消息而不是 Monaco 粘贴：编辑器路径依赖剪贴板和渲染时序，脆弱得多
        const result = await page.evaluate(
          (source) =>
            chrome.runtime.sendMessage({
              action: "serviceWorker/script/installByCode",
              data: { uuid: crypto.randomUUID(), code: source, upsertBy: "user" },
            }),
          code
        );
        logAction(session, `install ${args[0]} → ${JSON.stringify(result)}`);
        print(result);
        break;
      }
      case "snapshot": {
        const page = await activePage(context, session);
        const items = await page.evaluate((scopeSelector) => {
          const root = document.querySelector(scopeSelector) ?? document.body;
          const INTERACTIVE =
            'a,button,input,select,textarea,summary,[role="button"],[role="tab"],[role="link"],' +
            '[role="menuitem"],[role="switch"],[role="checkbox"],[role="radio"],[role="option"],' +
            '[contenteditable="true"],[data-testid]';
          const label = (el) =>
            (el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || el.title || "")
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 60);
          // 选择器优先级：testid > 稳定 id > 可见文本。Tailwind 的 class 串没有定位价值，
          // Radix 自动生成的 id（radix-_r_0_）每次渲染都会变，当作不存在。
          const selectorFor = (el) => {
            const testId = el.getAttribute("data-testid");
            if (testId) return `[data-testid="${testId}"]`;
            const stableId = el.id && !/[^\w-]/.test(el.id) && !el.id.startsWith("radix-") ? el.id : null;
            if (stableId) return `#${stableId}`;
            const text = label(el);
            if (text && !text.includes('"')) return `text="${text}"`;
            return null;
          };
          return [...root.querySelectorAll(INTERACTIVE)]
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            })
            .map((el) => ({
              selector: selectorFor(el),
              label: label(el),
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute("role") || "",
              disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
            }))
            .filter((item) => item.selector);
        }, args[0] ?? "body");

        const seen = new Set();
        const unique = items.filter((item) => !seen.has(item.selector) && seen.add(item.selector));
        if (!unique.length) console.log("（这个范围里没有可交互元素，换个 scope 或先 wait）");
        for (const item of unique) {
          const kind = item.role ? `${item.tag}/${item.role}` : item.tag;
          console.log(`${item.disabled ? "✗" : " "} ${item.selector.padEnd(46)} ${kind.padEnd(14)} ${item.label}`);
        }
        logAction(session, `snapshot ${args[0] ?? "body"} → ${unique.length} 个可交互元素`);
        break;
      }
      case "pages": {
        const current = await activePage(context, session);
        context.pages().forEach((page, i) => console.log(`${page === current ? "→" : " "} ${i}  ${page.url()}`));
        logAction(session, "pages");
        break;
      }
      case "use": {
        const index = parseInt(args[0], 10);
        const target = context.pages()[index];
        if (Number.isNaN(index) || !target) fail(`没有第 ${args[0]} 个页面，先看 pages`);
        await writeActive(context, session, target);
        logAction(session, `use ${index}`);
        console.log(`✓ 当前页 ${index} — ${target.url()}`);
        break;
      }
      case "close": {
        const page = await activePage(context, session);
        await page.close();
        clearActive(session);
        logAction(session, "close");
        console.log("✓ closed");
        break;
      }
      default:
        usage();
        process.exitCode = 1;
    }
  } finally {
    // 只断开控制连接，不要关掉会话浏览器
    await browser.close();
  }
}

function usage() {
  console.log(`驱动本地验证会话（默认自动选中唯一存活的会话，多个时用 --scenario <name>）

  open <options|popup|editor|logger|setting|tools|subscribe|install|import|batchupdate|路径>
  goto <url>                     当前页导航
  click <selector>               点击
  fill <selector> <value>        填入
  press <key>                    按键，如 Enter、ControlOrMeta+a
  wait <selector> [ms]           等元素出现
  snapshot [scope]               列出可交互元素及可直接用的 selector（点之前先看这个）
  text [selector]                取 innerText（默认 body）
  shot [name] [--full]           截图到 <scenario>/shots/
  eval <js>                      在当前页执行（带 return 当函数体，否则当表达式）
  sw <js>                        在扩展 Service Worker 里执行
  storage [key]                  读 chrome.storage.local
  install <file.user.js>         经 SW 装一个脚本
  pages / use <i> / close        页面管理
  console [n]                    会话记录的最近 n 行 console/pageerror`);
}

if (process.argv[1] === __filename) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

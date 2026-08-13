#!/usr/bin/env node
/**
 * 本地验证会话的生命周期管理。
 *
 * 启动一个常驻的、加载了 dist/ext 的浏览器，把连接信息写进
 * `e2e/scratch/<scenario>/.session.json`，之后由 `drive.mjs` 逐条命令附着上去操作 ——
 * 验证一件事不再需要先写一个 spec 再整体重跑。
 *
 * 默认无头：验证过程不该抢占桌面焦点，也才能在多个 worktree 里同时跑。
 * `--headed` 只为人工旁观保留。
 *
 * 并发的唯一全局资源是 CDP 端口，所以这里向内核要一个空闲端口（listen(0)）而不是写死；
 * profile 走 mkdtemp，evidence 走各自的 scenario 目录，两者天然隔离。
 */
import process from "node:process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const __filename = fileURLToPath(import.meta.url);
const E2E_DIR = path.dirname(__filename);
const REPO_ROOT = path.resolve(E2E_DIR, "..");
const SCRATCH_DIR = path.join(E2E_DIR, "scratch");
const EXTENSION_DIR = path.join(REPO_ROOT, "dist", "ext");

const SESSION_FILE = ".session.json";
const CONSOLE_LOG = "console.log";
const DAEMON_LOG = "daemon.log";

export function scenarioDir(scenario) {
  return path.join(SCRATCH_DIR, scenario);
}

export function readSession(scenario) {
  const file = path.join(scenarioDir(scenario), SESSION_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // 半写入的会话文件等同于没有会话
    return null;
  }
}

export function isAlive(session) {
  if (!session?.pid) return false;
  try {
    process.kill(session.pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 列出本 worktree 下所有仍然存活的会话 */
export function liveSessions() {
  if (!fs.existsSync(SCRATCH_DIR)) return [];
  return fs
    .readdirSync(SCRATCH_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSession(entry.name))
    .filter((session) => session && isAlive(session));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function requireBuiltExtension() {
  if (!fs.existsSync(path.join(EXTENSION_DIR, "manifest.json"))) {
    console.error(`✗ 没有找到 ${path.relative(REPO_ROOT, EXTENSION_DIR)}/manifest.json`);
    console.error("  先构建扩展：pnpm run dev（或 pnpm run build）");
    process.exit(1);
  }
}

// 预先标记「非首次使用」，避免新手引导欢迎弹窗的模态遮罩拦截后续操作。
function dismissOnboarding() {
  try {
    localStorage.setItem("firstUse", "false");
  } catch {
    // about:blank 等不透明来源无法访问 localStorage，忽略即可
  }
}

/**
 * 常驻进程本体：持有浏览器直到收到 SIGTERM。
 */
async function serve(scenario, { headed }) {
  requireBuiltExtension();

  const dir = scenarioDir(scenario);
  fs.mkdirSync(dir, { recursive: true });
  const consolePath = path.join(dir, CONSOLE_LOG);
  const appendConsole = (line) => fs.appendFileSync(consolePath, `${new Date().toISOString()} ${line}\n`);

  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sc-verify-${scenario}-`));

  const launch = (extraArgs) =>
    chromium.launchPersistentContext(profile, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
        "--disable-gpu",
        ...(headed ? [] : ["--headless=new"]),
        ...extraArgs,
      ],
      timeout: 60_000,
    });

  // 阶段一：授权 userScripts 后立刻关掉。userScripts 是可选权限，不授权则页面脚本
  // 永远不会注入；而 updateExtensionConfiguration 会重载扩展，重载期间它自己的页面
  // 会 ERR_BLOCKED_BY_CLIENT。授权落在 profile 里，所以重启一次即可干净接管。
  {
    const setup = await launch([]);
    let [bg] = setup.serviceWorkers();
    if (!bg) bg = await setup.waitForEvent("serviceworker", { timeout: 30_000 });
    const id = bg.url().split("/")[2];
    const grantPage = await setup.newPage();
    await grantPage.goto("chrome://extensions/");
    await grantPage.waitForLoadState("domcontentloaded");
    await grantPage.waitForFunction(() => !!chrome.developerPrivate, { timeout: 10_000 });
    await grantPage.evaluate(async (extId) => {
      await chrome.developerPrivate.updateExtensionConfiguration({ extensionId: extId, userScriptsAccess: true });
    }, id);
    await setup.close();
  }

  // 阶段二：真正对外提供服务的实例，带 CDP 端口
  const context = await launch([`--remote-debugging-port=${port}`]);
  await context.addInitScript(dismissOnboarding);

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  const extensionId = worker.url().split("/")[2];

  // 扩展安装后会自己弹引导页，且是在 SW 起来之后异步开的；不清掉的话 drive.mjs pages
  // 里全是噪声。等一小会儿再扫一次，覆盖这个时间差。
  // 必须在写会话文件之前扫干净：会话一旦对外可见，drive.mjs 打开的页面就不能再被误关。
  const sweepStrayTabs = async () => {
    for (const page of context.pages()) {
      if (!page.url().startsWith("about:blank")) await page.close().catch(() => {});
    }
  };
  await sweepStrayTabs();
  await new Promise((resolve) => setTimeout(resolve, 2_500));
  await sweepStrayTabs();

  // 会话全程记录 console/pageerror：drive.mjs 每条命令都是新进程，事后附着看不到历史输出。
  const watch = (page) => {
    const where = () => {
      const url = page.url();
      return url.startsWith(`chrome-extension://${extensionId}/`)
        ? url.slice(`chrome-extension://${extensionId}/`.length)
        : url;
    };
    page.on("console", (msg) => appendConsole(`[${msg.type()}] (${where()}) ${msg.text()}`));
    page.on("pageerror", (err) => appendConsole(`[pageerror] (${where()}) ${err.message}`));
  };
  context.pages().forEach(watch);
  context.on("page", watch);

  const session = {
    scenario,
    port,
    extensionId,
    profile,
    headed: !!headed,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    cdp: `http://127.0.0.1:${port}`,
  };
  fs.writeFileSync(path.join(dir, SESSION_FILE), `${JSON.stringify(session, null, 2)}\n`);
  appendConsole(`[session] started ${headed ? "headed" : "headless"} on port ${port}, extension ${extensionId}`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    appendConsole("[session] stopping");
    try {
      await context.close();
    } catch {
      // 浏览器可能已被外部关闭
    }
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(path.join(dir, SESSION_FILE), { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  // 人工关掉 headed 窗口时，进程也应随之退出，不留下悬空的会话文件
  context.on("close", shutdown);
}

async function start(scenario, { headed }) {
  requireBuiltExtension();

  const existing = readSession(scenario);
  if (existing && isAlive(existing)) {
    console.log(`会话已在运行：${scenario} (pid ${existing.pid}, port ${existing.port})`);
    return;
  }

  const dir = scenarioDir(scenario);
  fs.mkdirSync(dir, { recursive: true });
  fs.rmSync(path.join(dir, SESSION_FILE), { force: true });

  const logFd = fs.openSync(path.join(dir, DAEMON_LOG), "a");
  const child = spawn(process.execPath, [__filename, "__serve", scenario, ...(headed ? ["--headed"] : [])], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const session = readSession(scenario);
    if (session) {
      console.log(`✓ 会话已启动：${scenario}`);
      console.log(`  模式        ${session.headed ? "headed（可见）" : "headless（不可见）"}`);
      console.log(`  CDP         ${session.cdp}`);
      console.log(`  扩展 ID     ${session.extensionId}`);
      console.log(`  证据目录    ${path.relative(REPO_ROOT, dir)}/`);
      console.log(`  下一步      node e2e/drive.mjs open options`);
      return;
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.error(`✗ 会话启动失败，看 ${path.relative(REPO_ROOT, path.join(dir, DAEMON_LOG))}`);
  process.exit(1);
}

async function stop(scenario) {
  const session = readSession(scenario);
  if (!session) {
    console.log(`没有会话：${scenario}`);
    return;
  }
  if (!isAlive(session)) {
    fs.rmSync(path.join(scenarioDir(scenario), SESSION_FILE), { force: true });
    fs.rmSync(session.profile, { recursive: true, force: true });
    console.log(`清理了残留会话文件：${scenario}`);
    return;
  }
  process.kill(session.pid, "SIGTERM");
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && isAlive(session)) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  // 守护进程负责清理 profile 与会话文件；它没做完就兜底，避免留下几百 MB 的 profile
  fs.rmSync(path.join(scenarioDir(scenario), SESSION_FILE), { force: true });
  fs.rmSync(session.profile, { recursive: true, force: true });
  console.log(`✓ 已停止：${scenario}`);
}

function status(scenario) {
  const sessions = scenario ? [readSession(scenario)].filter(Boolean) : liveSessions();
  if (!sessions.length) {
    console.log(scenario ? `没有会话：${scenario}` : "没有存活的会话");
    return;
  }
  for (const session of sessions) {
    const alive = isAlive(session);
    console.log(
      `${alive ? "●" : "○"} ${session.scenario}  port=${session.port}  ext=${session.extensionId}  ` +
        `${session.headed ? "headed" : "headless"}  pid=${session.pid}${alive ? "" : "（已退出）"}`
    );
  }
}

function usage() {
  console.log(`本地验证会话

  node e2e/session.mjs start <scenario> [--headed]   启动常驻浏览器（默认不可见）
  node e2e/session.mjs status [<scenario>]           查看会话
  node e2e/session.mjs stop <scenario> | --all       停止并清理
  node e2e/session.mjs list                          等同 status

证据与会话文件都落在 e2e/scratch/<scenario>/（已 gitignore）。
用 node e2e/drive.mjs 驱动会话。`);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const headed = argv.includes("--headed");
  const positional = argv.slice(1).filter((arg) => !arg.startsWith("--"));
  const scenario = positional[0];

  switch (command) {
    case "__serve":
      await serve(scenario, { headed });
      break;
    case "start":
      if (!scenario) {
        console.error("✗ 需要 scenario 名：node e2e/session.mjs start <scenario>");
        process.exit(1);
      }
      await start(scenario, { headed });
      break;
    case "stop":
      if (argv.includes("--all")) {
        for (const session of liveSessions()) await stop(session.scenario);
      } else if (!scenario) {
        console.error("✗ 需要 scenario 名，或用 --all");
        process.exit(1);
      } else {
        await stop(scenario);
      }
      break;
    case "status":
    case "list":
      status(scenario);
      break;
    default:
      usage();
      process.exit(command ? 1 : 0);
  }
}

// 被 drive.mjs 作为模块导入时不执行 CLI
if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

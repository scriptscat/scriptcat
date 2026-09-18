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
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const E2E_DIR = path.dirname(__filename);
const REPO_ROOT = path.resolve(E2E_DIR, "..");
const SCRATCH_DIR = path.join(E2E_DIR, "scratch");
const EXTENSION_DIR = path.join(REPO_ROOT, "dist", "ext");

const SESSION_FILE = ".session.json";
const LOCK_FILE = ".session.lock";
const CONSOLE_LOG = "console.log";
const DAEMON_LOG = "daemon.log";

const SCENARIO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateScenario(scenario) {
  if (typeof scenario !== "string" || !SCENARIO_PATTERN.test(scenario)) {
    throw new Error(`scenario 必须是单层名称（字母、数字、点、下划线或连字符）：${scenario}`);
  }
  return scenario;
}

export function scenarioDir(scenario) {
  validateScenario(scenario);
  return path.join(SCRATCH_DIR, scenario);
}

function sessionFile(scenario) {
  return path.join(scenarioDir(scenario), SESSION_FILE);
}

function lockFile(scenario) {
  return path.join(scenarioDir(scenario), LOCK_FILE);
}

export function readSession(scenario) {
  const file = sessionFile(scenario);
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
    .filter((entry) => entry.isDirectory() && SCENARIO_PATTERN.test(entry.name))
    .map((entry) => readSession(entry.name))
    .filter((session) => session && isAlive(session));
}

function allSessionScenarios() {
  if (!fs.existsSync(SCRATCH_DIR)) return [];
  return fs
    .readdirSync(SCRATCH_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SCENARIO_PATTERN.test(entry.name))
    .filter((entry) => fs.existsSync(sessionFile(entry.name)) || fs.existsSync(lockFile(entry.name)))
    .map((entry) => entry.name);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeLock(scenario, lock) {
  fs.writeFileSync(lockFile(scenario), `${JSON.stringify(lock)}\n`, { flag: "w" });
}

function removeLock(scenario, token) {
  const file = lockFile(scenario);
  const lock = readJson(file);
  if (!token || lock?.token === token) fs.rmSync(file, { force: true });
}

function acquireLock(scenario) {
  const token = randomUUID();
  const file = lockFile(scenario);
  fs.mkdirSync(scenarioDir(scenario), { recursive: true });

  for (;;) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeFileSync(fd, `${JSON.stringify({ pid: process.pid, token })}\n`);
      fs.closeSync(fd);
      return token;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = readJson(file);
      if (existing?.pid && isAlive(existing)) {
        throw new Error(`会话正在启动：${scenario}`);
      }
      fs.rmSync(file, { force: true });
    }
  }
}

function claimLock(scenario, token) {
  const lock = readJson(lockFile(scenario));
  if (!lock || lock.token !== token) throw new Error(`无法取得会话锁：${scenario}`);
  writeLock(scenario, { pid: process.pid, token });
}

function isManagedProfile(profile) {
  if (typeof profile !== "string") return false;
  const resolved = path.resolve(profile);
  return path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("sc-verify-");
}

function removeSessionArtifacts(scenario, session) {
  fs.rmSync(sessionFile(scenario), { force: true });
  if (isManagedProfile(session?.profile)) fs.rmSync(session.profile, { recursive: true, force: true });
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

function renderRemoteObject(arg) {
  if ("value" in arg) return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
  if (arg.unserializableValue) return arg.unserializableValue;
  // 对象参数不会带 value，只有 preview；断言常常就打在这上面，渲染成 Object 等于没记
  const { preview } = arg;
  if (preview?.properties) {
    const isArray = preview.subtype === "array";
    const parts = preview.properties.map((p) => (isArray ? (p.value ?? p.type) : `${p.name}: ${p.value ?? p.type}`));
    if (preview.overflow) parts.push("…");
    return isArray ? `[${parts.join(", ")}]` : `{${parts.join(", ")}}`;
  }
  return arg.description ?? arg.type;
}

/**
 * 收集**所有**执行上下文的 console，而不只是页面。
 *
 * 扩展 Service Worker、Offscreen 文档、Offscreen 里的 Sandbox iframe 各自是独立的 CDP
 * target，后台脚本与脚本自测的断言恰恰打在这些地方；Playwright 只暴露页面的 console 事件，
 * 所以这里直接连浏览器级 CDP 端点，用 Target.setAutoAttach 递归挂到每个 target 上。
 *
 * `waitForDebuggerOnStart` 让新 target 在跑第一行代码前就被挂上，document-start 的日志
 * 才不会漏；代价是每个 target 都必须收到 runIfWaitingForDebugger，否则会被永久挂起。
 */
export async function attachConsoleCollector(port, append, onDisconnect = () => {}, fetchVersion = fetch) {
  const version = await fetchVersion(`http://127.0.0.1:${port}/json/version`).then((res) => res.json());
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  const targetOf = new Map(); // sessionId -> targetId
  const infoOf = new Map(); // targetId -> targetInfo（URL 会随导航变，必须持续更新）
  const listening = new Set(); // 已经 Runtime.enable 过的 sessionId
  let nextId = 1;
  const send = (method, params, sessionId) =>
    socket.send(JSON.stringify({ id: nextId++, method, params: params ?? {}, ...(sessionId ? { sessionId } : {}) }));
  const autoAttach = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true };

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("close", onDisconnect, { once: true });
  send("Target.setAutoAttach", autoAttach);
  // 没有 discovery 就收不到 targetInfoChanged，页面导航后 URL 会一直停在附着那一刻的值
  send("Target.setDiscoverTargets", { discover: true });

  const where = (sessionId) => {
    const info = infoOf.get(targetOf.get(sessionId));
    return info ? info.url.replace(/^chrome-extension:\/\/[a-p]+\//, "") || info.type : "?";
  };

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Target.attachedToTarget") {
      const { sessionId, targetInfo } = message.params;
      targetOf.set(sessionId, targetInfo.targetId);
      // 子 target（Offscreen 里的 Sandbox iframe）只能从它的父 session 再挂一层
      send("Target.setAutoAttach", autoAttach, sessionId);
      // 同一个 target 可能被多个父 session 各挂一次，而 Runtime.enable 会把该上下文
      // 已有的 console 历史重放一遍 —— 每个 target 只开一次，否则日志成倍重复。
      if (!infoOf.has(targetInfo.targetId)) {
        infoOf.set(targetInfo.targetId, targetInfo);
        listening.add(sessionId);
        send("Runtime.enable", {}, sessionId);
        send("Log.enable", {}, sessionId);
      }
      // 无论是否监听都要放行，否则 waitForDebuggerOnStart 会把这个 target 永久挂起
      send("Runtime.runIfWaitingForDebugger", {}, sessionId);
      return;
    }
    if (message.method === "Target.targetInfoChanged") {
      const { targetInfo } = message.params;
      if (infoOf.has(targetInfo.targetId)) infoOf.set(targetInfo.targetId, targetInfo);
      return;
    }
    if (message.method === "Target.detachedFromTarget") {
      targetOf.delete(message.params.sessionId);
      listening.delete(message.params.sessionId);
      return;
    }
    if (!listening.has(message.sessionId)) return;
    const origin = where(message.sessionId);
    if (message.method === "Runtime.consoleAPICalled") {
      append(`[${message.params.type}] (${origin}) ${message.params.args.map(renderRemoteObject).join(" ")}`);
    } else if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      append(`[exception] (${origin}) ${details.exception?.description ?? details.text}`);
    } else if (message.method === "Log.entryAdded") {
      append(`[${message.params.entry.level}] (${origin}) ${message.params.entry.text}`);
    }
  });

  return socket;
}

/**
 * 常驻进程本体：持有浏览器直到收到 SIGTERM。
 */
async function serve(scenario, { headed, lockToken }) {
  // 浏览器驱动只在真正要开浏览器时才加载：@playwright/test 是进程级单例，被求值两次会直接抛错，
  // 而本模块的纯逻辑（scenarioDir、attachConsoleCollector）要能被 vitest 单测同进程引用。
  const { chromium } = require("@playwright/test");

  requireBuiltExtension();
  claimLock(scenario, lockToken);

  const dir = scenarioDir(scenario);
  fs.mkdirSync(dir, { recursive: true });
  const consolePath = path.join(dir, CONSOLE_LOG);
  const appendConsole = (line) => fs.appendFileSync(consolePath, `${new Date().toISOString()} ${line}\n`);

  let profile;
  let context;
  let collector;
  let session;
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    appendConsole("[session] stopping");
    fs.rmSync(sessionFile(scenario), { force: true });
    try {
      collector?.close();
      await context?.close();
    } catch {
      // 浏览器可能已被外部关闭
    }
    removeSessionArtifacts(scenario, session);
    removeLock(scenario, lockToken);
    process.exit(0);
  };
  try {
    const port = await freePort();
    profile = fs.mkdtempSync(path.join(os.tmpdir(), `sc-verify-${scenario}-`));

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
    let setup;
    try {
      setup = await launch([]);
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
    } finally {
      await setup?.close().catch(() => {});
    }

    // 阶段二：真正对外提供服务的实例，带 CDP 端口
    context = await launch([`--remote-debugging-port=${port}`]);
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

    collector = await attachConsoleCollector(port, appendConsole, () => {
      if (closing) return;
      appendConsole("[error] console collector disconnected");
      void shutdown();
    });

    session = {
      scenario,
      port,
      extensionId,
      profile,
      token: lockToken,
      headed: !!headed,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      cdp: `http://127.0.0.1:${port}`,
    };
    fs.writeFileSync(sessionFile(scenario), `${JSON.stringify(session, null, 2)}\n`);
    appendConsole(`[session] started ${headed ? "headed" : "headless"} on port ${port}, extension ${extensionId}`);

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    // 人工关掉 headed 窗口时，进程也应随之退出，不留下悬空的会话文件
    context.on("close", shutdown);
  } catch (error) {
    collector?.close();
    await context?.close().catch(() => {});
    if (profile) {
      if (isManagedProfile(profile)) fs.rmSync(profile, { recursive: true, force: true });
    }
    removeSessionArtifacts(scenario, null);
    removeLock(scenario, lockToken);
    throw error;
  }
}

async function start(scenario, { headed }) {
  requireBuiltExtension();
  validateScenario(scenario);

  const lockToken = acquireLock(scenario);
  let child;
  try {
    const existing = readSession(scenario);
    if (existing && isAlive(existing)) {
      removeLock(scenario, lockToken);
      console.log(`会话已在运行：${scenario} (pid ${existing.pid}, port ${existing.port})`);
      return;
    }
    if (existing) removeSessionArtifacts(scenario, existing);

    const dir = scenarioDir(scenario);
    const logFd = fs.openSync(path.join(dir, DAEMON_LOG), "a");
    try {
      child = spawn(
        process.execPath,
        [__filename, "__serve", scenario, `--lock-token=${lockToken}`, ...(headed ? ["--headed"] : [])],
        {
          detached: true,
          stdio: ["ignore", logFd, logFd],
        }
      );
    } finally {
      fs.closeSync(logFd);
    }
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
    throw new Error(`会话启动失败，看 ${path.relative(REPO_ROOT, path.join(dir, DAEMON_LOG))}`);
  } catch (error) {
    let childStopped = true;
    if (child?.pid) {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        // 子进程可能已经退出
      }
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && isAlive({ pid: child.pid })) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      childStopped = !isAlive({ pid: child.pid });
    }
    if (childStopped) {
      removeSessionArtifacts(scenario, readSession(scenario));
      removeLock(scenario, lockToken);
    }
    console.error(`✗ ${error.message}`);
    if (!childStopped) console.error("✗ 子进程仍在运行，保留 session/profile 以避免破坏活动会话");
    process.exit(1);
  }
}

async function stop(scenario) {
  validateScenario(scenario);
  const session = readSession(scenario);
  if (!session) {
    const lock = readJson(lockFile(scenario));
    if (lock && isAlive(lock)) {
      try {
        process.kill(lock.pid, "SIGTERM");
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
      removeLock(scenario, lock.token);
      console.log(`✓ 已停止正在启动的会话：${scenario}`);
      return;
    }
    if (lock) removeLock(scenario, lock.token);
    console.log(`没有会话：${scenario}`);
    return;
  }
  if (!isAlive(session)) {
    removeSessionArtifacts(scenario, session);
    removeLock(scenario, session.token);
    console.log(`清理了残留会话文件：${scenario}`);
    return;
  }
  try {
    process.kill(session.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && isAlive(session)) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (isAlive(session)) throw new Error(`会话未能在 20 秒内停止：${scenario}`);
  removeSessionArtifacts(scenario, session);
  removeLock(scenario, session.token);
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
      await serve(scenario, { headed, lockToken: argv.find((arg) => arg.startsWith("--lock-token="))?.slice(13) });
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
        for (const scenarioName of allSessionScenarios()) await stop(scenarioName);
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

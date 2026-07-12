/* global process */
import { promises as fs } from "fs";
import { ZipWriter } from "web-jszipp";
import ChromeExtension from "crx";
import { execSync } from "child_process";
import manifest from "../src/manifest.json" with { type: "json" };
import packageInfo from "../package.json" with { type: "json" };
import semver from "semver";
import { toChromeVersion } from "./version.js";
import {
  resolveAgentEnabled,
  applyAgentManifest,
  resolveMcpEnabled,
  applyMcpManifest,
  PACK_PROFILES,
  checkMcpPackProfileCompliance,
} from "./build-config.js";

// ============================================================================

// 目前 ScriptCat MV3 未正式支持 Firefox，
// 测试人员可修改 PACK_FIREFOX 为 true 作个人测试用途
const PACK_FIREFOX = false;

// ============================================================================

const zipMtime = new Date();

const addZipFile = async (zip, path, content) => {
  await zip.add({
    path,
    data: content,
    meta: { modifiedAt: zipMtime },
  });
};

// 打包 profile：store-stable（默认，供发布 CI 使用）| store-beta | developer（本地 pnpm pack:dev）。
// --profile 优先于 SC_PACK_PROFILE 环境变量。
const profileArgIndex = process.argv.indexOf("--profile");
const profile =
  (profileArgIndex >= 0 ? process.argv[profileArgIndex + 1] : undefined) ??
  process.env.SC_PACK_PROFILE ??
  "store-stable";
if (!PACK_PROFILES.includes(profile)) {
  throw new Error(`Unknown --profile "${profile}"; expected one of ${PACK_PROFILES.join(", ")}`);
}

// 判断是否为beta版本
const version = semver.parse(packageInfo.version);
const agentEnabled = resolveAgentEnabled({
  isBeta: version.prerelease.length > 0,
  disableEnv: process.env.SC_DISABLE_AGENT,
});
const mcpEnabled = resolveMcpEnabled({ profile, enableEnv: process.env.SC_ENABLE_MCP });
manifest.version = toChromeVersion(packageInfo.version);
if (version.prerelease.length) {
  manifest.name = `__MSG_scriptcat_beta__`;
} else {
  manifest.name = `__MSG_scriptcat__`;
}

// 处理manifest version
let str = (await fs.readFile("./src/manifest.json", { encoding: "utf8" })).toString();
str = str.replace(/"version": "(.*?)"/, `"version": "${manifest.version}"`);
await fs.writeFile("./src/manifest.json", str);

// 处理configSystem version
let configSystem = (await fs.readFile("./src/app/const.ts", { encoding: "utf8" })).toString();
// 如果是由github action的分支触发的构建,在版本中再加上commit id
if (process.env.GITHUB_REF_TYPE === "branch") {
  configSystem = configSystem.replace(
    "ExtVersion = version;",
    `ExtVersion = \`\${version}+${process.env.GITHUB_SHA.substring(0, 7)}\`;`
  );
  await fs.writeFile("./src/app/const.ts", configSystem);
}

// 将 agent/MCP 屏蔽状态传递给子构建，使打入产物的 EnableAgent/EnableMCP 与下方 manifest 处理保持一致
execSync("pnpm run build", {
  stdio: "inherit",
  env: {
    ...process.env,
    SC_DISABLE_AGENT: agentEnabled ? "false" : "true",
    SC_ENABLE_MCP: mcpEnabled ? "true" : "false",
  },
});

// logo 在 rspack.config.ts 处理

// 处理firefox和chrome的zip压缩包

// 浅拷贝防止后续修改
// Firefox 本 PR 内恒不启用 MCP（doc 01 D1 非目标；doc 06 §「Firefox support」为后续 issue）。
let firefoxManifest = applyAgentManifest({ ...manifest, background: { ...manifest.background } }, agentEnabled);
firefoxManifest = applyMcpManifest(firefoxManifest, false);
let chromeManifest = applyAgentManifest({ ...manifest, background: { ...manifest.background } }, agentEnabled);
chromeManifest = applyMcpManifest(chromeManifest, mcpEnabled);

chromeManifest.optional_permissions = chromeManifest.optional_permissions.filter((val) => val !== "userScripts");
delete chromeManifest.background.scripts;

// Firefox MV3 不支持 "background" permission
firefoxManifest.optional_permissions = firefoxManifest.optional_permissions.filter((val) => val !== "background");
delete firefoxManifest.background.service_worker;
delete firefoxManifest.sandbox;
// Firefox 的扩展消息默认即为 structured clone，该键仅 Chromium 148+ 识别
delete firefoxManifest.message_serialization;
firefoxManifest.browser_specific_settings = {
  gecko: {
    id: `{${
      version.prerelease.length ? "44ab8538-2642-46b0-8a57-3942dbc1a33b" : "8e515334-52b5-4cc5-b4e8-675d50af677d"
    }}`,
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts#browser_compatibility
    // Firefox 136 (Released 2025-03-04)
    strict_min_version: "136.0",
    data_collection_permissions: {
      required: [
        "none", // 没有必须传送至第三方的资料。安装转页没有记录用户何时何地安装了什么。
      ],
      optional: [
        "authenticationInfo", // 使用 Cloud Backup / Import 时，有传送用户的资料至第三方作登入验证
        "personallyIdentifyingInfo", // 使用 电邮 或 帐密 让第三方识别个人身份进行 Cloud Backup / Import
      ],
    },
  },
};

// 为 Firefox 添加激活工具栏按钮的快捷键
firefoxManifest.commands = {
  // mv3 的工具栏快捷键为 `_execute_action`，mv2 则是 `_execute_browser_action`
  _execute_action: {},
};

// 避免将 Chrome 特有权限添加到 Firefox 的 manifest
firefoxManifest.permissions = firefoxManifest.permissions?.filter((permission) => permission !== "background");
firefoxManifest.optional_permissions = firefoxManifest.optional_permissions?.filter(
  (permission) => permission !== "background"
);

// MCP 强断言（doc 05 §1.3, doc 08 §5）：判定逻辑在 build-config.js 里是纯函数、有单测；这里只做
// 扫描 dist 产物这一步 I/O。"com.scriptcat.native_host" 是 McpController 里的原生消息主机名字面量
// 常量——即使经过 mangle/minify，字符串字面量本身也不会被改写，因此是判断 MCP 后台代码是否被
// 编译进产物的可靠且抗压缩代理指标（这正是本次实现过程中发现并修复的 DefinePlugin 缺口所针对的
// 那段代码）。
async function scanDistForString(dir, needle) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (await scanDistForString(entryPath, needle)) return true;
    } else if (entry.name.endsWith(".js")) {
      const content = await fs.readFile(entryPath, "utf8");
      if (content.includes(needle)) return true;
    }
  }
  return false;
}

const nativeHostCompiledIn = await scanDistForString("./dist/ext", "com.scriptcat.native_host");
const mcpCompliance = checkMcpPackProfileCompliance({
  profile,
  manifest: chromeManifest,
  mcpEnabled,
  nativeHostCompiledIn,
});
if (!mcpCompliance.ok) {
  throw new Error(mcpCompliance.reason);
}

const chrome = new ZipWriter({ outputAs: "uint8array" });
const firefox = new ZipWriter({ outputAs: "uint8array" });

async function addDir(zip, localDir, toDir, filters) {
  const sub = async (localDir, toDir) => {
    const files = await fs.readdir(localDir);
    for (const file of files) {
      if (filters?.includes(file)) {
        continue;
      }
      const localPath = `${localDir}/${file}`;
      const toPath = `${toDir}${file}`;
      const stats = await fs.stat(localPath);
      if (stats.isDirectory()) {
        await sub(localPath, `${toPath}/`);
      } else {
        await addZipFile(zip, toPath, await fs.readFile(localPath));
      }
    }
  };
  await sub(localDir, toDir);
}

await addZipFile(chrome, "manifest.json", JSON.stringify(chromeManifest));
await addZipFile(firefox, "manifest.json", JSON.stringify(firefoxManifest));

await Promise.all([
  addDir(chrome, "./dist/ext", "", ["manifest.json"]),
  addDir(firefox, "./dist/ext", "", ["manifest.json"]),
]);

// 导出zip包
await fs.writeFile(`./dist/${packageInfo.name}-v${packageInfo.version}-chrome.zip`, await chrome.close());

PACK_FIREFOX &&
  (await fs.writeFile(`./dist/${packageInfo.name}-v${packageInfo.version}-firefox.zip`, await firefox.close()));

// 处理crx
const crx = new ChromeExtension({
  privateKey: await fs.readFile("./dist/scriptcat.pem", { encoding: "utf8" }),
});

await crx
  .load("./dist/ext")
  .then((crxFile) => crxFile.pack())
  .then((crxBuffer) => fs.writeFile(`./dist/${packageInfo.name}-v${packageInfo.version}-chrome.crx`, crxBuffer))
  .catch((err) => {
    console.error(err);
  });

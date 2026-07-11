/* global process */
import { promises as fs } from "fs";
import { ZipWriter } from "web-jszipp";
import ChromeExtension from "crx";
import { execSync } from "child_process";
import manifest from "../src/manifest.json" with { type: "json" };
import packageInfo from "../package.json" with { type: "json" };
import semver from "semver";
import { toChromeVersion } from "./version.js";
import { resolveAgentEnabled, applyAgentManifest } from "./build-config.js";

// ============================================================================

// ScriptCat MV3 正式支持 Firefox
const PACK_FIREFOX = true;

// ============================================================================

const zipMtime = new Date();

const addZipFile = async (zip, path, content) => {
  await zip.add({
    path,
    data: content,
    meta: { modifiedAt: zipMtime },
  });
};

// 判断是否为beta版本
const version = semver.parse(packageInfo.version);
const agentEnabled = resolveAgentEnabled({
  isBeta: version.prerelease.length > 0,
  disableEnv: process.env.SC_DISABLE_AGENT,
});
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

// 将 agent 屏蔽状态传递给子构建，使打入产物的 EnableAgent 与下方 manifest 处理保持一致
execSync("pnpm run build", {
  stdio: "inherit",
  env: { ...process.env, SC_DISABLE_AGENT: agentEnabled ? "false" : "true" },
});

// logo 在 rspack.config.ts 处理

// 处理firefox和chrome的zip压缩包

// 浅拷贝防止后续修改
const cloneManifest = () =>
  applyAgentManifest(
    {
      ...manifest,
      background: { ...manifest.background },
      content_security_policy: { ...manifest.content_security_policy },
    },
    agentEnabled
  );
const firefoxManifest = cloneManifest();
const chromeManifest = cloneManifest();

chromeManifest.optional_permissions = chromeManifest.optional_permissions.filter((val) => val !== "userScripts");
delete chromeManifest.background.scripts;
delete chromeManifest.content_security_policy.sandbox; // chromeManifest 不需要？
if (chromeManifest.content_security_policy && Object.keys(chromeManifest.content_security_policy).length === 0) {
  delete chromeManifest.content_security_policy;
}

// In Firefox, userScripts is an optional-only permission. It must appear only in optional_permissions, not both arrays.
// Firefox does not implement Chrome’s debugger extension API, so remove "debugger" from the Firefox manifest and disable any code using chrome.debugger.
// Firefox does not use Chrome’s offscreen permission/API. Your Firefox background.scripts runs in a document-based background context with a window, so DOM-related work can generally run there instead.
firefoxManifest.permissions = firefoxManifest.permissions.filter(
  (val) => val !== "userScripts" && val !== "debugger" && val !== "offscreen"
);

if (process.env.SC_KEEP_EVENT_PAGE_ACTIVE === "true") {
  // for startFirefoxEventPageKeepAliveLoop
  firefoxManifest.permissions.push("webRequestBlocking");
}

// Firefox MV3 不支持 "background" permission
firefoxManifest.optional_permissions = firefoxManifest.optional_permissions.filter((val) => val !== "background");
delete firefoxManifest.background.service_worker;

// Firefox does not support "incognito": "split". Use "spanning", or use "not_allowed" when the extension must never access private windows. Private-window access is still controlled by the Firefox user.
firefoxManifest.incognito = "spanning";

// Firefox 的扩展消息默认即为 structured clone，该键仅 Chromium 148+ 识别
delete firefoxManifest.message_serialization;
firefoxManifest.browser_specific_settings = {
  gecko: {
    id: `{${
      version.prerelease.length ? "44ab8538-2642-46b0-8a57-3942dbc1a33b" : "8e515334-52b5-4cc5-b4e8-675d50af677d"
    }}`,
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts#browser_compatibility
    // Firefox 136 (Released 2025-03-04)
    // sandbox manifest: https://phabricator.services.mozilla.com/D308216
    // Firefox 154.0a1 (Nightly Released 2026-07-07)
    strict_min_version: "154.0a1",
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

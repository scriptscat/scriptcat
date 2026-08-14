/* global process */
import { promises as fs } from "fs";
import { ZipWriter } from "web-jszipp";
import ChromeExtension from "crx";
import { execSync } from "child_process";
import manifest from "../src/manifest.json" with { type: "json" };
import packageInfo from "../package.json" with { type: "json" };
import semver from "semver";
import { toChromeVersion } from "./version.js";
import { resolveAgentEnabled, createChromeManifest, createFirefoxManifest } from "./build-config.js";

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

const chromeManifest = createChromeManifest(manifest, agentEnabled);
const firefoxManifest = createFirefoxManifest(
  manifest,
  agentEnabled,
  `{${version.prerelease.length ? "44ab8538-2642-46b0-8a57-3942dbc1a33b" : "8e515334-52b5-4cc5-b4e8-675d50af677d"}}`
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

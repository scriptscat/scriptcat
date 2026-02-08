/* global process */
import { promises as fs } from "fs";
import { createWriteStream } from "fs";
import JSZip from "jszip";
import ChromeExtension from "crx";
import { execSync } from "child_process";
import manifest from "../src/manifest.json" with { type: "json" };
import packageInfo from "../package.json" with { type: "json" };
import semver from "semver";

// ============================================================================

// 目前 ScriptCat MV3 未正式支持 Firefox，
// 测试人员可修改 PACK_FIREFOX 为 true 作个人测试用途
const PACK_FIREFOX = false;

// ============================================================================

const createJSZip = () => {
  const currDate = new Date();
  const dateWithOffset = new Date(currDate.getTime() - currDate.getTimezoneOffset() * 60000);
  // replace the default date with dateWithOffset
  JSZip.defaults.date = dateWithOffset;
  return new JSZip();
};

// 判断是否为beta版本
const version = semver.parse(packageInfo.version);
if (version.prerelease.length) {
  // 替换manifest中的版本
  let betaVersion = 1000;
  switch (version.prerelease[0]) {
    case "alpha":
      // 第一位进1
      betaVersion += parseInt(version.prerelease[1] || "0", 10) + 1 || 1;
      break;
    case "beta":
      // 第三位进1
      betaVersion += 100 * (parseInt(version.prerelease[1] || "0", 10) + 1 || 1);
      break;
    default:
      throw new Error("未知的版本类型");
  }
  manifest.version = `${version.major}.${version.minor}.${version.patch}.${betaVersion}`;
  manifest.name = `__MSG_scriptcat_beta__`;
} else {
  manifest.name = `__MSG_scriptcat__`;
  manifest.version = packageInfo.version;
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

execSync("npm run build", { stdio: "inherit" });

// logo 在 rspack.config.ts 处理

// 处理firefox和chrome的zip压缩包

// 浅拷贝防止后续修改
const firefoxManifest = { ...manifest, background: { ...manifest.background } };
const chromeManifest = { ...manifest, background: { ...manifest.background } };

chromeManifest.optional_permissions = chromeManifest.optional_permissions.filter((val) => val !== "userScripts");
delete chromeManifest.background.scripts;

delete firefoxManifest.background.service_worker;
delete firefoxManifest.sandbox;
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

const chrome = createJSZip();
const firefox = createJSZip();

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
        zip.file(toPath, await fs.readFile(localPath));
      }
    }
  };
  await sub(localDir, toDir);
}

chrome.file("manifest.json", JSON.stringify(chromeManifest));
firefox.file("manifest.json", JSON.stringify(firefoxManifest));

await Promise.all([
  addDir(chrome, "./dist/ext", "", ["manifest.json"]),
  addDir(firefox, "./dist/ext", "", ["manifest.json"]),
]);

// 导出zip包
chrome
  .generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
  })
  .pipe(createWriteStream(`./dist/${packageInfo.name}-v${packageInfo.version}-chrome.zip`));

PACK_FIREFOX &&
  firefox
    .generateNodeStream({
      type: "nodebuffer",
      streamFiles: true,
      compression: "DEFLATE",
    })
    .pipe(createWriteStream(`./dist/${packageInfo.name}-v${packageInfo.version}-firefox.zip`));

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

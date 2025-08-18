/* global process */
import { promises as fs } from "fs";
import { createWriteStream } from "fs";
import JSZip from "jszip";
import ChromeExtension from "crx";
import { execSync } from "child_process";
import manifest from "../src/manifest.json" with { type: "json" };
import packageInfo from "../package.json" with { type: "json" };
import semver from "semver";

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

// 处理firefox和chrome的zip压缩包

const firefoxManifest = { ...manifest };
const chromeManifest = { ...manifest };

delete chromeManifest.content_security_policy;
delete chromeManifest.optional_permissions;
delete chromeManifest.background.scripts;

delete firefoxManifest.sandbox;
// firefoxManifest.content_security_policy = "script-src 'self' blob:; object-src 'self' blob:";
firefoxManifest.browser_specific_settings = {
  gecko: {
    strict_min_version: "91.1.0",
  },
};

const chrome = new JSZip();
const firefox = new JSZip();

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
  addDir(firefox, "./dist/ext", "", ["manifest.json", "ts.worker.js"]),
]);
// 添加ts.worker.js名字为gz
firefox.file("src/ts.worker.js.gz", await fs.readFile("./dist/ext/src/ts.worker.js", { encoding: "utf8" }));

// 导出zip包
chrome
  .generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
  })
  .pipe(createWriteStream(`./dist/${packageInfo.name}-v${packageInfo.version}-chrome.zip`));

// firefox
//   .generateNodeStream({
//     type: "nodebuffer",
//     streamFiles: true,
//     compression: "DEFLATE",
//   })
//   .pipe(createWriteStream(`./dist/${package.name}-v${package.version}-firefox.zip`));

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

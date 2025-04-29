const fs = require("fs");
const JSZip = require("jszip");
const ChromeExtension = require("crx");
const { execSync } = require("child_process");
const semver = require("semver");
const manifest = require("../src/manifest.json");
const package = require("../package.json");

// 判断是否为beta版本
const version = semver.parse(package.version);
if (version.prerelease.length) {
  // 替换manifest中的版本
  let betaVersion = 1000;
  switch (version.prerelease[0]) {
    case "alpha":
      // 第一位进1
      betaVersion += parseInt(version.prerelease[1] || "0", 10) + 1 || 1;
      break;
    case "beta":
      // 第二位进1
      betaVersion += 10 * (parseInt(version.prerelease[1] || "0", 10) + 1 || 1);
      break;
    default:
      throw new Error("未知的版本类型");
  }
  manifest.version = `${version.major.toString()}.${version.minor.toString()}.${version.patch.toString()}.${betaVersion.toString()}`;
  manifest.name = `__MSG_scriptcat_beta__`;
} else {
  manifest.name = `__MSG_scriptcat__`;
  manifest.version = package.version;
}

// 处理manifest version
let str = fs.readFileSync("./src/manifest.json").toString();
str = str.replace(/"version": "(.*?)"/, `"version": "${manifest.version}"`);
fs.writeFileSync("./src/manifest.json", str);

// 处理configSystem version
let configSystem = fs.readFileSync("./src/app/const.ts").toString();
// 如果是由github action的分支触发的构建,在版本中再加上commit id
if (process.env.GITHUB_REF_TYPE === "branch") {
  configSystem = configSystem.replace(
    "ExtVersion = version;",
    `ExtVersion = \`\${version}+${process.env.GITHUB_SHA.substring(0, 7)}\`;`
  );
  fs.writeFileSync("./src/app/const.ts", configSystem);
}

execSync("npm run build", { stdio: "inherit" });

// 处理firefox和chrome的zip压缩包

const firefoxManifest = { ...manifest };
const chromeManifest = { ...manifest };

delete chromeManifest.content_security_policy;

delete firefoxManifest.sandbox;
// firefoxManifest.content_security_policy =
// "script-src 'self' blob:; object-src 'self' blob:";
firefoxManifest.browser_specific_settings = {
  gecko: { strict_min_version: "91.1.0" },
};

const chrome = new JSZip();
const firefox = new JSZip();

function addDir(zip, localDir, toDir, filters) {
  const files = fs.readdirSync(localDir);
  files.forEach((file) => {
    const localPath = `${localDir}/${file}`;
    const toPath = `${toDir}${file}`;
    const stats = fs.statSync(localPath);
    if (stats.isDirectory()) {
      addDir(zip, localPath, `${toPath}/`, filters);
    } else {
      if (filters && filters.includes(file)) {
        return;
      }
      zip.file(toPath, fs.readFileSync(localPath));
    }
  });
}

chrome.file("manifest.json", JSON.stringify(chromeManifest));
firefox.file("manifest.json", JSON.stringify(firefoxManifest));

addDir(chrome, "./dist/ext", "", ["manifest.json"]);
addDir(firefox, "./dist/ext", "", ["manifest.json", "ts.worker.js"]);
// 添加ts.worker.js名字为gz
firefox.file("src/ts.worker.js.gz", fs.readFileSync("./dist/ext/src/ts.worker.js"));

// 导出zip包
chrome
  .generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
  })
  .pipe(fs.createWriteStream(`./dist/${package.name}-v${package.version}-chrome.zip`));

firefox
  .generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
  })
  .pipe(fs.createWriteStream(`./dist/${package.name}-v${package.version}-firefox.zip`));

// 处理crx
const crx = new ChromeExtension({
  privateKey: fs.readFileSync("./dist/scriptcat.pem"),
});

crx
  .load("./dist/ext")
  .then((crxFile) => crxFile.pack())
  .then((crxBuffer) => {
    fs.writeFileSync(`./dist/${package.name}-v${package.version}-chrome.crx`, crxBuffer);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
  });

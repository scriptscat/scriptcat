const fs = require("fs");
const JSZip = require("jszip");
const ChromeExtension = require("crx");
const { execSync } = require("child_process");
const semver = require("semver");
const manifest = require("../src/manifest.json");
const package = require("../package.json");

// 判断是否为beta版本
const version = semver.parse(package.version);
if (version.prerelease) {
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
  manifest.name = `${manifest.name} Beta`;
}

// 处理manifest version
let str = fs.readFileSync("./src/manifest.json").toString();
str = str.replace(/"version": "(.*?)"/, `"version": "${manifest.version}"`);
fs.writeFileSync("./src/manifest.json", str);

// 处理configSystem version
let configSystem = fs.readFileSync("./src/pkg/config/config.ts").toString();
configSystem = configSystem.replace(
  /\/\* version \*\/ "(.*?)"/,
  `/* version */ "${package.version}"`
);
fs.writeFileSync("./src/pkg/config/config.ts", configSystem);

execSync("npm run build", { stdio: "inherit" });

if (version.prerelease) {
  // 替换蓝猫logo
  fs.copyFileSync("./build/assets/logo-beta.png", "./dist/ext/assets/logo.png");
}

// 处理firefox和chrome的zip压缩包

const firefoxManifest = { ...manifest };
const chromeManifest = { ...manifest };

delete firefoxManifest.sandbox;
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
addDir(firefox, "./dist/ext", "", ["manifest.json"]);

// 导出zip包
chrome
  .generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
  })
  .pipe(
    fs.createWriteStream(
      `./dist/${package.name}-v${package.version}-chrome.zip`
    )
  );

firefox
  .generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
  })
  .pipe(
    fs.createWriteStream(
      `./dist/${package.name}-v${package.version}-firefox.zip`
    )
  );

// 处理crx
const crx = new ChromeExtension({
  privateKey: fs.readFileSync("./dist/scriptcat.pem"),
});

crx
  .load("./dist/ext")
  .then((crxFile) => crxFile.pack())
  .then((crxBuffer) => {
    fs.writeFileSync(
      `./dist/${package.name}-v${package.version}-chrome.crx`,
      crxBuffer
    );
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
  });

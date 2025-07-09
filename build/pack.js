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
  manifest.name = `${manifest.name} Beta`;
} else {
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

if (version.prerelease.length || process.env.GITHUB_REF_TYPE === "branch") {
  // beta时红猫logo
  fs.copyFileSync("./build/assets/logo-beta.png", "./dist/ext/assets/logo.png");
} else {
  // 非beta时蓝猫logo
  fs.copyFileSync("./build/assets/logo.png", "./dist/ext/assets/logo.png");
}

// 处理firefox和chrome的zip压缩包

const firefoxManifest = { ...manifest };
const chromeManifest = { ...manifest };

delete chromeManifest.content_security_policy;

delete firefoxManifest.sandbox;
// firefoxManifest.content_security_policy =
// "script-src 'self' blob:; object-src 'self' blob:";
firefoxManifest.browser_specific_settings = {
  gecko: {
    id: `{${
      version.prerelease.length
        ? "44ab8538-2642-46b0-8a57-3942dbc1a33b"
        : "8e515334-52b5-4cc5-b4e8-675d50af677d"
    }}`,
    strict_min_version: "91.1.0",
  },
  update_url: `https://raw.githubusercontent.com/scriptscat/scriptcat/refs/heads/release/mv2/build/firefox-update.json`,
};

const chrome = new JSZip();

// 生成Firefox XPI文件
async function generateFirefoxXPI() {
  try {
    // eslint-disable-next-line no-console
    console.log("生成Firefox XPI文件...");

    // 确保目标目录存在Firefox manifest
    if (!fs.existsSync("./dist/firefox-ext/manifest.json")) {
      throw new Error("未找到Firefox扩展文件，请先运行构建");
    }

    const webExtCmd = `npx web-ext build --source-dir=./dist/firefox-ext --artifacts-dir=./dist --overwrite-dest`;
    
    execSync(webExtCmd, {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    // 查找生成的zip文件并重命名为xpi
    const distFiles = fs.readdirSync("./dist");
    const builtFile = distFiles.find((file) => file.endsWith(".zip") && !file.includes("chrome"));
    
    if (builtFile) {
      const newName = `${package.name}-v${package.version}-firefox.xpi`;
      fs.renameSync(`./dist/${builtFile}`, `./dist/${newName}`);
      // eslint-disable-next-line no-console
      console.log(`✅ 已生成Firefox XPI: ${newName}`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("❌ 生成XPI文件失败:", error.message);
    // eslint-disable-next-line no-console
    console.log("💡 请检查：");
    // eslint-disable-next-line no-console
    console.log("   1. 确保web-ext工具已正确安装");
    // eslint-disable-next-line no-console
    console.log("   2. 检查Firefox扩展目录是否完整");
  }
}

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

addDir(chrome, "./dist/ext", "", ["manifest.json"]);

// 为Firefox创建单独的目录
if (!fs.existsSync("./dist/firefox-ext")) {
  fs.mkdirSync("./dist/firefox-ext", { recursive: true });
}

// 将Firefox manifest写入单独的目录
fs.writeFileSync(
  "./dist/firefox-ext/manifest.json",
  JSON.stringify(firefoxManifest, null, 2)
);

// 复制其他文件到Firefox目录
function copyDirSync(src, dest, excludes = []) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const files = fs.readdirSync(src);
  files.forEach((file) => {
    if (excludes.includes(file)) return;

    const srcPath = `${src}/${file}`;
    const destPath = `${dest}/${file}`;
    const stats = fs.statSync(srcPath);

    if (stats.isDirectory()) {
      copyDirSync(srcPath, destPath, excludes);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

// 复制文件到Firefox目录（排除manifest.json和ts.worker.js）
copyDirSync("./dist/ext", "./dist/firefox-ext", [
  "manifest.json",
  "ts.worker.js",
]);

// 添加Firefox专用的ts.worker.js.gz文件
fs.copyFileSync(
  "./dist/ext/src/ts.worker.js",
  "./dist/firefox-ext/src/ts.worker.js.gz"
);

// 导出zip包 - Chrome
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

// 导出zip包 - Firefox
const firefoxZip = new JSZip();

// 读取Firefox专用目录中的所有文件
function addDirToZip(zip, localDir, toDir = "") {
  const files = fs.readdirSync(localDir);
  files.forEach((file) => {
    const localPath = `${localDir}/${file}`;
    const toPath = toDir ? `${toDir}/${file}` : file;
    const stats = fs.statSync(localPath);
    if (stats.isDirectory()) {
      addDirToZip(zip, localPath, toPath);
    } else {
      zip.file(toPath, fs.readFileSync(localPath));
    }
  });
}

// 将Firefox目录的内容添加到zip
addDirToZip(firefoxZip, "./dist/firefox-ext");

// 生成Firefox zip文件
firefoxZip
  .generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
  })
  .pipe(
    fs.createWriteStream(
      `./dist/${package.name}-v${package.version}-firefox.zip`
    )
  )
  .on("close", () => {
    // Firefox zip文件生成完成后，生成xpi文件
    generateFirefoxXPI();
  });

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

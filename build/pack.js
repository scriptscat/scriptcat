const fs = require("fs");
const AdmZip = require("adm-zip");
const ChromeExtension = require("crx");
const { execSync } = require("child_process");
const manifest = require("../src/manifest.json");
const pjson = require("../package.json");

// 处理manifest version
let str = fs.readFileSync("./src/manifest.json").toString();
str = str.replace(/"version": "(.*?)"/, `"version": "${pjson.version}"`);
fs.writeFileSync("./src/manifest.json", str);

execSync("npm run build", { stdio: "inherit" });

// 处理firefox和chrome的zip压缩包

const firefoxManifest = JSON.parse(manifest);
const chromeManifest = JSON.parse(manifest);

delete firefoxManifest.sandbox;
firefoxManifest.browser_specific_settings = {
  gecko: { strict_min_version: "91.1.0" },
};
fs.writeFileSync(
  "./dist/manifest_firefox.json",
  JSON.stringify(firefoxManifest)
);

fs.writeFileSync("./dist/manifest_chrome.json", JSON.stringify(chromeManifest));

const chrome = new AdmZip();
const firefox = new AdmZip();

chrome.addLocalFile("./dist/manifest_chrome.json", ".", "manifest.json");
chrome.addLocalFolder("./dist/ext", ".", (filename) => {
  return filename !== "manifest.json";
});

firefox.addLocalFile("./dist/manifest_firefox.json", ".", "manifest.json");
firefox.addLocalFolder("./dist/ext", ".", (filename) => {
  return filename !== "manifest.json";
});

chrome.writeZip("./dist/scriptcat.zip");
firefox.writeZip("./dist/scriptcat_firefox.zip");

// 处理crx
const crx = new ChromeExtension({
  privateKey: fs.readFileSync("./dist/scriptcat.pem"),
});

crx
  .load("./build/scriptcat")
  .then((crxFile) => crxFile.pack())
  .then((crxBuffer) => {
    fs.writeFileSync("./build/scriptcat.crx", crxBuffer);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
  });

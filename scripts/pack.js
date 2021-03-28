const fs = require("fs");
var AdmZip = require("adm-zip");
var pjson = require('../package.json');
const { execSync } = require("child_process");

let files = fs.readdirSync("./build/scriptcat/src");
files.forEach(val => {
    if (val === '.gitignore') {
        return;
    }
    fs.unlinkSync("./build/scriptcat/src/" + val);
});

execSync("npm run build");

// 处理manifest version
let jsonStr = fs.readFileSync("./build/scriptcat/manifest.json").toString();
jsonStr = jsonStr.replace(/"version": "(.*?)"/, '"version": "' + pjson.version + '"');
fs.writeFileSync("./build/scriptcat/manifest.json", jsonStr);

// 处理 ts.worker.js
let list = fs.readdirSync("./build/scriptcat/src");
let monaco = [];
for (let i = 0; i < list.length; i++) {
    if (list[i].indexOf("monaco") === 0 && list[i].substr(list[i].indexOf(".js")) === ".js") {
        monaco.push(list[i]);
    }
}

let old = fs.readFileSync("./build/scriptcat/src/ts.worker.js", "utf-8");

fs.writeFileSync(
    "./build/scriptcat/src/ts.worker.js",
    'importScripts("' + monaco.join('","') + '");\n' + old.toString(),
);

// 处理firefox和chrome的zip压缩包
jsonStr = fs.readFileSync("./build/scriptcat/manifest.json");
let jsonFirefox = JSON.parse(jsonStr);
let jsonChrome = JSON.parse(jsonStr);

delete jsonFirefox['sandbox'];
fs.writeFileSync("./build/manifest_firefox.json", JSON.stringify(jsonFirefox));

delete jsonChrome['content_security_policy'];
fs.writeFileSync("./build/manifest_chrome.json", JSON.stringify(jsonChrome));

let chrome = new AdmZip();
let firefox = new AdmZip();

chrome.addLocalFile("./build/manifest_chrome.json", ".", "manifest.json");
chrome.addLocalFolder("./build/scriptcat", ".", (filename) => {
    return filename !== "manifest.json";
});

firefox.addLocalFile("./build/manifest_firefox.json", ".", "manifest.json");
firefox.addLocalFolder("./build/scriptcat", ".", (filename) => {
    return filename !== "manifest.json";
});

chrome.writeZip("./build/scriptcat.zip");
firefox.writeZip("./build/scriptcat_firefox.zip");
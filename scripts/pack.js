const fs = require("fs");
const AdmZip = require("adm-zip");
const pjson = require('../package.json');
const ChromeExtension = require('crx');
const { execSync } = require("child_process");

// 处理manifest version
let str = fs.readFileSync("./build/scriptcat/manifest.json").toString();
str = str.replace(/"version": "(.*?)"/, '"version": "' + pjson.version + '"');
fs.writeFileSync("./build/scriptcat/manifest.json", str);

// 处理config.ts version
str = fs.readFileSync("./src/apps/config.ts").toString();
str = str.replace(/ExtVersion = "(.*?)";/, 'ExtVersion = "' + pjson.version + '";');
fs.writeFileSync("./src/apps/config.ts", str);

execSync("npm run build");

execSync("npm run build-no-split");

// 处理 ts.worker.js 和 editor.worker.js
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

old = fs.readFileSync("./build/scriptcat/src/editor.worker.js", "utf-8");

fs.writeFileSync(
    "./build/scriptcat/src/editor.worker.js",
    'importScripts("' + monaco.join('","') + '");\n' + old.toString(),
);

// 处理firefox和chrome的zip压缩包
jsonStr = fs.readFileSync("./build/scriptcat/manifest.json");
let jsonFirefox = JSON.parse(jsonStr);
let jsonChrome = JSON.parse(jsonStr);

delete jsonFirefox['sandbox'];
// delete jsonFirefox['background'];
// delete jsonFirefox['debugger'];
// jsonFirefox['content_security_policy'] = "script-src 'self' 'unsafe-eval'; object-src 'self'";
fs.writeFileSync("./build/manifest_firefox.json", JSON.stringify(jsonFirefox));

// delete jsonChrome['content_security_policy'];
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
// 处理crx
const crx = new ChromeExtension({
    privateKey: fs.readFileSync('./build/scriptcat.pem')
});

crx.load('./build/scriptcat').then((crx) => crx.pack()).then((crxBuffer) => {
    fs.writeFileSync('./build/scriptcat.crx', crxBuffer);
}).catch((err) => {
    console.error(err);
});

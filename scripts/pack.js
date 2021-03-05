const fs = require("fs");
const ChromeExtension = require("crx");
var AdmZip = require("adm-zip");
const { env } = require("process");

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
let json = fs.readFileSync("./build/scriptcat/manifest.json");
json = JSON.parse(json);
json["content_security_policy"] = "script-src 'self' 'unsafe-eval'; object-src 'self'";
fs.writeFileSync("./build/manifest_firefox.json", JSON.stringify(json));

let zip = new AdmZip();
let firefox = new AdmZip();

zip.addLocalFolder("./build/scriptcat", ".");

firefox.addLocalFile("./build/manifest_firefox.json", ".", "manifest.json");
firefox.addLocalFolder("./build/scriptcat", ".", (filename) => {
    return filename !== "manifest.json";
});

zip.writeZip("./build/scriptcat.zip");
firefox.writeZip("./build/scriptcat_firefox.zip");

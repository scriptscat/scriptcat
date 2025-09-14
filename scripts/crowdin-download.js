import { execSync } from "child_process";
import { readdirSync, statSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

console.log("Downloading translations from Crowdin...");
// 执行 crowdin download --skip-untranslated-strings
execSync("crowdin download --skip-untranslated-strings", { stdio: "inherit" });

// 将所有语言中的""删除
// 语言文件在 src/locales/*/*.json 排除zh-CN
const localesPath = "./src/locales";
console.log("Removing empty strings from locale files...");
function removeEmptyStrings(obj) {
  for (const key in obj) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      removeEmptyStrings(obj[key]);
      if (Object.keys(obj[key]).length === 0) {
        delete obj[key];
      }
    } else if (obj[key] === "") {
      delete obj[key];
    }
  }
}
function removeEmptyStringsFromLocaleFiles(dir) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory() && !filePath.includes("zh-CN")) {
      removeEmptyStringsFromLocaleFiles(filePath);
    } else if (file.endsWith(".json")) {
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      removeEmptyStrings(content);
      writeFileSync(filePath, JSON.stringify(content, null, 2));
    }
  }
}
removeEmptyStringsFromLocaleFiles(localesPath);

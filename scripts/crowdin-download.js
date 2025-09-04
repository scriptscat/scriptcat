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
function removeEmptyStringsFromLocaleFiles(dir) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory() && !filePath.includes("zh-CN")) {
      removeEmptyStringsFromLocaleFiles(filePath);
    } else if (file.endsWith(".json")) {
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      for (const key in content) {
        // 递归删除嵌套对象中的空字符串
        if (typeof content[key] === "object" && content[key] !== null) {
          for (const nestedKey in content[key]) {
            if (content[key][nestedKey] === "") {
              delete content[key][nestedKey];
            }
          }
          // 如果嵌套对象变为空对象，则删除该键
          if (Object.keys(content[key]).length === 0) {
            delete content[key];
          }
        } else if (content[key] === "") {
          delete content[key];
        }
      }
      writeFileSync(filePath, JSON.stringify(content, null, 2));
    }
  }
}
removeEmptyStringsFromLocaleFiles(localesPath);

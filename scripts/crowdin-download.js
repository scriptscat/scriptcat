import { execSync } from "child_process";
import { readdirSync, statSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// 执行 crowdin download --skip-untranslated-strings
execSync("crowdin download --skip-untranslated-strings", { stdio: "inherit" });

// 将所有语言中的""删除
// 语言文件在 src/locales/*/*.json 排除zh-CN
const localesPath = "./src/locales";
function removeEmptyStringsFromLocaleFiles(dir) {
  const files = readdirSync(dir);
  files.forEach((file) => {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory()) {
      removeEmptyStringsFromLocaleFiles(filePath);
    } else if (file.endsWith(".json") && !file.includes("zh-CN")) {
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      for (const key in content) {
        if (content[key] === "") {
          delete content[key];
        }
      }
      writeFileSync(filePath, JSON.stringify(content, null, 2));
    }
  });
}
removeEmptyStringsFromLocaleFiles(localesPath);

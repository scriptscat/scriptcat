#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * 生成changelog并处理文件内容
 */
function generateChangelog() {
  try {
    console.log("🚀 开始生成 CHANGELOG.md...");

    // 执行 npm run changlog 命令
    console.log("📝 执行 gitmoji-changelog 生成changelog...");
    execSync("gitmoji-changelog init --author=true --group-similar-commits=true", {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    console.log("✅ changelog 生成完成");

    // 读取生成的 CHANGELOG.md 文件
    const changelogPath = path.join(process.cwd(), "CHANGELOG.md");

    if (!fs.existsSync(changelogPath)) {
      console.error("❌ CHANGELOG.md 文件不存在");
      process.exit(1);
    }

    console.log("📖 读取 CHANGELOG.md 文件...");
    let content = fs.readFileSync(changelogPath, "utf8");

    // 使用正则表达式替换 (by (\w) -> (by @$1
    // 删除owner
    console.log("🔄 处理文件内容，添加 @ 符号...");
    let updatedContent = content.replaceAll(" (by 王一之)", "");
    updatedContent = updatedContent.replaceAll(" (by CodFrm)", "");
    updatedContent = updatedContent.replace(/\(by (\w)/g, "(by @$1");

    // 检查是否有内容被替换
    if (content !== updatedContent) {
      // 写回文件
      fs.writeFileSync(changelogPath, updatedContent, "utf8");
      console.log("✅ 文件内容已更新，作者名前已添加 @ 符号");
    } else {
      console.log("ℹ️  没有找到需要替换的内容");
    }

    console.log("🎉 CHANGELOG.md 处理完成！");
  } catch (error) {
    console.error("❌ 生成changelog时出错:", error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  generateChangelog();
}

module.exports = { generateChangelog };

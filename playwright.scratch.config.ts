import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// 一次性验证脚本专用配置：只发现 e2e/scratch/ 下的脚本，复用主配置其余设置。
// 用法：pnpm exec playwright test --config playwright.scratch.config.ts
// 详见 docs/verification/README.md。这些脚本已 gitignore，不进正式 E2E 套件/CI。
export default defineConfig({
  ...base,
  testDir: "./e2e/scratch",
  testIgnore: [],
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // 一次性验证脚本放在 e2e/scratch/（已 gitignore），不纳入正式 E2E 套件/CI。
  // 单跑请用 playwright.scratch.config.ts：见 docs/VERIFICATION.md。
  testIgnore: ["**/scratch/**"],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  outputDir: "test-results",
  use: {
    actionTimeout: 10_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Video encoding runs a background codec thread for every test even when not retained.
    // Disable locally; keep for CI where artifact retention matters.
    video: process.env.CI ? "retain-on-failure" : "off",
    permissions: ["clipboard-read", "clipboard-write"],
  },
});

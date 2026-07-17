import path from "path";
import fs from "fs";
import { defineConfig } from "vitest/config";

const alias = {
  "@App": path.resolve(__dirname, "./src"),
  "@Packages": path.resolve(__dirname, "./packages"),
  "@Tests": path.resolve(__dirname, "./tests"),
  "monaco-editor": path.resolve(__dirname, "./tests/mocks/monaco-editor.ts"),
};

const tplPlugin = {
  name: "handle-tpl-files",
  load(id: string) {
    if (!id.endsWith(".tpl")) return;

    const content = fs.readFileSync(id, "utf-8");
    return `export default ${JSON.stringify(content)};`;
  },
};

// Files that need a fresh module environment per file (cannot share isolate:false).
// Reasons:
//   - web-jszipp（vmThreads 的 VM 上下文没有 TransformStream）：backup.test.ts、skill-zip.test.ts
//   - module-level sharedInitCopy captured against wrong window: create_context.test.ts
//   - 沙盒断言依赖 vmThreads 中不可用的原生 happy-dom Window 语义：exec_script.test.ts
const ISOLATED = [
  "src/pkg/backup/backup.test.ts",
  "src/pkg/utils/skill-zip.test.ts",
  "src/app/service/content/create_context.test.ts",
  "src/app/service/content/exec_script.test.ts",
];

const BASE_EXCLUDE = ["**/node_modules/**", "**/.claude/**", "e2e/**"];

// 页面层（React 渲染，含 .ts 的 renderHook 测试）用例的真实 solo 成本在覆盖率下可达 100–200ms，
// 乘上 worker 并行负载后 340ms 预算必然偶发超时（本地满载观测峰值 ~630ms）；
// 按工作负载分类给预算：UI 850，非 UI 保持 340。按目录而非扩展名分类，避免 .ts hook 测试漏网。
const UI_TESTS = ["src/pages/**/*.test.ts", "src/pages/**/*.test.tsx"];

const sharedTest = {
  environment: "happy-dom" as const,
  setupFiles: ["./tests/vitest.setup.ts"],
  env: {
    VI_TESTING: "true",
    SC_RANDOM_KEY: "005a7deb-3a6e-4337-83ea-b9626c02ea38",
  },
};

export default defineConfig({
  resolve: { alias },
  plugins: [tplPlugin],

  test: {
    // 不启用 experimental.fsModuleCache：其缓存（node_modules/.experimental-vitest-cache）在依赖
    // 变更（如 pnpm patch/install）后不失效，会产生按「路径+内容哈希」键控的确定性挂死；
    // CI 冷缓存永不复现，只坑本地。曾致 Logger/hooks、confirm/App 三例挂死，
    // 唯一解法是 vitest --clearCache。
    projects: [
      {
        resolve: { alias },
        plugins: [tplPlugin],
        test: {
          name: "fast",
          exclude: [...BASE_EXCLUDE, ...ISOLATED, ...UI_TESTS],
          ...sharedTest,
          pool: "vmThreads",
          isolate: false,
          maxWorkers: "75%",
          testTimeout: 340,
          sequence: {
            groupOrder: 0,
          },
        },
      },
      {
        resolve: { alias },
        plugins: [tplPlugin],
        test: {
          name: "ui",
          include: UI_TESTS,
          exclude: BASE_EXCLUDE,
          ...sharedTest,
          pool: "vmThreads",
          isolate: false,
          maxWorkers: "75%",
          testTimeout: 850,
          sequence: {
            groupOrder: 0,
          },
        },
      },
      {
        resolve: { alias },
        plugins: [tplPlugin],
        test: {
          name: "isolated",
          include: ISOLATED,
          exclude: BASE_EXCLUDE,
          ...sharedTest,
          pool: "threads",
          isolate: true,
          maxWorkers: "50%",
          testTimeout: 340,
          sequence: {
            groupOrder: 1,
          },
        },
      },
    ],
  },
});

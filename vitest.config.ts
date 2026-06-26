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
    experimental: {
      fsModuleCache: true,
    },

    projects: [
      {
        resolve: { alias },
        plugins: [tplPlugin],
        test: {
          name: "fast",
          exclude: [...BASE_EXCLUDE, ...ISOLATED],
          ...sharedTest,
          pool: "vmThreads",
          isolate: false,
          maxWorkers: "75%",
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
          sequence: {
            groupOrder: 1,
          },
        },
      },
    ],
  },
});

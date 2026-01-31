import path from "path";
import fs from "fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@App": path.resolve(__dirname, "./src"),
      "@Packages": path.resolve(__dirname, "./packages"),
      "@Tests": path.resolve(__dirname, "./tests"),
      "monaco-editor": path.resolve(__dirname, "./tests/mocks/monaco-editor.ts"),
    },
  },
  plugins: [
    {
      name: "handle-tpl-files",
      load(id) {
        if (id.endsWith(".tpl")) {
          // Return the content as a string asset
          const content = fs.readFileSync(id, "utf-8");
          return `export default ${JSON.stringify(content)};`;
        }
      },
    },
  ],
  test: {
    environment: "jsdom",
    // List setup file
    setupFiles: ["./tests/vitest.setup.ts"],
    env: {
      VI_TESTING: "true",
      SC_RANDOM_KEY: "005a7deb-3a6e-4337-83ea-b9626c02ea38",
    },
  },
});

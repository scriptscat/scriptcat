import path from "path";
import { defineConfig } from "vitest/config";
import CustomSequencer from "./tests/vitest.CustomSequencer.ts";

export default defineConfig({
  resolve: {
    alias: {
      "@App": path.resolve(__dirname, "./src"),
      "@Packages": path.resolve(__dirname, "./packages"),
      "@Tests": path.resolve(__dirname, "./tests"),
      "monaco-editor": path.resolve(__dirname, "./tests/mocks/monaco-editor.ts"),
    },
  },
  test: {
    environment: "jsdom",
    // List setup file
    setupFiles: ["./tests/vitest.setup.ts"],
    env: {
      VI_TESTING: "true",
    },
    sequence: {
      sequencer: CustomSequencer,
    },
  },
});

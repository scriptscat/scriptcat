import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@App": path.resolve(__dirname, "./src"),
      "@Packages": path.resolve(__dirname, "./packages"),
      "@Tests": path.resolve(__dirname, "./tests"),
    },
  },
  test: {
    environment: "jsdom",
    // List setup file
    setupFiles: ["./tests/vitest.setup.ts"],
  },
});

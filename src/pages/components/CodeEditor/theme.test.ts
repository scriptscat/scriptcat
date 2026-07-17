import { describe, it, expect } from "vitest";
import { resolveMonacoTheme } from "./theme";

describe("resolveMonacoTheme", () => {
  it("dark 应映射到 vs-dark", () => {
    expect(resolveMonacoTheme("dark")).toBe("vs-dark");
  });

  it("light 应映射到 vs", () => {
    expect(resolveMonacoTheme("light")).toBe("vs");
  });
});

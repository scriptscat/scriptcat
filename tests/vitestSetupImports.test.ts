import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Vitest setup imports", () => {
  it("keeps global setup on the lightweight test-env helper", () => {
    const setup = readFileSync(resolve(process.cwd(), "tests/vitest.setup.ts"), "utf8");
    expect(setup).toContain('from "./initTestEnv"');
    expect(setup).not.toContain('from "./utils"');
    expect(setup).not.toContain("@App/app/service");
    expect(setup).not.toContain("@App/pages/store");
  });
});

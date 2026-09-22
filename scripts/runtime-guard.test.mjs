import { describe, expect, it } from "vitest";
import { classifyChangedPaths, parsePrePushRefs, shouldBlockGuardFailure } from "./runtime-guard.mjs";

describe("runtime guard path classification", () => {
  it("skips documentation-only changes", () => {
    expect(classifyChangedPaths(["README.md", "docs/develop.md", "LICENSE"])).toBe("skip");
  });

  it("runs static checks for test-only changes", () => {
    expect(classifyChangedPaths(["src/app/service/content/utils.test.ts", "tests/helper.test.mjs"])).toBe("fast");
  });

  it("runs the full guard for runtime, build, CI, and unknown changes", () => {
    expect(classifyChangedPaths(["src/app/service/content/utils.ts"])).toBe("full");
    expect(classifyChangedPaths(["rspack-plugins/ZipExecutionPlugin.ts"])).toBe("full");
    expect(classifyChangedPaths([".github/workflows/test.yaml"])).toBe("full");
    expect(classifyChangedPaths(["e2e/runtime-bootstrap.spec.ts"])).toBe("full");
    expect(classifyChangedPaths(["unknown-config.ini"])).toBe("full");
  });

  it("treats a mixed documentation and executable change as full", () => {
    expect(classifyChangedPaths(["docs/develop.md", "package.json"])).toBe("full");
  });
});

describe("pre-push ref parsing", () => {
  it("parses all refs from one hook invocation", () => {
    expect(
      parsePrePushRefs(
        "refs/heads/feature 1111111111111111111111111111111111111111 refs/heads/feature 2222222222222222222222222222222222222222\n" +
          "refs/tags/v1 3333333333333333333333333333333333333333 refs/tags/v1 4444444444444444444444444444444444444444\n"
      )
    ).toHaveLength(2);
  });

  it("rejects malformed ref input so the hook can fail closed", () => {
    expect(() => parsePrePushRefs("refs/heads/feature only-three-fields")).toThrow("invalid pre-push ref input");
  });
});

describe("pre-push guard failure policy", () => {
  it("blocks obvious code failures", () => {
    expect(shouldBlockGuardFailure("static", "src/foo.ts:1:1 - error TS2322: type mismatch")).toBe(true);
    expect(shouldBlockGuardFailure("static", "AssertionError: expected value to be true")).toBe(true);
    expect(shouldBlockGuardFailure("static", "Test Files 1 failed\nnetwork rule assertion failed")).toBe(true);
    expect(shouldBlockGuardFailure("e2e", "Error: expect(locator).toHaveAttribute failed")).toBe(true);
  });

  it("allows local tool and browser environment failures", () => {
    expect(shouldBlockGuardFailure("static", "spawnSync pnpm ENOENT")).toBe(false);
    expect(shouldBlockGuardFailure("e2e", "thermal_state_observer_mac.mm:140 SIGTRAP")).toBe(false);
    expect(
      shouldBlockGuardFailure(
        "e2e",
        "browserType.launchPersistentContext: Target page, context or browser has been closed"
      )
    ).toBe(false);
  });
});

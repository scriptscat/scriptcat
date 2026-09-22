import { describe, expect, it } from "vitest";
import { classifyChangedPaths, parsePrePushRefs } from "./runtime-guard.mjs";

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

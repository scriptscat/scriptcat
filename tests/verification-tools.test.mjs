import { describe, expect, it } from "vitest";
import { scenarioDir } from "../e2e/session.mjs";

describe("verification session paths", () => {
  it("rejects scenario names that escape the scratch directory", () => {
    expect(() => scenarioDir("../outside")).toThrow(/scenario/i);
  });
});

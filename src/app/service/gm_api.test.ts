import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initTestEnv } from "@Tests/utils";

initTestEnv();
// serviceWorker环境

beforeAll(() => {});

describe("GM xhr", () => {
  beforeEach(() => {
    // See https://webext-core.aklinker1.io/fake-browser/reseting-state
  });
  it("123123", async () => {
    expect(1).toBe(1);
  });
});

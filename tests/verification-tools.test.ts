import { describe, expect, it } from "vitest";
import { headlessArgs } from "../e2e/launch-args";

describe("headlessArgs", () => {
  it.each([undefined, "", "0", "false", "no"])("keeps %j headless", (value) => {
    expect(headlessArgs(value)).toEqual(["--headless=new"]);
  });

  it.each(["1", "true", "yes"])("enables headed mode for %j", (value) => {
    expect(headlessArgs(value)).toEqual([]);
  });
});

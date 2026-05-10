import { describe, expect, it } from "vitest";
import { buildConditionalHeaders, buildExpectedHeaders } from "./utils";

describe("filesystem utils", () => {
  it("buildConditionalHeaders should prefer createOnly over expected tokens", () => {
    expect(buildConditionalHeaders({ createOnly: true, expectedVersion: "etag-1" })).toEqual({
      "If-None-Match": "*",
    });
  });

  it("buildConditionalHeaders should use expectedVersion before expectedDigest", () => {
    expect(buildConditionalHeaders({ expectedVersion: "version-1", expectedDigest: "digest-1" })).toEqual({
      "If-Match": "version-1",
    });
  });

  it("buildConditionalHeaders should use expectedDigest when version is absent", () => {
    expect(buildConditionalHeaders({ expectedDigest: "digest-1" })).toEqual({
      "If-Match": "digest-1",
    });
  });

  it("buildConditionalHeaders should return no headers without conditions", () => {
    expect(buildConditionalHeaders()).toEqual({});
  });

  it("buildExpectedHeaders should use expectedVersion before expectedDigest", () => {
    expect(buildExpectedHeaders({ expectedVersion: "version-1", expectedDigest: "digest-1" })).toEqual({
      "If-Match": "version-1",
    });
  });

  it("buildExpectedHeaders should return no headers without expected tokens", () => {
    expect(buildExpectedHeaders()).toEqual({});
  });
});

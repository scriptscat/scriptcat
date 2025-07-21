import { describe, it, expect } from "vitest";
import { parseUrlSRI } from "./utils";

describe("parseUrlSRI", () => {
  it("should parse URL SRI", () => {
    const url = "https://example.com/script.js#sha256=AbC123==";
    const result = parseUrlSRI(url);
    expect(result.url).toEqual("https://example.com/script.js");
    expect(result.hash).toEqual({ sha256: "AbC123==" });
    const url2 = "https://example.com/script.js#md5=AbCd";
    const result2 = parseUrlSRI(url2);
    expect(result2.url).toEqual("https://example.com/script.js");
    expect(result2.hash).toEqual({ md5: "AbCd" });
  });
  it("多个哈希值", () => {
    const url = "https://example.com/script.js#sha256=abc123==&sha512=def456==";
    const result = parseUrlSRI(url);
    expect(result.url).toEqual("https://example.com/script.js");
    expect(result.hash).toEqual({ sha256: "abc123==", sha512: "def456==" });
    const url2 = "https://example.com/script.js#sha256=abcd123&md5=abcd";
    const result2 = parseUrlSRI(url2);
    expect(result2.url).toEqual("https://example.com/script.js");
    expect(result2.hash).toEqual({ sha256: "abcd123", md5: "abcd" });
  });
  it("没有哈希值", () => {
    const url = "https://example.com/script.js";
    const result = parseUrlSRI(url);
    expect(result.url).toEqual("https://example.com/script.js");
    expect(result.hash).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { parseUrlSRI } from "./utils";

describe("parseUrlSRI", () => {
  it("should parse URL SRI", () => {
    const url1 = "https://example.com/script.js#sha256=AbC123==";
    const result1 = parseUrlSRI(url1);
    expect(result1.url).toEqual("https://example.com/script.js");
    expect(result1.hash).toEqual({ sha256: "AbC123==" });
    const url2 = "https://example.com/script.js#md5=AbCd";
    const result2 = parseUrlSRI(url2);
    expect(result2.url).toEqual("https://example.com/script.js");
    expect(result2.hash).toEqual({ md5: "AbCd" });

    const url3 = "https://example.com/script.js#sha256-AbC123==";
    const result3 = parseUrlSRI(url3);
    expect(result3.url).toEqual("https://example.com/script.js");
    expect(result3.hash).toEqual({ sha256: "AbC123==" });
    const url4 = "https://example.com/script.js#md5-AbCd";
    const result4 = parseUrlSRI(url4);
    expect(result4.url).toEqual("https://example.com/script.js");
    expect(result4.hash).toEqual({ md5: "AbCd" });
  });
  it("多个哈希值", () => {
    const url1 = "https://example.com/script.js#sha256=abc123==,sha512=def456==";
    const result1 = parseUrlSRI(url1);
    expect(result1.url).toEqual("https://example.com/script.js");
    expect(result1.hash).toEqual({ sha256: "abc123==", sha512: "def456==" });
    const url2 = "https://example.com/script.js#sha256=abcd123;md5=abcd";
    const result2 = parseUrlSRI(url2);
    expect(result2.url).toEqual("https://example.com/script.js");
    expect(result2.hash).toEqual({ sha256: "abcd123", md5: "abcd" });

    const url3 = "https://example.com/script.js#sha256-abc123==,sha512-def456==";
    const result3 = parseUrlSRI(url3);
    expect(result3.url).toEqual("https://example.com/script.js");
    expect(result3.hash).toEqual({ sha256: "abc123==", sha512: "def456==" });
    const url4 = "https://example.com/script.js#sha256-abcd123,md5-abcd";
    const result4 = parseUrlSRI(url4);
    expect(result4.url).toEqual("https://example.com/script.js");
    expect(result4.hash).toEqual({ sha256: "abcd123", md5: "abcd" });
  });
  it("没有哈希值", () => {
    const url = "https://example.com/script.js";
    const result = parseUrlSRI(url);
    expect(result.url).toEqual("https://example.com/script.js");
    expect(result.hash).toBeUndefined();
  });
  it("不规则的SRI", () => {
    const url = "https://example.com/script.js#sha256";
    const result = parseUrlSRI(url);
    expect(result.url).toEqual("https://example.com/script.js");
    expect(result.hash).toEqual({});
    const url2 = "https://example.com/script.js#sha256=abc123==,md5";
    const result2 = parseUrlSRI(url2);
    expect(result2.url).toEqual("https://example.com/script.js");
    expect(result2.hash).toEqual({ sha256: "abc123==" });
  });
});

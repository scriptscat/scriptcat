import { describe, it, expect } from "vitest";
import { parseUrlSRI } from "./utils";

describe("parseUrlSRI", () => {
  it("should parse URL SRI", () => {
    const sha512b64 = "Pa4Jto+LuCGBHy2/POQEbTh0reuoiEXQWXGn8S7aRlhcwpVkO8+4uoZVSOqUjdCsE+77oygfu2Tl+7qGHGIWsw==";
    const url1 = `https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.0/jquery.min.js#sha512=${sha512b64}`;
    const result1 = parseUrlSRI(url1);
    expect(result1.url).toEqual("https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.0/jquery.min.js");
    expect(result1.hash).toEqual({ sha512: sha512b64 });
    const url2 = "https://example.com/script.js#md5=AbCd";
    const result2 = parseUrlSRI(url2);
    expect(result2.url).toEqual("https://example.com/script.js");
    expect(result2.hash).toEqual({ md5: "AbCd" });

    const url3 = `https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.0/jquery.min.js#sha512-${sha512b64}`;
    const result3 = parseUrlSRI(url3);
    expect(result3.url).toEqual("https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.0/jquery.min.js");
    expect(result3.hash).toEqual({ sha512: sha512b64 });
    const url4 = "https://example.com/script.js#md5-AbCd";
    const result4 = parseUrlSRI(url4);
    expect(result4.url).toEqual("https://example.com/script.js");
    expect(result4.hash).toEqual({ md5: "AbCd" });
  });
  it("多个哈希值", () => {
    const sha512b64 = "zKeerWHHuP3ar7kX2WKBSENzb+GJytFSBL6HrR2nPSR1kOX1qjm+oHooQtbDpDBSITgyl7QXZApvDfDWvKjkUw==";
    const sha384b64 = "7qAoOXltbVP82dhxHAUje59V5r2YsVfBafyUDxEdApLPmcdhBPg1DKg1ERo0BZlK";
    const sha256hex = "95e979ec98a6d7f096e08d621246877b12bf27d87f6519de78e44a890b8d3888";
    const md5hex = "20780829333b37d19f72573fddec1bbe";
    const url1 = `https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js#sha384=${sha384b64},sha512=${sha512b64}`;
    const result1 = parseUrlSRI(url1);
    expect(result1.url).toEqual("https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js");
    expect(result1.hash).toEqual({ sha384: sha384b64, sha512: sha512b64 });
    const url2 = `https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js#sha256=${sha256hex};md5=${md5hex}`;
    const result2 = parseUrlSRI(url2);
    expect(result2.url).toEqual("https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js");
    expect(result2.hash).toEqual({ sha256: sha256hex, md5: md5hex });

    const url3 = `https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js#sha384-${sha384b64},sha512-${sha512b64}`;
    const result3 = parseUrlSRI(url3);
    expect(result3.url).toEqual("https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js");
    expect(result3.hash).toEqual({ sha384: sha384b64, sha512: sha512b64 });
    const url4 = `https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js#sha256-${sha256hex},md5-${md5hex}`;
    const result4 = parseUrlSRI(url4);
    expect(result4.url).toEqual("https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js");
    expect(result4.hash).toEqual({ sha256: sha256hex, md5: md5hex });
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
    const sha256b64 = "lel57Jim1/CW4I1iEkaHexK/J9h/ZRneeORKiQuNOIg=";
    const url3 = `https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js#sha256=${sha256b64},md5`;
    const result3 = parseUrlSRI(url3);
    expect(result3.url).toEqual("https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.min.js");
    expect(result3.hash).toEqual({ sha256: sha256b64 });
  });
});

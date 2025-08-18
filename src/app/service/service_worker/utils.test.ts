import { describe, it, expect } from "vitest";
import { isBase64, parseUrlSRI } from "./utils";

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

describe("isBase64", () => {
  it("should return true for valid base64 strings", () => {
    expect(isBase64("dGVzdA==")).toBe(true);
    expect(isBase64("7qAoOXltbVP82dhxHAUje59V5r2YsVfBafyUDxEdApLPmcdhBPg1DKg1ERo0BZlK")).toBe(true);
    expect(isBase64("zKeerWHHuP3ar7kX2WKBSENzb+GJytFSBL6HrR2nPSR1kOX1qjm+oHooQtbDpDBSITgyl7QXZApvDfDWvKjkUw==")).toBe(
      true
    );
  });

  it("should return false for invalid base64 strings", () => {
    expect(isBase64("invalid_base64")).toBe(false);
    expect(isBase64("12345")).toBe(false);
    expect(isBase64("c4ca4238a0b923820dcc509a6f75849b")).toBe(false);
    expect(isBase64("356a192b7913b04c54574d18c28d46e6395428ab")).toBe(false);
    expect(isBase64("DaC17f958d2ee523a2206206994597c13D831eC7")).toBe(false);
    expect(isBase64("6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b")).toBe(false);
    expect(
      isBase64("47f05d367b0c32e438fb63e6cf4a5f35c2aa2f90dc7543f8a41a0f95ce8a40a313ab5cf36134a2068c4c969cb50db776")
    ).toBe(false);
    expect(
      isBase64(
        "4dff4ea340f0a823f15d3f4f01ab62eae0e5da579ccb851f8db9dfe84c58b2b37b89903a740e1ee172da793a6e79d560e5f7f9bd058a12a280433ed6fa46510a"
      )
    ).toBe(false);
    expect(isBase64("")).toBe(false);
  });
});

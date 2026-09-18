import { describe, it, expect } from "vitest";
import { catApiDocHref, metadataDocHref } from "./compat_docs";

describe("兼容性标记的文档地址", () => {
  it("文档有对应小节的指令链到该小节，大小写不敏感", () => {
    expect(metadataDocHref("run-at")).toBe("https://docs.scriptcat.org/docs/dev/meta#run-at");
    expect(metadataDocHref("storageName")).toBe("https://docs.scriptcat.org/docs/dev/meta#storagename-");
    expect(metadataDocHref("early-start")).toBe("https://docs.scriptcat.org/docs/dev/meta#early-start-v110");
  });

  it("文档里没有小节的指令不给地址", () => {
    expect(metadataDocHref("unwrap")).toBeUndefined();
    expect(metadataDocHref("exclude-match")).toBeUndefined();
  });

  it("CAT 能力只链文档里写了的那几个", () => {
    expect(catApiDocHref("CAT_userConfig")).toBe("https://docs.scriptcat.org/docs/dev/cat-api#cat_userconfig");
    expect(catApiDocHref("CAT_createBlobUrl")).toBeUndefined();
  });
});

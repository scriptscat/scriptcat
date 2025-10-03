import { describe, expect, it } from "vitest";
import { parseTags } from "./metadata";
import type { SCMetadata } from "./metadata";

describe("parseTags", () => {
  it("解析tags", () => {
    // 过滤空标签和去除重复
    const metadata: SCMetadata = {
      tag: [
        "tag1,tag2 tag3",
        "tag4，tag5",
        " tag6 , tag7 ，",
        "tag1", // 重复
        "", // 空字符串
        "  tag8  ,  tag9  ", // 空白字符
      ],
    };
    expect(parseTags(metadata)).toEqual(["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9"]);
  });
});

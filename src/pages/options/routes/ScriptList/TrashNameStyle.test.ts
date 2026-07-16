import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const readComponent = (name: string) => fs.readFileSync(path.resolve(__dirname, name), "utf8");

describe("回收站脚本名称样式", () => {
  it.each(["TrashTable.tsx", "TrashCardGrid.tsx"])("%s 中的脚本名称不应使用删除线", (name) => {
    expect(readComponent(name)).not.toContain("line-through");
  });
});

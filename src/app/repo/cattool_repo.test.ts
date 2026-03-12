import { describe, it, expect } from "vitest";
import { CATToolRepo } from "./cattool_repo";

describe("CATToolRepo.sanitizeName", () => {
  it("普通名称应保持不变", () => {
    expect(CATToolRepo.sanitizeName("weather")).toBe("weather");
    expect(CATToolRepo.sanitizeName("hello_world")).toBe("hello_world");
    expect(CATToolRepo.sanitizeName("my-tool")).toBe("my-tool");
  });

  it("应过滤正斜杠", () => {
    expect(CATToolRepo.sanitizeName("a/b")).toBe("a_b");
  });

  it("应过滤反斜杠", () => {
    expect(CATToolRepo.sanitizeName("a\\b")).toBe("a_b");
  });

  it("应过滤点号防止路径穿越", () => {
    expect(CATToolRepo.sanitizeName("..")).toBe("__");
    expect(CATToolRepo.sanitizeName("../..")).toBe("_____");
    expect(CATToolRepo.sanitizeName("a.b")).toBe("a_b");
  });

  it("应过滤 Windows 特殊字符", () => {
    expect(CATToolRepo.sanitizeName('a:b*c?"d<e>f|g')).toBe("a_b_c__d_e_f_g");
  });

  it("空字符串应返回空字符串", () => {
    expect(CATToolRepo.sanitizeName("")).toBe("");
  });

  it("中文名称应保持不变", () => {
    expect(CATToolRepo.sanitizeName("天气查询")).toBe("天气查询");
  });

  it("不同名称可能映射到相同的文件名（碰撞）", () => {
    // "a.b" 和 "a/b" 都映射为 "a_b"，文档化此行为
    expect(CATToolRepo.sanitizeName("a.b")).toBe("a_b");
    expect(CATToolRepo.sanitizeName("a/b")).toBe("a_b");
    expect(CATToolRepo.sanitizeName("a\\b")).toBe("a_b");
    expect(CATToolRepo.sanitizeName("a:b")).toBe("a_b");
    // 所有这些都碰撞到同一个文件名
    expect(CATToolRepo.sanitizeName("a.b")).toBe(CATToolRepo.sanitizeName("a/b"));
  });
});

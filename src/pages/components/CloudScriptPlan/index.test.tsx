// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { cloudDefaultParams } from "./index";

describe("云端导出默认参数 cloudDefaultParams", () => {
  it("从 metadata 读取 exportvalue / exportcookie", () => {
    expect(cloudDefaultParams({ metadata: { exportvalue: ["return v"], exportcookie: ["return c"] } } as any)).toEqual({
      exportValue: "return v",
      exportCookie: "return c",
    });
  });

  it("metadata 缺失时回退为空串", () => {
    expect(cloudDefaultParams({ metadata: {} } as any)).toEqual({ exportValue: "", exportCookie: "" });
  });
});

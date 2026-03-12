import { describe, expect, it } from "vitest";
import { parseCATToolMetadata, catToolToToolDefinition, getCATToolBody } from "./cattool";

describe("parseCATToolMetadata", () => {
  it("应正确解析完整的 CATTool 元数据", () => {
    const code = `
// ==CATTool==
// @name        weather
// @description 查询天气信息
// @param       city string [required] 城市名称
// @param       unit string[celsius,fahrenheit] 温度单位
// @grant       GM.xmlHttpRequest
// ==/CATTool==

const result = await GM.xmlHttpRequest({ url: "https://api.weather.com/" + args.city });
return result;
`;
    const meta = parseCATToolMetadata(code);
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe("weather");
    expect(meta!.description).toBe("查询天气信息");
    expect(meta!.params).toHaveLength(2);

    expect(meta!.params[0]).toEqual({
      name: "city",
      type: "string",
      required: true,
      description: "城市名称",
    });

    expect(meta!.params[1]).toEqual({
      name: "unit",
      type: "string",
      required: false,
      description: "温度单位",
      enum: ["celsius", "fahrenheit"],
    });

    expect(meta!.grants).toEqual(["GM.xmlHttpRequest"]);
  });

  it("没有 ==CATTool== 头时返回 null", () => {
    const code = `console.log("hello");`;
    expect(parseCATToolMetadata(code)).toBeNull();
  });

  it("缺少 @name 时返回 null", () => {
    const code = `
// ==CATTool==
// @description 没有名字的工具
// ==/CATTool==
return "test";
`;
    expect(parseCATToolMetadata(code)).toBeNull();
  });

  it("应正确解析 number 和 boolean 类型参数", () => {
    const code = `
// ==CATTool==
// @name        calc
// @description 计算器
// @param       value number [required] 输入值
// @param       verbose boolean 是否输出详细信息
// ==/CATTool==
return args.value * 2;
`;
    const meta = parseCATToolMetadata(code)!;
    expect(meta.params[0].type).toBe("number");
    expect(meta.params[0].required).toBe(true);
    expect(meta.params[1].type).toBe("boolean");
    expect(meta.params[1].required).toBe(false);
  });

  it("应正确解析无参数的工具", () => {
    const code = `
// ==CATTool==
// @name        ping
// @description 测试连通性
// ==/CATTool==
return "pong";
`;
    const meta = parseCATToolMetadata(code)!;
    expect(meta.name).toBe("ping");
    expect(meta.params).toHaveLength(0);
    expect(meta.grants).toHaveLength(0);
  });
});

describe("catToolToToolDefinition", () => {
  it("应正确生成 JSON Schema 格式的 ToolDefinition", () => {
    const def = catToolToToolDefinition({
      name: "weather",
      description: "查询天气",
      params: [
        { name: "city", type: "string", required: true, description: "城市" },
        { name: "unit", type: "string", required: false, description: "单位", enum: ["c", "f"] },
      ],
      grants: [],
    });

    expect(def.name).toBe("weather");
    expect(def.description).toBe("查询天气");
    expect(def.parameters).toEqual({
      type: "object",
      properties: {
        city: { type: "string", description: "城市" },
        unit: { type: "string", description: "单位", enum: ["c", "f"] },
      },
      required: ["city"],
    });
  });

  it("无 required 参数时不包含 required 字段", () => {
    const def = catToolToToolDefinition({
      name: "test",
      description: "test",
      params: [{ name: "x", type: "number", required: false, description: "x" }],
      grants: [],
    });

    expect(def.parameters).not.toHaveProperty("required");
  });
});

describe("getCATToolBody", () => {
  it("应正确去掉元数据头返回脚本体", () => {
    const code = `// ==CATTool==
// @name test
// ==/CATTool==
const x = 1;
return x;`;
    const body = getCATToolBody(code);
    expect(body).toBe("const x = 1;\nreturn x;");
  });
});

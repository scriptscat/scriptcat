import { describe, expect, it } from "vitest";
import { parseCATToolMetadata, catToolToToolDefinition, getCATToolBody, prefixToolDefinition } from "./cattool";

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

  it("应正确解析多个 @grant", () => {
    const code = `
// ==CATTool==
// @name        multi_grant
// @description 多个 grant
// @grant       GM.xmlHttpRequest
// @grant       GM.getValue
// @grant       GM.setValue
// ==/CATTool==
return "ok";
`;
    const meta = parseCATToolMetadata(code)!;
    expect(meta.grants).toEqual(["GM.xmlHttpRequest", "GM.getValue", "GM.setValue"]);
  });

  it("空 @grant 值不应加入列表", () => {
    const code = `
// ==CATTool==
// @name        empty_grant
// @description 测试
// @grant
// ==/CATTool==
return "ok";
`;
    const meta = parseCATToolMetadata(code)!;
    expect(meta.grants).toHaveLength(0);
  });

  it("@param 带空 enum 括号时不应生成 enum 字段", () => {
    const code = `
// ==CATTool==
// @name        test
// @param       mode string[] 模式
// ==/CATTool==
return "ok";
`;
    const meta = parseCATToolMetadata(code)!;
    expect(meta.params[0].enum).toBeUndefined();
  });

  it("@param enum 中的空格应被 trim", () => {
    const code = `
// ==CATTool==
// @name        test
// @param       color string[red , green , blue] 颜色选择
// ==/CATTool==
return "ok";
`;
    const meta = parseCATToolMetadata(code)!;
    expect(meta.params[0].enum).toEqual(["red", "green", "blue"]);
  });

  it("无效的参数类型应被忽略", () => {
    const code = `
// ==CATTool==
// @name        test
// @param       data object 数据
// @param       valid string 有效参数
// ==/CATTool==
return "ok";
`;
    const meta = parseCATToolMetadata(code)!;
    // "object" 不是有效类型，应被忽略
    expect(meta.params).toHaveLength(1);
    expect(meta.params[0].name).toBe("valid");
  });

  it("仅有 @name 时应返回有效元数据", () => {
    const code = `
// ==CATTool==
// @name        minimal
// ==/CATTool==
return 42;
`;
    const meta = parseCATToolMetadata(code)!;
    expect(meta.name).toBe("minimal");
    expect(meta.description).toBe("");
    expect(meta.params).toHaveLength(0);
    expect(meta.grants).toHaveLength(0);
  });

  it("非 @ 开头的行应被忽略", () => {
    const code = `
// ==CATTool==
// @name        test
// 这是一个注释，不是 @ 指令
// @description 测试工具
// ==/CATTool==
return "ok";
`;
    const meta = parseCATToolMetadata(code)!;
    expect(meta.name).toBe("test");
    expect(meta.description).toBe("测试工具");
  });

  it("@param [required] 带 enum 时应同时解析", () => {
    const code = `
// ==CATTool==
// @name        test
// @param       level string[low,medium,high] [required] 级别
// ==/CATTool==
return "ok";
`;
    const meta = parseCATToolMetadata(code)!;
    expect(meta.params[0].name).toBe("level");
    expect(meta.params[0].required).toBe(true);
    expect(meta.params[0].enum).toEqual(["low", "medium", "high"]);
    expect(meta.params[0].description).toBe("级别");
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

  it("无参数时 properties 应为空对象", () => {
    const def = catToolToToolDefinition({
      name: "ping",
      description: "连通性测试",
      params: [],
      grants: [],
    });

    expect(def.parameters).toEqual({
      type: "object",
      properties: {},
    });
  });

  it("多个 required 参数应全部出现在 required 数组中", () => {
    const def = catToolToToolDefinition({
      name: "test",
      description: "测试",
      params: [
        { name: "a", type: "string", required: true, description: "参数a" },
        { name: "b", type: "number", required: true, description: "参数b" },
        { name: "c", type: "boolean", required: false, description: "参数c" },
      ],
      grants: [],
    });

    expect((def.parameters as any).required).toEqual(["a", "b"]);
  });

  it("enum 参数应在 JSON Schema 中包含 enum 字段", () => {
    const def = catToolToToolDefinition({
      name: "test",
      description: "测试",
      params: [{ name: "color", type: "string", required: false, description: "颜色", enum: ["red", "green", "blue"] }],
      grants: [],
    });

    const props = (def.parameters as any).properties;
    expect(props.color.enum).toEqual(["red", "green", "blue"]);
  });
});

describe("prefixToolDefinition", () => {
  it("应给工具名添加前缀", () => {
    const def = catToolToToolDefinition({
      name: "price-check",
      description: "查询价格",
      params: [{ name: "url", type: "string", required: true, description: "目标URL" }],
      grants: [],
    });

    const prefixed = prefixToolDefinition("taobao", def);

    expect(prefixed.name).toBe("taobao__price-check");
    expect(prefixed.description).toBe("查询价格");
    expect(prefixed.parameters).toEqual(def.parameters);
  });

  it("不应修改原始 ToolDefinition", () => {
    const def = catToolToToolDefinition({
      name: "my-tool",
      description: "测试",
      params: [],
      grants: [],
    });

    prefixToolDefinition("skill-a", def);

    // 原始对象不变
    expect(def.name).toBe("my-tool");
  });

  it("双下划线分隔应避免命名冲突", () => {
    const def1 = catToolToToolDefinition({ name: "extract", description: "A", params: [], grants: [] });
    const def2 = catToolToToolDefinition({ name: "extract", description: "B", params: [], grants: [] });

    const p1 = prefixToolDefinition("skill-a", def1);
    const p2 = prefixToolDefinition("skill-b", def2);

    expect(p1.name).toBe("skill-a__extract");
    expect(p2.name).toBe("skill-b__extract");
    expect(p1.name).not.toBe(p2.name);
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

  it("无元数据头时应返回原始代码", () => {
    const code = `const x = 1;\nreturn x;`;
    const body = getCATToolBody(code);
    expect(body).toBe("const x = 1;\nreturn x;");
  });

  it("应保留元数据头后面的所有代码", () => {
    const code = `// ==CATTool==
// @name test
// @description 测试
// @param city string [required] 城市
// @grant GM.xmlHttpRequest
// ==/CATTool==

const result = await GM.xmlHttpRequest({url: "http://example.com/" + args.city});
const data = JSON.parse(result.responseText);
return data;`;
    const body = getCATToolBody(code);
    expect(body).toContain("const result = await GM.xmlHttpRequest");
    expect(body).toContain("return data;");
    expect(body).not.toContain("==CATTool==");
  });
});

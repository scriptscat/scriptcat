import { describe, expect, it } from "vitest";
import { parseSkillScriptMetadata, getSkillScriptBody } from "./skill_script";

describe("parseSkillScriptMetadata", () => {
  it("应正确解析完整的 SkillScript 元数据", () => {
    const code = `
// ==SkillScript==
// @name        weather
// @description 查询天气信息
// @param       city string [required] 城市名称
// @param       unit string[celsius,fahrenheit] 温度单位
// @grant       GM.xmlHttpRequest
// ==/SkillScript==

const result = await GM.xmlHttpRequest({ url: "https://api.weather.com/" + args.city });
return result;
`;
    const meta = parseSkillScriptMetadata(code);
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

  it("没有 ==SkillScript== 头时返回 null", () => {
    const code = `console.log("hello");`;
    expect(parseSkillScriptMetadata(code)).toBeNull();
  });

  it("缺少 @name 时返回 null", () => {
    const code = `
// ==SkillScript==
// @description 没有名字的工具
// ==/SkillScript==
return "test";
`;
    expect(parseSkillScriptMetadata(code)).toBeNull();
  });

  it("应正确解析 number 和 boolean 类型参数", () => {
    const code = `
// ==SkillScript==
// @name        calc
// @description 计算器
// @param       value number [required] 输入值
// @param       verbose boolean 是否输出详细信息
// ==/SkillScript==
return args.value * 2;
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.params[0].type).toBe("number");
    expect(meta.params[0].required).toBe(true);
    expect(meta.params[1].type).toBe("boolean");
    expect(meta.params[1].required).toBe(false);
  });

  it("应正确解析无参数的工具", () => {
    const code = `
// ==SkillScript==
// @name        ping
// @description 测试连通性
// ==/SkillScript==
return "pong";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.name).toBe("ping");
    expect(meta.params).toHaveLength(0);
    expect(meta.grants).toHaveLength(0);
  });

  it("应正确解析多个 @grant", () => {
    const code = `
// ==SkillScript==
// @name        multi_grant
// @description 多个 grant
// @grant       GM.xmlHttpRequest
// @grant       GM.getValue
// @grant       GM.setValue
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.grants).toEqual(["GM.xmlHttpRequest", "GM.getValue", "GM.setValue"]);
  });

  it("应正确解析单个 @require URL", () => {
    const code = `
// ==SkillScript==
// @name        xlsx_tool
// @description 生成 Excel
// @require     https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
// ==/SkillScript==
return XLSX.utils.book_new();
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.requires).toEqual(["https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"]);
  });

  it("应正确解析多个 @require URL", () => {
    const code = `
// ==SkillScript==
// @name        multi_require
// @description 多个外部库
// @require     https://cdn.example.com/lib1.js
// @require     https://cdn.example.com/lib2.js
// @require     https://cdn.example.com/lib3.js
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.requires).toEqual([
      "https://cdn.example.com/lib1.js",
      "https://cdn.example.com/lib2.js",
      "https://cdn.example.com/lib3.js",
    ]);
  });

  it("无 @require 时 requires 应为空数组", () => {
    const code = `
// ==SkillScript==
// @name        no_require
// @description 无外部依赖
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.requires).toEqual([]);
  });

  it("空 @require 值不应加入列表", () => {
    const code = `
// ==SkillScript==
// @name        empty_require
// @description 测试
// @require
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.requires).toHaveLength(0);
  });

  it("空 @grant 值不应加入列表", () => {
    const code = `
// ==SkillScript==
// @name        empty_grant
// @description 测试
// @grant
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.grants).toHaveLength(0);
  });

  it("@param 带空 enum 括号时不应生成 enum 字段", () => {
    const code = `
// ==SkillScript==
// @name        test
// @param       mode string[] 模式
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.params[0].enum).toBeUndefined();
  });

  it("@param enum 中的空格应被 trim", () => {
    const code = `
// ==SkillScript==
// @name        test
// @param       color string[red , green , blue] 颜色选择
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.params[0].enum).toEqual(["red", "green", "blue"]);
  });

  it("无效的参数类型应被忽略", () => {
    const code = `
// ==SkillScript==
// @name        test
// @param       data object 数据
// @param       valid string 有效参数
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    // "object" 不是有效类型，应被忽略
    expect(meta.params).toHaveLength(1);
    expect(meta.params[0].name).toBe("valid");
  });

  it("仅有 @name 时应返回有效元数据", () => {
    const code = `
// ==SkillScript==
// @name        minimal
// ==/SkillScript==
return 42;
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.name).toBe("minimal");
    expect(meta.description).toBe("");
    expect(meta.params).toHaveLength(0);
    expect(meta.grants).toHaveLength(0);
  });

  it("非 @ 开头的行应被忽略", () => {
    const code = `
// ==SkillScript==
// @name        test
// 这是一个注释，不是 @ 指令
// @description 测试工具
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.name).toBe("test");
    expect(meta.description).toBe("测试工具");
  });

  it("应正确解析 @timeout", () => {
    const code = `
// ==SkillScript==
// @name        slow_tool
// @description 耗时工具
// @timeout     120
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.name).toBe("slow_tool");
    expect(meta.timeout).toBe(120);
  });

  it("无 @timeout 时 timeout 应为 undefined", () => {
    const code = `
// ==SkillScript==
// @name        fast_tool
// @description 快速工具
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.timeout).toBeUndefined();
  });

  it("@timeout 值无效时应忽略", () => {
    const code = `
// ==SkillScript==
// @name        bad_timeout
// @timeout     abc
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.timeout).toBeUndefined();
  });

  it("@timeout 值为 0 或负数时应忽略", () => {
    const code = `
// ==SkillScript==
// @name        zero_timeout
// @timeout     0
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.timeout).toBeUndefined();

    const code2 = `
// ==SkillScript==
// @name        neg_timeout
// @timeout     -5
// ==/SkillScript==
return "ok";
`;
    const meta2 = parseSkillScriptMetadata(code2)!;
    expect(meta2.timeout).toBeUndefined();
  });

  it("@param [required] 带 enum 时应同时解析", () => {
    const code = `
// ==SkillScript==
// @name        test
// @param       level string[low,medium,high] [required] 级别
// ==/SkillScript==
return "ok";
`;
    const meta = parseSkillScriptMetadata(code)!;
    expect(meta.params[0].name).toBe("level");
    expect(meta.params[0].required).toBe(true);
    expect(meta.params[0].enum).toEqual(["low", "medium", "high"]);
    expect(meta.params[0].description).toBe("级别");
  });
});

describe("getSkillScriptBody", () => {
  it("应正确去掉元数据头返回脚本体", () => {
    const code = `// ==SkillScript==
// @name test
// ==/SkillScript==
const x = 1;
return x;`;
    const body = getSkillScriptBody(code);
    expect(body).toBe("const x = 1;\nreturn x;");
  });

  it("无元数据头时应返回原始代码", () => {
    const code = `const x = 1;\nreturn x;`;
    const body = getSkillScriptBody(code);
    expect(body).toBe("const x = 1;\nreturn x;");
  });

  it("应保留元数据头后面的所有代码", () => {
    const code = `// ==SkillScript==
// @name test
// @description 测试
// @param city string [required] 城市
// @grant GM.xmlHttpRequest
// ==/SkillScript==

const result = await GM.xmlHttpRequest({url: "http://example.com/" + args.city});
const data = JSON.parse(result.responseText);
return data;`;
    const body = getSkillScriptBody(code);
    expect(body).toContain("const result = await GM.xmlHttpRequest");
    expect(body).toContain("return data;");
    expect(body).not.toContain("==SkillScript==");
  });
});

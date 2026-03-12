import { describe, it, expect, vi, beforeEach } from "vitest";
import { CATToolExecutor } from "./cattool_executor";
import type { CATToolRecord } from "./types";

// mock executeCATTool
vi.mock("@App/app/service/offscreen/client", () => ({
  executeCATTool: vi.fn().mockResolvedValue("mock_result"),
}));

import { executeCATTool } from "@App/app/service/offscreen/client";

function createRecord(params: CATToolRecord["params"]): CATToolRecord {
  return {
    name: "test_tool",
    description: "测试工具",
    params,
    grants: [],
    code: `// ==CATTool==
// @name test_tool
// ==/CATTool==
return args.value;`,
    installtime: Date.now(),
    updatetime: Date.now(),
  };
}

const mockSender = {} as any;

describe("CATToolExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应将 string 类型参数转换为字符串", async () => {
    const record = createRecord([{ name: "city", type: "string", required: true, description: "城市" }]);
    const executor = new CATToolExecutor(record, mockSender);

    await executor.execute({ city: 123 });

    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        args: { city: "123" },
      })
    );
  });

  it("应将 number 类型参数转换为数字", async () => {
    const record = createRecord([{ name: "count", type: "number", required: true, description: "数量" }]);
    const executor = new CATToolExecutor(record, mockSender);

    await executor.execute({ count: "42" });

    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        args: { count: 42 },
      })
    );
  });

  it("应将 boolean 类型参数转换为布尔值", async () => {
    const record = createRecord([{ name: "verbose", type: "boolean", required: false, description: "详细模式" }]);
    const executor = new CATToolExecutor(record, mockSender);

    // "true" 字符串 → true
    await executor.execute({ verbose: "true" });
    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        args: { verbose: true },
      })
    );
  });

  it('boolean 类型：非 true/"true" 应转换为 false', async () => {
    const record = createRecord([{ name: "verbose", type: "boolean", required: false, description: "详细模式" }]);
    const executor = new CATToolExecutor(record, mockSender);

    await executor.execute({ verbose: "false" });
    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        args: { verbose: false },
      })
    );

    vi.clearAllMocks();
    await executor.execute({ verbose: 0 });
    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        args: { verbose: false },
      })
    );
  });

  it("boolean 类型：true 值应保持为 true", async () => {
    const record = createRecord([{ name: "flag", type: "boolean", required: false, description: "标记" }]);
    const executor = new CATToolExecutor(record, mockSender);

    await executor.execute({ flag: true });
    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        args: { flag: true },
      })
    );
  });

  it("应跳过 undefined 参数", async () => {
    const record = createRecord([
      { name: "required_param", type: "string", required: true, description: "必须" },
      { name: "optional_param", type: "string", required: false, description: "可选" },
    ]);
    const executor = new CATToolExecutor(record, mockSender);

    await executor.execute({ required_param: "hello" });

    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        args: { required_param: "hello" },
      })
    );
  });

  it("应忽略不在定义中的额外参数", async () => {
    const record = createRecord([{ name: "city", type: "string", required: true, description: "城市" }]);
    const executor = new CATToolExecutor(record, mockSender);

    await executor.execute({ city: "北京", extra: "should_be_ignored" });

    // extra 不在 params 定义中，不应出现在 typedArgs 中
    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        args: { city: "北京" },
      })
    );
  });

  it("应传递正确的 code（去除元数据头）和 grants", async () => {
    const record: CATToolRecord = {
      name: "weather",
      description: "查天气",
      params: [],
      grants: ["GM.xmlHttpRequest"],
      code: `// ==CATTool==
// @name weather
// ==/CATTool==
const result = await GM.xmlHttpRequest({url: "http://example.com"});
return result;`,
      installtime: 1,
      updatetime: 1,
    };
    const executor = new CATToolExecutor(record, mockSender);

    await executor.execute({});

    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        grants: ["GM.xmlHttpRequest"],
        name: "weather",
      })
    );
    // code 应不包含元数据头
    const callArgs = (executeCATTool as any).mock.calls[0][1];
    expect(callArgs.code).not.toContain("==CATTool==");
  });

  it("应处理多个混合类型参数", async () => {
    const record = createRecord([
      { name: "city", type: "string", required: true, description: "城市" },
      { name: "days", type: "number", required: false, description: "天数" },
      { name: "detailed", type: "boolean", required: false, description: "详细" },
    ]);
    const executor = new CATToolExecutor(record, mockSender);

    await executor.execute({ city: "上海", days: "7", detailed: "true" });

    expect(executeCATTool).toHaveBeenCalledWith(
      mockSender,
      expect.objectContaining({
        args: { city: "上海", days: 7, detailed: true },
      })
    );
  });
});

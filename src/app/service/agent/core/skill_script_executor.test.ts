import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SkillScriptExecutor,
  getSkillScriptNameByUuid,
  getSkillScriptGrantsByUuid,
  SKILL_SCRIPT_UUID_PREFIX,
  type RequireLoader,
} from "./skill_script_executor";
import type { SkillScriptRecord } from "./types";

function createRecord(
  params: SkillScriptRecord["params"] = [],
  overrides?: Partial<SkillScriptRecord>
): SkillScriptRecord {
  return {
    id: "test-uuid-001",
    name: "test_tool",
    description: "测试工具",
    params,
    grants: [],
    code: `// ==SkillScript==
// @name test_tool
// ==/SkillScript==
return args.value;`,
    installtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  };
}

// 创建 mock sender，sendMessage 返回 { data: response }
function createMockSender(response: any = "mock_result") {
  return {
    sendMessage: vi.fn().mockResolvedValue({ data: response }),
  } as any;
}

// 从 mock sender 的调用中提取传给 offscreen 的 params
function getCallParams(sender: any) {
  const call = sender.sendMessage.mock.calls[0][0];
  // sendMessage 被调用为 sendMessage({ action, data })
  return call.data;
}

describe("SkillScriptExecutor", () => {
  it("应将 string 类型参数转换为字符串", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "city", type: "string", required: true, description: "城市" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ city: 123 });

    const params = getCallParams(sender);
    expect(params.args).toEqual({ city: "123" });
  });

  it("应将 number 类型参数转换为数字", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "count", type: "number", required: true, description: "数量" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ count: "42" });

    const params = getCallParams(sender);
    expect(params.args).toEqual({ count: 42 });
  });

  it("应将 boolean 类型参数转换为布尔值", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "verbose", type: "boolean", required: false, description: "详细模式" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ verbose: "true" });

    const params = getCallParams(sender);
    expect(params.args).toEqual({ verbose: true });
  });

  it('boolean 类型：非 true/"true" 应转换为 false', async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "verbose", type: "boolean", required: false, description: "详细模式" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ verbose: "false" });
    expect(getCallParams(sender).args).toEqual({ verbose: false });

    // 重置并测试 0
    sender.sendMessage.mockClear();
    sender.sendMessage.mockResolvedValue({ data: "mock_result" });
    await executor.execute({ verbose: 0 });
    expect(getCallParams(sender).args).toEqual({ verbose: false });
  });

  it("boolean 类型：true 值应保持为 true", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "flag", type: "boolean", required: false, description: "标记" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ flag: true });

    expect(getCallParams(sender).args).toEqual({ flag: true });
  });

  it("应跳过 undefined 参数", async () => {
    const sender = createMockSender();
    const record = createRecord([
      { name: "required_param", type: "string", required: true, description: "必须" },
      { name: "optional_param", type: "string", required: false, description: "可选" },
    ]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ required_param: "hello" });

    expect(getCallParams(sender).args).toEqual({ required_param: "hello" });
  });

  it("应忽略不在定义中的额外参数", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "city", type: "string", required: true, description: "城市" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ city: "北京", extra: "should_be_ignored" });

    expect(getCallParams(sender).args).toEqual({ city: "北京" });
  });

  it("应传递正确的 code（去除元数据头）和 grants", async () => {
    const sender = createMockSender();
    const record: SkillScriptRecord = {
      id: "test-uuid-weather",
      name: "weather",
      description: "查天气",
      params: [],
      grants: ["GM.xmlHttpRequest"],
      code: `// ==SkillScript==
// @name weather
// ==/SkillScript==
const result = await GM.xmlHttpRequest({url: "http://example.com"});
return result;`,
      installtime: 1,
      updatetime: 1,
    };
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({});

    const params = getCallParams(sender);
    expect(params.grants).toEqual(["GM.xmlHttpRequest"]);
    expect(params.name).toBe("weather");
    expect(params.code).not.toContain("==SkillScript==");
  });

  it("应处理多个混合类型参数", async () => {
    const sender = createMockSender();
    const record = createRecord([
      { name: "city", type: "string", required: true, description: "城市" },
      { name: "days", type: "number", required: false, description: "天数" },
      { name: "detailed", type: "boolean", required: false, description: "详细" },
    ]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ city: "上海", days: "7", detailed: "true" });

    expect(getCallParams(sender).args).toEqual({ city: "上海", days: 7, detailed: true });
  });

  it("应生成 skillscript- 前缀的 UUID", async () => {
    const sender = createMockSender();
    const record = createRecord();
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({});

    const params = getCallParams(sender);
    expect(params.uuid).toMatch(/^skillscript-/);
    expect(params.uuid.length).toBeGreaterThan(SKILL_SCRIPT_UUID_PREFIX.length);
  });

  it("每次执行应生成不同的 UUID", async () => {
    const sender = createMockSender();
    const record = createRecord();
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({});
    const uuid1 = getCallParams(sender).uuid;

    sender.sendMessage.mockClear();
    sender.sendMessage.mockResolvedValue({ data: "mock_result" });
    await executor.execute({});
    const uuid2 = getCallParams(sender).uuid;

    expect(uuid1).not.toBe(uuid2);
  });

  it("执行期间应能通过 UUID 查找工具名，执行后应清理映射", async () => {
    let capturedUuid = "";
    const sender = {
      sendMessage: vi.fn().mockImplementation((msg: any) => {
        capturedUuid = msg.data.uuid;
        // 执行期间映射应存在
        expect(getSkillScriptNameByUuid(msg.data.uuid)).toBe("test_tool");
        return Promise.resolve({ data: "result" });
      }),
    } as any;

    const record = createRecord();
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({});

    // 执行完成后映射应被清理
    expect(capturedUuid).toBeTruthy();
    expect(getSkillScriptNameByUuid(capturedUuid)).toBe("");
  });

  it("执行失败时也应清理 UUID 映射", async () => {
    let capturedUuid = "";
    const sender = {
      sendMessage: vi.fn().mockImplementation((msg: any) => {
        capturedUuid = msg.data.uuid;
        return Promise.reject(new Error("执行失败"));
      }),
    } as any;

    const record = createRecord();
    const executor = new SkillScriptExecutor(record, sender);

    await expect(executor.execute({})).rejects.toThrow("执行失败");

    // 即使失败，映射也应被清理
    expect(capturedUuid).toBeTruthy();
    expect(getSkillScriptNameByUuid(capturedUuid)).toBe("");
  });
});

describe("getSkillScriptNameByUuid", () => {
  it("未注册的 UUID 应返回空字符串", () => {
    expect(getSkillScriptNameByUuid("skillscript-unknown-uuid")).toBe("");
  });

  it("空字符串应返回空字符串", () => {
    expect(getSkillScriptNameByUuid("")).toBe("");
  });
});

describe("getSkillScriptGrantsByUuid", () => {
  it("未注册的 UUID 应返回空数组", () => {
    expect(getSkillScriptGrantsByUuid("skillscript-unknown-uuid")).toEqual([]);
  });

  it("执行期间应能通过 UUID 获取 grants", async () => {
    let capturedUuid = "";
    const sender = {
      sendMessage: vi.fn().mockImplementation((msg: any) => {
        capturedUuid = msg.data.uuid;
        // 执行期间应能获取 grants
        expect(getSkillScriptGrantsByUuid(msg.data.uuid)).toEqual(["CAT.agent.dom", "GM.xmlHttpRequest"]);
        return Promise.resolve({ data: "result" });
      }),
    } as any;

    const record = createRecord([], {
      grants: ["CAT.agent.dom", "GM.xmlHttpRequest"],
    });
    const executor = new SkillScriptExecutor(record, sender);
    await executor.execute({});

    // 执行完成后应清理
    expect(getSkillScriptGrantsByUuid(capturedUuid)).toEqual([]);
  });

  it("执行失败时也应清理 grants 映射", async () => {
    let capturedUuid = "";
    const sender = {
      sendMessage: vi.fn().mockImplementation((msg: any) => {
        capturedUuid = msg.data.uuid;
        return Promise.reject(new Error("执行失败"));
      }),
    } as any;

    const record = createRecord([], { grants: ["CAT.agent.dom"] });
    const executor = new SkillScriptExecutor(record, sender);

    await expect(executor.execute({})).rejects.toThrow("执行失败");
    expect(getSkillScriptGrantsByUuid(capturedUuid)).toEqual([]);
  });
});

describe("SKILL_SCRIPT_UUID_PREFIX", () => {
  it("应为 'skillscript-'", () => {
    expect(SKILL_SCRIPT_UUID_PREFIX).toBe("skillscript-");
  });
});

describe("SkillScriptExecutor 类型转换边界值", () => {
  it('boolean 转换："false" → false', async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "flag", type: "boolean", required: false, description: "标记" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ flag: "false" });
    expect(getCallParams(sender).args).toEqual({ flag: false });
  });

  it('boolean 转换："0" → false', async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "flag", type: "boolean", required: false, description: "标记" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ flag: "0" });
    expect(getCallParams(sender).args).toEqual({ flag: false });
  });

  it("boolean 转换：null → false", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "flag", type: "boolean", required: false, description: "标记" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ flag: null });
    expect(getCallParams(sender).args).toEqual({ flag: false });
  });

  it('boolean 转换："true" → true（确认只有这个值和 true 为 true）', async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "flag", type: "boolean", required: false, description: "标记" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ flag: "true" });
    expect(getCallParams(sender).args).toEqual({ flag: true });
  });

  it('number 转换："abc" → NaN', async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "count", type: "number", required: false, description: "数量" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ count: "abc" });
    expect(getCallParams(sender).args.count).toBeNaN();
  });

  it('number 转换："" → 0', async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "count", type: "number", required: false, description: "数量" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ count: "" });
    expect(getCallParams(sender).args).toEqual({ count: 0 });
  });

  it("number 转换：null → 0", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "count", type: "number", required: false, description: "数量" }]);
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ count: null });
    expect(getCallParams(sender).args).toEqual({ count: 0 });
  });

  it("空 params 定义但有多余 args：只传 metadata 中定义的参数", async () => {
    const sender = createMockSender();
    const record = createRecord([]); // 空 params
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({ extra1: "a", extra2: 123, extra3: true });
    expect(getCallParams(sender).args).toEqual({});
  });
});

describe("SkillScriptExecutor @require 加载", () => {
  it("有 requires 和 requireLoader 时应加载资源并传给 executeSkillScript", async () => {
    const sender = createMockSender();
    const record = createRecord([], {
      requires: ["https://cdn.example.com/lib1.js", "https://cdn.example.com/lib2.js"],
    });
    const loader: RequireLoader = vi.fn().mockImplementation((url: string) => {
      if (url.includes("lib1")) return Promise.resolve("var LIB1 = {};");
      if (url.includes("lib2")) return Promise.resolve("var LIB2 = {};");
      return Promise.resolve(undefined);
    });
    const executor = new SkillScriptExecutor(record, sender, loader);

    await executor.execute({});

    // requireLoader 应被调用两次
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenCalledWith("https://cdn.example.com/lib1.js");
    expect(loader).toHaveBeenCalledWith("https://cdn.example.com/lib2.js");

    // 传给 offscreen 的 params 应包含 requires
    const params = getCallParams(sender);
    expect(params.requires).toEqual([
      { url: "https://cdn.example.com/lib1.js", content: "var LIB1 = {};" },
      { url: "https://cdn.example.com/lib2.js", content: "var LIB2 = {};" },
    ]);
  });

  it("无 requireLoader 时 requires 不应传给 executeSkillScript", async () => {
    const sender = createMockSender();
    const record = createRecord([], {
      requires: ["https://cdn.example.com/lib.js"],
    });
    // 不传 requireLoader
    const executor = new SkillScriptExecutor(record, sender);

    await executor.execute({});

    const params = getCallParams(sender);
    expect(params.requires).toBeUndefined();
  });

  it("无 requires 字段时不应调用 requireLoader", async () => {
    const sender = createMockSender();
    const record = createRecord(); // 默认无 requires
    const loader: RequireLoader = vi.fn();
    const executor = new SkillScriptExecutor(record, sender, loader);

    await executor.execute({});

    expect(loader).not.toHaveBeenCalled();
    const params = getCallParams(sender);
    expect(params.requires).toBeUndefined();
  });

  it("空 requires 数组时不应调用 requireLoader", async () => {
    const sender = createMockSender();
    const record = createRecord([], { requires: [] });
    const loader: RequireLoader = vi.fn();
    const executor = new SkillScriptExecutor(record, sender, loader);

    await executor.execute({});

    expect(loader).not.toHaveBeenCalled();
    const params = getCallParams(sender);
    expect(params.requires).toBeUndefined();
  });

  it("requireLoader 返回 undefined 的 URL 应被跳过", async () => {
    const sender = createMockSender();
    const record = createRecord([], {
      requires: [
        "https://cdn.example.com/good.js",
        "https://cdn.example.com/missing.js",
        "https://cdn.example.com/also-good.js",
      ],
    });
    const loader: RequireLoader = vi.fn().mockImplementation((url: string) => {
      if (url.includes("missing")) return Promise.resolve(undefined);
      if (url.includes("also-good")) return Promise.resolve("var ALSO = 2;");
      if (url.includes("good")) return Promise.resolve("var GOOD = 1;");
      return Promise.resolve(undefined);
    });
    const executor = new SkillScriptExecutor(record, sender, loader);

    await executor.execute({});

    // loader 被调用 3 次
    expect(loader).toHaveBeenCalledTimes(3);
    // 只有成功加载的 2 个资源被传递
    const params = getCallParams(sender);
    expect(params.requires).toEqual([
      { url: "https://cdn.example.com/good.js", content: "var GOOD = 1;" },
      { url: "https://cdn.example.com/also-good.js", content: "var ALSO = 2;" },
    ]);
  });

  it("所有 requireLoader 返回 undefined 时 requires 应为 undefined", async () => {
    const sender = createMockSender();
    const record = createRecord([], {
      requires: ["https://cdn.example.com/missing1.js", "https://cdn.example.com/missing2.js"],
    });
    const loader: RequireLoader = vi.fn().mockResolvedValue(undefined);
    const executor = new SkillScriptExecutor(record, sender, loader);

    await executor.execute({});

    const params = getCallParams(sender);
    expect(params.requires).toBeUndefined();
  });
});

describe("SkillScriptExecutor 超时处理", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("执行超过默认超时(300s)时应抛出带 errorCode=tool_timeout 的错误", async () => {
    vi.useFakeTimers();

    // sender.sendMessage 永不 resolve，模拟挂死的 SkillScript
    const sender = {
      sendMessage: vi.fn().mockReturnValue(new Promise(() => {})),
    } as any;

    const record = createRecord([], { name: "hang_tool" });
    const executor = new SkillScriptExecutor(record, sender);

    // 先附加 catch 再推进时间，防止 rejection 在处理前被标记为 unhandled
    const errPromise = executor.execute({}).catch((e) => e);

    // 推进 300s 触发超时
    await vi.advanceTimersByTimeAsync(300_000);

    const err = await errPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("hang_tool");
    expect((err as Error).message).toContain("timed out");
    expect((err as any).errorCode).toBe("tool_timeout");
  });

  it("超时后 UUID 映射应被清理", async () => {
    vi.useFakeTimers();

    let capturedUuid = "";
    const sender = {
      sendMessage: vi.fn().mockImplementation((msg: any) => {
        capturedUuid = msg.data.uuid;
        return new Promise(() => {});
      }),
    } as any;

    const record = createRecord([], { name: "hang_tool2" });
    const executor = new SkillScriptExecutor(record, sender);

    const execPromise = executor.execute({}).catch(() => {});
    await vi.advanceTimersByTimeAsync(300_000);
    await execPromise;

    expect(capturedUuid).toMatch(/^skillscript-/);
    expect(getSkillScriptNameByUuid(capturedUuid)).toBe("");
  });

  it("自定义 timeout 应覆盖默认 300s", async () => {
    vi.useFakeTimers();

    const sender = {
      sendMessage: vi.fn().mockReturnValue(new Promise(() => {})),
    } as any;

    const record = createRecord([], { name: "slow_tool", timeout: 120 });
    const executor = new SkillScriptExecutor(record, sender);

    const errPromise = executor.execute({}).catch((e) => e);

    // 30s 后不应超时
    await vi.advanceTimersByTimeAsync(30_000);
    // 60s 后仍不应超时
    await vi.advanceTimersByTimeAsync(30_000);

    // 推进到 120s 触发超时
    await vi.advanceTimersByTimeAsync(60_000);

    const err = await errPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("slow_tool");
    expect((err as Error).message).toContain("120s");
    expect((err as any).errorCode).toBe("tool_timeout");
  });

  it("默认超时内完成的执行不应超时", async () => {
    vi.useFakeTimers();

    const sender = {
      sendMessage: vi.fn().mockResolvedValue({ data: "ok" }),
    } as any;

    const record = createRecord();
    const executor = new SkillScriptExecutor(record, sender);

    const execPromise = executor.execute({});
    // 推进 5s，执行早已完成（mock 是 resolved）
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(execPromise).resolves.toBeDefined();
  });
});

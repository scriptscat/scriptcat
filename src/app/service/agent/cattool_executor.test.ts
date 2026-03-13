import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CATToolExecutor,
  getCATToolNameByUuid,
  getCATToolGrantsByUuid,
  CATTOOL_UUID_PREFIX,
} from "./cattool_executor";
import type { CATToolRecord } from "./types";

function createRecord(params: CATToolRecord["params"] = [], overrides?: Partial<CATToolRecord>): CATToolRecord {
  return {
    id: "test-uuid-001",
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

describe("CATToolExecutor", () => {
  it("应将 string 类型参数转换为字符串", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "city", type: "string", required: true, description: "城市" }]);
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({ city: 123 });

    const params = getCallParams(sender);
    expect(params.args).toEqual({ city: "123" });
  });

  it("应将 number 类型参数转换为数字", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "count", type: "number", required: true, description: "数量" }]);
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({ count: "42" });

    const params = getCallParams(sender);
    expect(params.args).toEqual({ count: 42 });
  });

  it("应将 boolean 类型参数转换为布尔值", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "verbose", type: "boolean", required: false, description: "详细模式" }]);
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({ verbose: "true" });

    const params = getCallParams(sender);
    expect(params.args).toEqual({ verbose: true });
  });

  it('boolean 类型：非 true/"true" 应转换为 false', async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "verbose", type: "boolean", required: false, description: "详细模式" }]);
    const executor = new CATToolExecutor(record, sender);

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
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({ flag: true });

    expect(getCallParams(sender).args).toEqual({ flag: true });
  });

  it("应跳过 undefined 参数", async () => {
    const sender = createMockSender();
    const record = createRecord([
      { name: "required_param", type: "string", required: true, description: "必须" },
      { name: "optional_param", type: "string", required: false, description: "可选" },
    ]);
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({ required_param: "hello" });

    expect(getCallParams(sender).args).toEqual({ required_param: "hello" });
  });

  it("应忽略不在定义中的额外参数", async () => {
    const sender = createMockSender();
    const record = createRecord([{ name: "city", type: "string", required: true, description: "城市" }]);
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({ city: "北京", extra: "should_be_ignored" });

    expect(getCallParams(sender).args).toEqual({ city: "北京" });
  });

  it("应传递正确的 code（去除元数据头）和 grants", async () => {
    const sender = createMockSender();
    const record: CATToolRecord = {
      id: "test-uuid-weather",
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
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({});

    const params = getCallParams(sender);
    expect(params.grants).toEqual(["GM.xmlHttpRequest"]);
    expect(params.name).toBe("weather");
    expect(params.code).not.toContain("==CATTool==");
  });

  it("应处理多个混合类型参数", async () => {
    const sender = createMockSender();
    const record = createRecord([
      { name: "city", type: "string", required: true, description: "城市" },
      { name: "days", type: "number", required: false, description: "天数" },
      { name: "detailed", type: "boolean", required: false, description: "详细" },
    ]);
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({ city: "上海", days: "7", detailed: "true" });

    expect(getCallParams(sender).args).toEqual({ city: "上海", days: 7, detailed: true });
  });

  it("应生成 cattool- 前缀的 UUID", async () => {
    const sender = createMockSender();
    const record = createRecord();
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({});

    const params = getCallParams(sender);
    expect(params.uuid).toMatch(/^cattool-/);
    expect(params.uuid.length).toBeGreaterThan(CATTOOL_UUID_PREFIX.length);
  });

  it("每次执行应生成不同的 UUID", async () => {
    const sender = createMockSender();
    const record = createRecord();
    const executor = new CATToolExecutor(record, sender);

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
        expect(getCATToolNameByUuid(msg.data.uuid)).toBe("test_tool");
        return Promise.resolve({ data: "result" });
      }),
    } as any;

    const record = createRecord();
    const executor = new CATToolExecutor(record, sender);

    await executor.execute({});

    // 执行完成后映射应被清理
    expect(capturedUuid).toBeTruthy();
    expect(getCATToolNameByUuid(capturedUuid)).toBe("");
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
    const executor = new CATToolExecutor(record, sender);

    await expect(executor.execute({})).rejects.toThrow("执行失败");

    // 即使失败，映射也应被清理
    expect(capturedUuid).toBeTruthy();
    expect(getCATToolNameByUuid(capturedUuid)).toBe("");
  });
});

describe("getCATToolNameByUuid", () => {
  it("未注册的 UUID 应返回空字符串", () => {
    expect(getCATToolNameByUuid("cattool-unknown-uuid")).toBe("");
  });

  it("空字符串应返回空字符串", () => {
    expect(getCATToolNameByUuid("")).toBe("");
  });
});

describe("getCATToolGrantsByUuid", () => {
  it("未注册的 UUID 应返回空数组", () => {
    expect(getCATToolGrantsByUuid("cattool-unknown-uuid")).toEqual([]);
  });

  it("执行期间应能通过 UUID 获取 grants", async () => {
    let capturedUuid = "";
    const sender = {
      sendMessage: vi.fn().mockImplementation((msg: any) => {
        capturedUuid = msg.data.uuid;
        // 执行期间应能获取 grants
        expect(getCATToolGrantsByUuid(msg.data.uuid)).toEqual(["CAT.agent.dom", "GM.xmlHttpRequest"]);
        return Promise.resolve({ data: "result" });
      }),
    } as any;

    const record = createRecord([], {
      grants: ["CAT.agent.dom", "GM.xmlHttpRequest"],
    });
    const executor = new CATToolExecutor(record, sender);
    await executor.execute({});

    // 执行完成后应清理
    expect(getCATToolGrantsByUuid(capturedUuid)).toEqual([]);
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
    const executor = new CATToolExecutor(record, sender);

    await expect(executor.execute({})).rejects.toThrow("执行失败");
    expect(getCATToolGrantsByUuid(capturedUuid)).toEqual([]);
  });
});

describe("CATTOOL_UUID_PREFIX", () => {
  it("应为 'cattool-'", () => {
    expect(CATTOOL_UUID_PREFIX).toBe("cattool-");
  });
});

describe("CATToolExecutor 超时处理", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("执行超过 30s 时应抛出带 errorCode=tool_timeout 的错误", async () => {
    vi.useFakeTimers();

    // sender.sendMessage 永不 resolve，模拟挂死的 CATTool
    const sender = {
      sendMessage: vi.fn().mockReturnValue(new Promise(() => {})),
    } as any;

    const record = createRecord([], { name: "hang_tool" });
    const executor = new CATToolExecutor(record, sender);

    // 先附加 catch 再推进时间，防止 rejection 在处理前被标记为 unhandled
    const errPromise = executor.execute({}).catch((e) => e);

    // 推进 30s 触发超时
    await vi.advanceTimersByTimeAsync(30_000);

    const err = await errPromise;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("hang_tool");
    expect(err.message).toContain("timed out");
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
    const executor = new CATToolExecutor(record, sender);

    const execPromise = executor.execute({}).catch(() => {});
    await vi.advanceTimersByTimeAsync(30_000);
    await execPromise;

    expect(capturedUuid).toMatch(/^cattool-/);
    expect(getCATToolNameByUuid(capturedUuid)).toBe("");
  });

  it("30s 内完成的执行不应超时", async () => {
    vi.useFakeTimers();

    const sender = {
      sendMessage: vi.fn().mockResolvedValue({ data: "ok" }),
    } as any;

    const record = createRecord();
    const executor = new CATToolExecutor(record, sender);

    const execPromise = executor.execute({});
    // 推进 5s，执行早已完成（mock 是 resolved）
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(execPromise).resolves.toBeDefined();
  });
});

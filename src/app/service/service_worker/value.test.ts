import { initTestEnv } from "@Tests/utils";
import { ValueService } from "./value";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_RUN_STATUS_COMPLETE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { ScriptDAO } from "@App/app/repo/scripts";
import { ValueDAO, type Value } from "@App/app/repo/value";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import { MessageQueue } from "@Packages/message/message_queue";
import type { ValueUpdateSender } from "../content/types";
import { getStorageName } from "@App/pkg/utils/utils";
import type { TKeyValuePair } from "@App/pkg/utils/message_value";
import { encodeRValue } from "@App/pkg/utils/message_value";
import { TrashScriptDAO, type TrashScript } from "@App/app/repo/trash_script";
import type { TDeleteScript } from "@App/app/service/queue";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import type { RuntimeService } from "./runtime";
import type { PopupService } from "./popup";

initTestEnv();

beforeEach(() => createMockOPFS());

/**
 * ValueService.setValue 方法的单元测试
 *
 * 测试覆盖的场景：
 * 1. 设置新脚本的值（首次设置）
 * 2. 更新现有脚本的值
 * 3. 值未改变时的处理（不进行保存）
 * 4. 删除值（设置为undefined）
 * 5. 脚本不存在时的错误处理
 */
describe("ValueService - setValue 方法测试", () => {
  let valueService: ValueService;
  let mockGroup: Group;
  let mockMessageQueue: IMessageQueue;
  let mockScriptDAO: ScriptDAO;
  let mockValueDAO: ValueDAO;

  // 测试数据创建工具函数
  const createMockScript = (overrides: Partial<Script> = {}): Script => ({
    uuid: randomUUID(),
    name: "test-script",
    namespace: "test-namespace",
    type: SCRIPT_TYPE_NORMAL,
    status: SCRIPT_STATUS_ENABLE,
    sort: 0,
    runStatus: "running" as const,
    createtime: Date.now(),
    checktime: Date.now(),
    metadata: {
      storageName: [`test_storage_${randomUUID()}`],
    },
    ...overrides,
  });

  const createMockValueSender = (): ValueUpdateSender => ({
    runFlag: "user",
    tabId: -2,
  });

  beforeEach(() => {
    // 创建消息系统
    const eventEmitter = new EventEmitter<string, any>();
    const mockMessage = new MockMessage(eventEmitter);
    const server = new Server("test", mockMessage);
    mockGroup = server.group("value");
    mockMessageQueue = new MessageQueue();

    // 创建ValueService实例
    valueService = new ValueService(mockGroup, mockMessageQueue);

    // Mock ScriptDAO
    mockScriptDAO = {
      get: vi.fn(),
    } as any;
    valueService.scriptDAO = mockScriptDAO;

    // Mock ValueDAO
    mockValueDAO = {
      get: vi.fn(),
      save: vi.fn(),
    } as any;
    valueService.valueDAO = mockValueDAO;

    // Mock pushValueUpdate 方法
    valueService.pushValueUpdate = vi.fn();

    // Mock mq.emit 方法
    mockMessageQueue.emit = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("应该成功设置新脚本的值", async () => {
    // 准备测试数据
    const mockScript = createMockScript();
    const mockSender = createMockValueSender();
    const key = "testKey";
    const value = "testValue";

    // 配置mock返回值
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(undefined); // 新脚本，没有现有值
    vi.mocked(mockValueDAO.save).mockResolvedValue({} as any);

    // 执行测试
    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-4021",
      keyValuePairs: [[key, encodeRValue(value)]],
      valueSender: mockSender,
      isReplace: false,
    });

    // 验证结果
    expect(mockScriptDAO.get).toHaveBeenCalledWith(mockScript.uuid);
    expect(mockValueDAO.get).toHaveBeenCalled();
    expect(mockValueDAO.save).toHaveBeenCalled();
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      mockScript,
      expect.objectContaining({
        entries: expect.any(Object),
        id: "testId-4021",
        sender: expect.objectContaining({
          runFlag: expect.any(String),
          tabId: expect.any(Number),
        }),
        storageName: getStorageName(mockScript),
        uuid: mockScript.uuid,
        valueUpdated: true,
      })
    );

    // 验证保存的数据结构
    const saveCall = vi.mocked(mockValueDAO.save).mock.calls[0];
    const savedValue = saveCall[1];
    expect(savedValue.uuid).toBe(mockScript.uuid);
    expect(savedValue.data[key]).toBe(value);
    expect(savedValue.createtime).toBeTypeOf("number");
    expect(savedValue.updatetime).toBeTypeOf("number");
  });

  it("应该成功设置新脚本的值 (storageName fallback)", async () => {
    // 准备测试数据
    const mockScript = createMockScript();
    mockScript.metadata = {}; // storageName fallback
    const mockSender = createMockValueSender();
    const key = "testKey";
    const value = "testValue";

    // 配置mock返回值
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(undefined); // 新脚本，没有现有值
    vi.mocked(mockValueDAO.save).mockResolvedValue({} as any);

    // 执行测试
    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-4022",
      keyValuePairs: [[key, encodeRValue(value)]],
      valueSender: mockSender,
      isReplace: false,
    });

    // 验证结果
    expect(mockScriptDAO.get).toHaveBeenCalledWith(mockScript.uuid);
    expect(mockValueDAO.get).toHaveBeenCalled();
    expect(mockValueDAO.save).toHaveBeenCalled();
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      mockScript,
      expect.objectContaining({
        entries: expect.any(Object),
        id: "testId-4022",
        sender: expect.objectContaining({
          runFlag: expect.any(String),
          tabId: expect.any(Number),
        }),
        storageName: getStorageName(mockScript),
        uuid: mockScript.uuid,
        valueUpdated: true,
      })
    );

    // 验证保存的数据结构
    const saveCall = vi.mocked(mockValueDAO.save).mock.calls[0];
    const savedValue = saveCall[1];
    expect(savedValue.uuid).toBe(mockScript.uuid);
    expect(savedValue.data[key]).toBe(value);
    expect(savedValue.createtime).toBeTypeOf("number");
    expect(savedValue.updatetime).toBeTypeOf("number");
  });

  it("应该成功更新现有脚本的值", async () => {
    // 准备测试数据
    const mockScript = createMockScript();
    const mockSender = createMockValueSender();
    const key = "testKey";
    const oldValue = "oldTestValue";
    const newValue = "newTestValue";

    const originalData = { [key]: oldValue };
    const existingValueModel = {
      uuid: mockScript.uuid,
      storageName: getStorageName(mockScript),
      data: originalData,
      createtime: Date.now() - 1000,
      updatetime: Date.now() - 1000,
    };

    // 配置mock返回值
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(existingValueModel);
    vi.mocked(mockValueDAO.save).mockResolvedValue({} as any);

    // 执行测试
    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-4023",
      keyValuePairs: [[key, encodeRValue(newValue)]],
      valueSender: mockSender,
      isReplace: false,
    });

    // 验证结果
    expect(mockScriptDAO.get).toHaveBeenCalledWith(mockScript.uuid);
    expect(mockValueDAO.get).toHaveBeenCalled();
    expect(mockValueDAO.save).toHaveBeenCalled();
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      mockScript,
      expect.objectContaining({
        entries: expect.any(Object),
        id: "testId-4023",
        sender: expect.objectContaining({
          runFlag: expect.any(String),
          tabId: expect.any(Number),
        }),
        storageName: getStorageName(mockScript),
        uuid: mockScript.uuid,
        valueUpdated: true,
      })
    );

    // 验证保存的数据被正确更新
    const saveCall = vi.mocked(mockValueDAO.save).mock.calls[0];
    const savedValue = saveCall[1];
    expect(savedValue.data[key]).toBe(newValue);
    // 验证引用是否与原始数据不同（这表明创建了新的数据引用）
    expect(savedValue.data).not.toBe(originalData);
  });

  it("当值未改变时不应该执行保存操作", async () => {
    // 准备测试数据
    const mockScript = createMockScript();
    const mockSender = createMockValueSender();
    const key = "testKey";
    const value = "sameValue";

    const existingValueModel = {
      uuid: mockScript.uuid,
      storageName: getStorageName(mockScript),
      data: { [key]: value }, // 相同的值
      createtime: Date.now() - 1000,
      updatetime: Date.now() - 1000,
    };

    // 配置mock返回值
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(existingValueModel);

    // 执行测试
    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-4024",
      keyValuePairs: [[key, encodeRValue(value)]],
      valueSender: mockSender,
      isReplace: false,
    });

    // 验证结果 - 不应该保存或发送更新
    expect(mockScriptDAO.get).toHaveBeenCalledWith(mockScript.uuid);
    expect(mockValueDAO.get).toHaveBeenCalled();
    expect(mockValueDAO.save).not.toHaveBeenCalled(); // 值未改变，不应该保存
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      mockScript,
      expect.objectContaining({
        entries: expect.any(Object),
        id: "testId-4024",
        sender: expect.objectContaining({
          runFlag: expect.any(String),
          tabId: expect.any(Number),
        }),
        storageName: getStorageName(mockScript),
        uuid: mockScript.uuid,
        valueUpdated: false,
      })
    ); // 值未改变
  });

  it("当设置值为undefined时应该删除该键", async () => {
    // 准备测试数据
    const mockScript = createMockScript();
    const mockSender = createMockValueSender();
    const key = "testKey";
    const oldValue = "valueToDelete";

    const existingValueModel = {
      uuid: mockScript.uuid,
      storageName: getStorageName(mockScript),
      data: { [key]: oldValue, otherKey: "otherValue" },
      createtime: Date.now() - 1000,
      updatetime: Date.now() - 1000,
    };

    // 配置mock返回值
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(existingValueModel);
    vi.mocked(mockValueDAO.save).mockResolvedValue({} as any);

    // 执行测试 - 设置值为undefined
    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-4025",
      keyValuePairs: [[key, encodeRValue(undefined)]],
      valueSender: mockSender,
      isReplace: false,
    });

    // 验证结果
    expect(mockValueDAO.save).toHaveBeenCalled();

    // 验证键被删除
    const saveCall = vi.mocked(mockValueDAO.save).mock.calls[0];
    const savedValue = saveCall[1];
    expect(savedValue.data).not.toHaveProperty(key); // 键应该被删除
    expect(savedValue.data.otherKey).toBe("otherValue"); // 其他键保持不变
  });

  it("当脚本不存在时应该抛出错误", async () => {
    // 准备测试数据
    const nonExistentUuid = randomUUID();
    const mockSender = createMockValueSender();

    // 配置mock返回值 - 脚本不存在
    vi.mocked(mockScriptDAO.get).mockResolvedValue(undefined);

    // 执行测试并验证抛出错误
    const keyValuePairs1 = [["testKey", encodeRValue("testValue")]] satisfies TKeyValuePair[];
    await expect(
      valueService.setValues({
        uuid: nonExistentUuid,
        id: "testId-4026",
        keyValuePairs: keyValuePairs1,
        valueSender: mockSender,
        isReplace: false,
      })
    ).rejects.toThrow("script not found");

    // 验证不会执行后续操作
    expect(mockValueDAO.get).not.toHaveBeenCalled();
    expect(mockValueDAO.save).not.toHaveBeenCalled();
    expect(valueService.pushValueUpdate).not.toHaveBeenCalled();
    expect(mockMessageQueue.emit).toHaveBeenCalledTimes(0);
  });

  it("应该正确处理并发访问的缓存键", async () => {
    // 这个测试验证 stackAsyncTask 的使用，确保相同 storageName 的操作不会冲突
    const mockScript = createMockScript();
    const mockSender = createMockValueSender();
    const key1 = "key1";
    const key2 = "key2";
    const value1 = "value1";
    const value2 = "value2";

    // 配置mock返回值
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(undefined);
    vi.mocked(mockValueDAO.save).mockResolvedValue({} as any);
    expect(mockScriptDAO.get).toHaveBeenCalledTimes(0);
    expect(mockValueDAO.save).toHaveBeenCalledTimes(0);
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(0);

    // 并发执行两个setValue操作
    const keyValuePairs1 = [[key1, encodeRValue(value1)]] satisfies TKeyValuePair[];
    const keyValuePairs2 = [[key2, encodeRValue(value2)]] satisfies TKeyValuePair[];
    await Promise.all([
      valueService.setValues({
        uuid: mockScript.uuid,
        id: "testId-4041",
        keyValuePairs: keyValuePairs1,
        valueSender: mockSender,
        isReplace: false,
      }),
      valueService.setValues({
        uuid: mockScript.uuid,
        id: "testId-4042",
        keyValuePairs: keyValuePairs2,
        valueSender: mockSender,
        isReplace: false,
      }),
    ]);

    // 验证两个操作都被调用
    expect(mockScriptDAO.get).toHaveBeenCalledTimes(2);
    expect(mockValueDAO.save).toHaveBeenCalledTimes(2);
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(2);
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      mockScript,
      expect.objectContaining({
        entries: expect.any(Object),
        id: "testId-4041",
        sender: expect.objectContaining({
          runFlag: expect.any(String),
          tabId: expect.any(Number),
        }),
        storageName: getStorageName(mockScript),
        uuid: mockScript.uuid,
        valueUpdated: true,
      })
    );
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      2,
      mockScript,
      expect.objectContaining({
        entries: expect.any(Object),
        id: "testId-4042",
        sender: expect.objectContaining({
          runFlag: expect.any(String),
          tabId: expect.any(Number),
        }),
        storageName: getStorageName(mockScript),
        uuid: mockScript.uuid,
        valueUpdated: true,
      })
    );
  });
});

describe("ValueService - updatetime 与 waitForFreshValueState", () => {
  let valueService: ValueService;
  let mockScriptDAO: ScriptDAO;
  let mockValueDAO: ValueDAO;

  const createMockScript = (overrides: Partial<Script> = {}): Script => ({
    uuid: randomUUID(),
    name: "test-script",
    namespace: "test-namespace",
    type: SCRIPT_TYPE_NORMAL,
    status: SCRIPT_STATUS_ENABLE,
    sort: 0,
    runStatus: "running" as const,
    createtime: Date.now(),
    checktime: Date.now(),
    metadata: {
      storageName: [`test_storage_${randomUUID()}`],
    },
    ...overrides,
  });

  const createMockValueSender = (): ValueUpdateSender => ({
    runFlag: "user",
    tabId: -2,
  });

  beforeEach(() => {
    const eventEmitter = new EventEmitter<string, any>();
    const mockMessage = new MockMessage(eventEmitter);
    const server = new Server("test", mockMessage);
    const mq = new MessageQueue();
    valueService = new ValueService(server.group("value"), mq);
    mockScriptDAO = {
      get: vi.fn(),
    } as any;
    valueService.scriptDAO = mockScriptDAO;
    mockValueDAO = {
      get: vi.fn(),
      save: vi.fn(),
    } as any;
    valueService.valueDAO = mockValueDAO;
    valueService.pushValueUpdate = vi.fn();
    mq.emit = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("设置值时应更新 valueModel.updatetime 并在推送数据中携带 updatetime", async () => {
    const mockScript = createMockScript();
    const oldUpdatetime = Date.now() - 10000;
    const existingValueModel: Value = {
      uuid: mockScript.uuid,
      storageName: getStorageName(mockScript),
      data: { testKey: "oldValue" },
      createtime: oldUpdatetime,
      updatetime: oldUpdatetime,
    };
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(existingValueModel);
    vi.mocked(mockValueDAO.save).mockResolvedValue({} as any);

    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-5001",
      keyValuePairs: [["testKey", encodeRValue("newValue")]],
      valueSender: createMockValueSender(),
      isReplace: false,
    });

    const savedValue = vi.mocked(mockValueDAO.save).mock.calls[0][1];
    expect(savedValue.updatetime).toBeGreaterThan(oldUpdatetime);
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      mockScript,
      expect.objectContaining({
        id: "testId-5001",
        valueUpdated: true,
        updatetime: savedValue.updatetime,
      })
    );
  });

  it("值未改变时推送数据仍携带当前 updatetime", async () => {
    const mockScript = createMockScript();
    const oldUpdatetime = Date.now() - 10000;
    const existingValueModel: Value = {
      uuid: mockScript.uuid,
      storageName: getStorageName(mockScript),
      data: { testKey: "sameValue" },
      createtime: oldUpdatetime,
      updatetime: oldUpdatetime,
    };
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(existingValueModel);

    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-5002",
      keyValuePairs: [["testKey", encodeRValue("sameValue")]],
      valueSender: createMockValueSender(),
      isReplace: false,
    });

    expect(mockValueDAO.save).not.toHaveBeenCalled();
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      mockScript,
      expect.objectContaining({
        id: "testId-5002",
        valueUpdated: false,
        updatetime: oldUpdatetime,
      })
    );
  });

  it("waitForFreshValueState 不带 id 时应直接返回 valueDAO 的 updatetime", async () => {
    const mockScript = createMockScript();
    const updatetime = Date.now() - 5000;
    const existingValueModel: Value = {
      uuid: mockScript.uuid,
      storageName: getStorageName(mockScript),
      data: {},
      createtime: updatetime,
      updatetime,
    };
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(existingValueModel);

    const ret = await valueService.waitForFreshValueState(mockScript.uuid, "", createMockValueSender());
    expect(ret).toBe(updatetime);
    expect(valueService.pushValueUpdate).not.toHaveBeenCalled();
  });

  it("waitForFreshValueState 带 id 时应先执行一次空 setValues 触发带 id 的推送", async () => {
    const mockScript = createMockScript();
    const updatetime = Date.now() - 5000;
    const existingValueModel: Value = {
      uuid: mockScript.uuid,
      storageName: getStorageName(mockScript),
      data: {},
      createtime: updatetime,
      updatetime,
    };
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(existingValueModel);

    const ret = await valueService.waitForFreshValueState(mockScript.uuid, "freshId-5004", createMockValueSender());
    expect(ret).toBe(updatetime);
    expect(mockValueDAO.save).not.toHaveBeenCalled();
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      mockScript,
      expect.objectContaining({
        id: "freshId-5004",
        valueUpdated: false,
        updatetime,
      })
    );
  });
});

describe("ValueService —— 共享 storagename 的回收站感知", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it("彻底删除某脚本时,若共用同一 storagename 的脚本尚在回收站,则不得删除共享 value", async () => {
    const eventEmitter = new EventEmitter<string, any>();
    const server = new Server("test", new MockMessage(eventEmitter));
    const mq = new MessageQueue();
    const service = new ValueService(server.group("value"), mq);
    service.init({} as RuntimeService, {} as PopupService);

    const trashDAO = new TrashScriptDAO();
    const valueDAO = new ValueDAO();
    const shared = "shared-storage";

    // A、B 都声明 @storagename "shared-storage",两者都已在回收站
    // 注意:metadata 的 key 必须是全小写 storagename,getStorageName 只认这个
    const base: Omit<TrashScript, "uuid" | "name"> = {
      namespace: "ns",
      type: SCRIPT_TYPE_NORMAL,
      status: SCRIPT_STATUS_ENABLE,
      sort: 0,
      runStatus: SCRIPT_RUN_STATUS_COMPLETE,
      createtime: Date.now(),
      checktime: Date.now(),
      metadata: { storagename: [shared] },
      deleteTime: Date.now(),
      deleteBy: "user",
    };
    await trashDAO.save({ ...base, uuid: "A", name: "脚本A" });
    await trashDAO.save({ ...base, uuid: "B", name: "脚本B" });
    const sharedValue: Value = {
      uuid: "A",
      storageName: shared,
      data: { k: "别删我" },
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    await valueDAO.save(shared, sharedValue);

    // 彻底删除 B。必须先把 B 移出回收站再广播,以忠实还原 purgeScripts 的真实顺序
    // (它先 trashScriptDAO.deletes(uuids) 成功后才 publish)。
    // 若留着 B 不删,回收站查询会因 B 自身而非目标 A 命中 → 用例失去分辨力。
    await trashDAO.delete("B");
    mq.publish<TDeleteScript[]>("deleteScripts", [{ uuid: "B", storageName: shared, type: 1 }]);
    await new Promise((r) => setTimeout(r, 0));

    // 此刻回收站里只剩 A。A 还在等着被还原,它的 value 必须活着
    expect(await valueDAO.get(shared)).toBeDefined();
  });

  it("两张表都没有脚本使用该 storagename 时才删除 value", async () => {
    const eventEmitter = new EventEmitter<string, any>();
    const server = new Server("test", new MockMessage(eventEmitter));
    const mq = new MessageQueue();
    const service = new ValueService(server.group("value"), mq);
    service.init({} as RuntimeService, {} as PopupService);

    const valueDAO = new ValueDAO();
    const lonely = "lonely-storage";
    await valueDAO.save(lonely, {
      uuid: "C",
      storageName: lonely,
      data: { k: "v" },
      createtime: Date.now(),
      updatetime: Date.now(),
    });

    mq.publish<TDeleteScript[]>("deleteScripts", [{ uuid: "C", storageName: lonely, type: 1 }]);
    await new Promise((r) => setTimeout(r, 0));

    expect(await valueDAO.get(lonely)).toBeUndefined();
  });
});

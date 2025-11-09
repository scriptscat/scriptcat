import { initTestEnv } from "@Tests/utils";
import { ValueService } from "./value";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { ScriptDAO } from "@App/app/repo/scripts";
import type { ValueDAO } from "@App/app/repo/value";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import { MessageQueue } from "@Packages/message/message_queue";
import type { ValueUpdateSender } from "../content/types";
import { getStorageName } from "@App/pkg/utils/utils";
import { type TScriptValueUpdate } from "../queue";
import { isEarlyStartScript } from "../content/utils";
import { CACHE_KEY_SET_VALUE } from "@App/app/cache_key";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";

initTestEnv();

/** 手动控制的 Promise（用于阻塞） */
const deferred = <T = void>() => {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const nextTick = () => Promise.resolve();
const flush = async () => {
  await nextTick();
  await nextTick();
};

const expectedValueUpdateEventEmit = (mockScript: Script, valueUpdated: boolean): TScriptValueUpdate => {
  const valueUpdateEventEmit: TScriptValueUpdate = {
    uuid: mockScript.uuid,
    valueUpdated,
    status: mockScript.status,
    isEarlyStart: isEarlyStartScript(mockScript.metadata),
  };
  return valueUpdateEventEmit;
};

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

    // Mock pushValueToTab 方法
    valueService.pushValueToTab = vi.fn();

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
    await valueService.setValues(mockScript.uuid, "testId-4021", { [key]: value }, mockSender, false);
    await flush();

    // 验证结果
    expect(mockScriptDAO.get).toHaveBeenCalledWith(mockScript.uuid);
    expect(mockValueDAO.get).toHaveBeenCalled();
    expect(mockValueDAO.save).toHaveBeenCalled();
    expect(valueService.pushValueToTab).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueToTab).toHaveBeenNthCalledWith(
      1,
      getStorageName(mockScript),
      expect.objectContaining({
        [mockScript.uuid]: [
          expect.objectContaining({
            entries: expect.objectContaining({
              m: Array(1).fill(expect.anything()),
            }),
            id: "testId-4021",
            sender: expect.objectContaining({
              runFlag: expect.any(String),
              tabId: expect.any(Number),
            }),
            storageName: getStorageName(mockScript),
            updatetime: expect.any(Number),
            uuid: mockScript.uuid,
          }),
        ],
      })
    );
    expect(mockMessageQueue.emit).toHaveBeenCalledTimes(1);
    expect(mockMessageQueue.emit).toHaveBeenCalledWith("valueUpdate", expectedValueUpdateEventEmit(mockScript, true));

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
    await valueService.setValues(mockScript.uuid, "testId-4022", { [key]: value }, mockSender, false);
    await flush();

    // 验证结果
    expect(mockScriptDAO.get).toHaveBeenCalledWith(mockScript.uuid);
    expect(mockValueDAO.get).toHaveBeenCalled();
    expect(mockValueDAO.save).toHaveBeenCalled();
    expect(valueService.pushValueToTab).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueToTab).toHaveBeenNthCalledWith(
      1,
      getStorageName(mockScript),
      expect.objectContaining({
        [mockScript.uuid]: [
          expect.objectContaining({
            entries: expect.objectContaining({
              m: Array(1).fill(expect.anything()),
            }),
            id: "testId-4022",
            sender: expect.objectContaining({
              runFlag: expect.any(String),
              tabId: expect.any(Number),
            }),
            storageName: getStorageName(mockScript),
            uuid: mockScript.uuid,
          }),
        ],
      })
    );
    expect(mockMessageQueue.emit).toHaveBeenCalledTimes(1);
    expect(mockMessageQueue.emit).toHaveBeenCalledWith("valueUpdate", expectedValueUpdateEventEmit(mockScript, true));

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
    await valueService.setValues(mockScript.uuid, "testId-4023", { [key]: newValue }, mockSender, false);
    await flush();

    // 验证结果
    expect(mockScriptDAO.get).toHaveBeenCalledWith(mockScript.uuid);
    expect(mockValueDAO.get).toHaveBeenCalled();
    expect(mockValueDAO.save).toHaveBeenCalled();
    expect(valueService.pushValueToTab).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueToTab).toHaveBeenNthCalledWith(
      1,
      getStorageName(mockScript),
      expect.objectContaining({
        [mockScript.uuid]: [
          expect.objectContaining({
            entries: expect.objectContaining({
              m: Array(1).fill(expect.anything()),
            }),
            id: "testId-4023",
            sender: expect.objectContaining({
              runFlag: expect.any(String),
              tabId: expect.any(Number),
            }),
            storageName: getStorageName(mockScript),
            uuid: mockScript.uuid,
          }),
        ],
      })
    );
    expect(mockMessageQueue.emit).toHaveBeenCalledTimes(1);
    expect(mockMessageQueue.emit).toHaveBeenCalledWith("valueUpdate", expectedValueUpdateEventEmit(mockScript, true));

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
    await valueService.setValues(mockScript.uuid, "testId-4024", { [key]: value }, mockSender, false);
    await flush();

    // 验证结果 - 不应该保存或发送更新
    expect(mockScriptDAO.get).toHaveBeenCalledWith(mockScript.uuid);
    expect(mockValueDAO.get).toHaveBeenCalled();
    expect(mockValueDAO.save).not.toHaveBeenCalled(); // 值未改变，不应该保存
    expect(valueService.pushValueToTab).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueToTab).toHaveBeenNthCalledWith(
      1,
      getStorageName(mockScript),
      expect.objectContaining({
        [mockScript.uuid]: [
          expect.objectContaining({
            entries: expect.objectContaining({
              m: Array(0),
            }),
            id: "testId-4024",
            sender: expect.objectContaining({
              runFlag: expect.any(String),
              tabId: expect.any(Number),
            }),
            storageName: getStorageName(mockScript),
            uuid: mockScript.uuid,
          }),
        ],
      })
    ); // 值未改变
    expect(mockMessageQueue.emit).toHaveBeenCalledTimes(1);
    expect(mockMessageQueue.emit).toHaveBeenCalledWith("valueUpdate", expectedValueUpdateEventEmit(mockScript, false)); // 值未改变
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
    await valueService.setValues(mockScript.uuid, "testId-4025", { [key]: undefined }, mockSender, false);
    await flush();

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
    await expect(
      valueService.setValues(nonExistentUuid, "testId-4026", { testKey: "testValue" }, mockSender, false)
    ).rejects.toThrow("script not found");
    await flush();

    // 验证不会执行后续操作
    expect(mockValueDAO.get).not.toHaveBeenCalled();
    expect(mockValueDAO.save).not.toHaveBeenCalled();
    expect(valueService.pushValueToTab).not.toHaveBeenCalled();
    expect(mockMessageQueue.emit).toHaveBeenCalledTimes(0);
  });

  it("应该正确处理并发访问的缓存键(1)", async () => {
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
    expect(valueService.pushValueToTab).toHaveBeenCalledTimes(0);

    // 并发执行两个setValue操作
    await Promise.all([
      valueService.setValues(mockScript.uuid, "testId-4041", { [key1]: value1 }, mockSender, false),
      valueService.setValues(mockScript.uuid, "testId-4042", { [key2]: value2 }, mockSender, false),
    ]);
    await flush();

    // 验证两个操作都被调用
    expect(mockScriptDAO.get).toHaveBeenCalledTimes(2);
    expect(mockValueDAO.save).toHaveBeenCalledTimes(2);
    expect(valueService.pushValueToTab).toHaveBeenCalledTimes(2);
    expect(valueService.pushValueToTab).toHaveBeenNthCalledWith(
      1,
      getStorageName(mockScript),
      expect.objectContaining({
        [mockScript.uuid]: [
          expect.objectContaining({
            entries: expect.objectContaining({
              m: Array(1).fill(expect.anything()),
            }),
            id: "testId-4041",
            sender: expect.objectContaining({
              runFlag: expect.any(String),
              tabId: expect.any(Number),
            }),
            storageName: getStorageName(mockScript),
            uuid: mockScript.uuid,
          }),
        ],
      })
    );
    expect(valueService.pushValueToTab).toHaveBeenNthCalledWith(
      2,
      getStorageName(mockScript),
      expect.objectContaining({
        [mockScript.uuid]: [
          expect.objectContaining({
            entries: expect.objectContaining({
              m: Array(1).fill(expect.anything()),
            }),
            id: "testId-4042",
            sender: expect.objectContaining({
              runFlag: expect.any(String),
              tabId: expect.any(Number),
            }),
            storageName: getStorageName(mockScript),
            uuid: mockScript.uuid,
          }),
        ],
      })
    );
    expect(mockMessageQueue.emit).toHaveBeenCalledTimes(2);
    expect(mockMessageQueue.emit).toHaveBeenNthCalledWith(
      1,
      "valueUpdate",
      expectedValueUpdateEventEmit(mockScript, true)
    );
    expect(mockMessageQueue.emit).toHaveBeenNthCalledWith(
      2,
      "valueUpdate",
      expectedValueUpdateEventEmit(mockScript, true)
    );
  });

  it("应该正确处理并发访问的缓存键(2)", async () => {
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
    expect(valueService.pushValueToTab).toHaveBeenCalledTimes(0);

    const d = deferred();
    stackAsyncTask<void>(`${CACHE_KEY_SET_VALUE}${getStorageName(mockScript)}`, () => d.promise);

    // 并发执行两个setValue操作
    const ret = Promise.all([
      valueService.setValues(mockScript.uuid, "testId-4041", { [key1]: value1 }, mockSender, false),
      valueService.setValues(mockScript.uuid, "testId-4042", { [key2]: value2 }, mockSender, false),
    ]);
    await flush();
    d.resolve();
    await flush();
    await ret;
    await flush();

    // 验证两个操作都被调用
    expect(mockScriptDAO.get).toHaveBeenCalledTimes(2);
    expect(mockValueDAO.save).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueToTab).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueToTab).toHaveBeenNthCalledWith(
      1,
      getStorageName(mockScript),
      expect.objectContaining({
        [mockScript.uuid]: [
          expect.objectContaining({
            entries: expect.objectContaining({
              m: Array(1).fill(expect.anything()),
            }),
            id: "testId-4041",
            sender: expect.objectContaining({
              runFlag: expect.any(String),
              tabId: expect.any(Number),
            }),
            storageName: getStorageName(mockScript),
            uuid: mockScript.uuid,
          }),
          expect.objectContaining({
            entries: expect.objectContaining({
              m: Array(1).fill(expect.anything()),
            }),
            id: "testId-4042",
            sender: expect.objectContaining({
              runFlag: expect.any(String),
              tabId: expect.any(Number),
            }),
            storageName: getStorageName(mockScript),
            uuid: mockScript.uuid,
          }),
        ],
      })
    );
    expect(mockMessageQueue.emit).toHaveBeenCalledTimes(1);
    expect(mockMessageQueue.emit).toHaveBeenNthCalledWith(
      1,
      "valueUpdate",
      expectedValueUpdateEventEmit(mockScript, true)
    );
  });
});

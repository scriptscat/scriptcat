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
import { deferred, getStorageName } from "@App/pkg/utils/utils";
import { CACHE_KEY_SET_VALUE } from "@App/app/cache_key";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import type { TKeyValuePair } from "@App/pkg/utils/message_value";
import { encodeRValue } from "@App/pkg/utils/message_value";
import { TrashScriptDAO, type TrashScript } from "@App/app/repo/trash_script";
import type { TDeleteScript } from "@App/app/service/queue";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import type { RuntimeService } from "./runtime";
import type { PopupService } from "./popup";

initTestEnv();

beforeEach(() => createMockOPFS());

const nextMacroTask = () => new Promise((r) => setTimeout(r, 0));

/**
 * ValueService.setValues 方法的单元测试
 *
 * 测试覆盖的场景：
 * 1. 设置新脚本的值（首次设置）
 * 2. 更新现有脚本的值
 * 3. 值未改变时的处理（不进行保存）
 * 4. 删除值（设置为undefined）
 * 5. 脚本不存在时的错误处理
 * 6. 同一 storageName 的并发操作会被合并为一次读写与一次推送
 * 7. setValues 的处理顺序与调用顺序一致
 * 8. updatetime 严格递增
 */
describe("ValueService - setValues 方法测试", () => {
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

  // pushValueUpdate 中单个 ValueUpdateDataEncoded 的期望结构
  const expectResponse = (id: string, mockScript: Script, changeCount: number) =>
    expect.objectContaining({
      id,
      valueChanges: Array(changeCount).fill(expect.anything()),
      uuid: mockScript.uuid,
      storageName: getStorageName(mockScript),
      sender: expect.objectContaining({
        runFlag: expect.any(String),
        tabId: expect.any(Number),
      }),
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
      [mockScript],
      expect.objectContaining({
        storageName: getStorageName(mockScript),
        storageChanges: {
          [mockScript.uuid]: [expectResponse("testId-4021", mockScript, 1)],
        },
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
      [mockScript],
      expect.objectContaining({
        storageName: getStorageName(mockScript),
        storageChanges: {
          [mockScript.uuid]: [expectResponse("testId-4022", mockScript, 1)],
        },
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
      [mockScript],
      expect.objectContaining({
        storageName: getStorageName(mockScript),
        storageChanges: {
          [mockScript.uuid]: [expectResponse("testId-4023", mockScript, 1)],
        },
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

    // 验证结果 - 不应该保存，但仍然推送（客户端依赖 id 回执解除等待）
    expect(mockScriptDAO.get).toHaveBeenCalledWith(mockScript.uuid);
    expect(mockValueDAO.get).toHaveBeenCalled();
    expect(mockValueDAO.save).not.toHaveBeenCalled(); // 值未改变，不应该保存
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      [], // 没有实际变更的脚本
      expect.objectContaining({
        storageName: getStorageName(mockScript),
        storageChanges: {
          [mockScript.uuid]: [expectResponse("testId-4024", mockScript, 0)],
        },
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

  it("当脚本不存在时应该抛出错误，且不影响后续 setValues", async () => {
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

    // 顺序队列不应因单次错误而卡死，后续 setValues 正常处理
    const mockScript = createMockScript();
    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(undefined);
    vi.mocked(mockValueDAO.save).mockResolvedValue({} as any);
    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-4027",
      keyValuePairs: keyValuePairs1,
      valueSender: mockSender,
      isReplace: false,
    });
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(1);
  });

  it("同一 storageName 的并发 setValues 应合并为一次读写与一次推送", async () => {
    // 这个测试验证以 storageName 分组的批处理：
    // 排队期间累积的多个 setValues 由一次 setValuesByStorageName 集中处理
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

    // 先占住该 storageName 的处理队列，让两个 setValues 的任务都先入队
    const d = deferred();
    stackAsyncTask<void>(`${CACHE_KEY_SET_VALUE}${getStorageName(mockScript)}`, () => d.promise);

    // 并发执行两个setValue操作
    const keyValuePairs1 = [[key1, encodeRValue(value1)]] satisfies TKeyValuePair[];
    const keyValuePairs2 = [[key2, encodeRValue(value2)]] satisfies TKeyValuePair[];
    const ret = Promise.all([
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
    await nextMacroTask();
    // 队列被占住期间，两个任务都已入队但未处理
    expect(mockScriptDAO.get).toHaveBeenCalledTimes(2);
    expect(mockValueDAO.save).toHaveBeenCalledTimes(0);
    d.resolve();
    await ret;

    // 验证两个操作被合并为一次批处理
    expect(mockValueDAO.get).toHaveBeenCalledTimes(1);
    expect(mockValueDAO.save).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(1);
    expect(valueService.pushValueUpdate).toHaveBeenNthCalledWith(
      1,
      [mockScript],
      expect.objectContaining({
        storageName: getStorageName(mockScript),
        storageChanges: {
          [mockScript.uuid]: [
            expectResponse("testId-4041", mockScript, 1),
            expectResponse("testId-4042", mockScript, 1),
          ],
        },
      })
    );

    // 验证两个键都已写入同一份数据
    const saveCall = vi.mocked(mockValueDAO.save).mock.calls[0];
    const savedValue = saveCall[1];
    expect(savedValue.data[key1]).toBe(value1);
    expect(savedValue.data[key2]).toBe(value2);
  });

  it("setValues 的处理顺序应与调用顺序一致", async () => {
    // scriptDAO.get 的耗时差异不应打乱 setValues 的处理顺序
    const mockScript = createMockScript();
    const mockSender = createMockValueSender();
    const key = "orderKey";

    // 第一次调用的 scriptDAO.get 较慢，第二次立即返回
    vi.mocked(mockScriptDAO.get)
      .mockImplementationOnce(() => new Promise((r) => setTimeout(() => r(mockScript), 20)))
      .mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(undefined);
    vi.mocked(mockValueDAO.save).mockResolvedValue({} as any);

    // 占住处理队列，保证两个任务进入同一个批次以便观察顺序
    const d = deferred();
    stackAsyncTask<void>(`${CACHE_KEY_SET_VALUE}${getStorageName(mockScript)}`, () => d.promise);

    const ret = Promise.all([
      valueService.setValues({
        uuid: mockScript.uuid,
        id: "testId-4051",
        keyValuePairs: [[key, encodeRValue("first")]] satisfies TKeyValuePair[],
        valueSender: mockSender,
        isReplace: false,
      }),
      valueService.setValues({
        uuid: mockScript.uuid,
        id: "testId-4052",
        keyValuePairs: [[key, encodeRValue("second")]] satisfies TKeyValuePair[],
        valueSender: mockSender,
        isReplace: false,
      }),
    ]);
    await new Promise((r) => setTimeout(r, 50));
    d.resolve();
    await ret;

    // 后写的胜出：最终值必须是第二次调用的 "second"
    const saveCall = vi.mocked(mockValueDAO.save).mock.calls[0];
    expect(saveCall[1].data[key]).toBe("second");
    // 推送的响应顺序也与调用顺序一致
    expect(valueService.pushValueUpdate).toHaveBeenCalledTimes(1);
    const sendData = vi.mocked(valueService.pushValueUpdate).mock.calls[0][1];
    expect(sendData.storageChanges[mockScript.uuid].map((r) => r.id)).toEqual(["testId-4051", "testId-4052"]);
  });

  it("值变更时 updatetime 应严格递增", async () => {
    const mockScript = createMockScript();
    const mockSender = createMockValueSender();
    const existingValueModel: Value = {
      uuid: mockScript.uuid,
      storageName: getStorageName(mockScript),
      data: { k: "v0" },
      createtime: Date.now() - 1000,
      updatetime: Date.now() - 1000,
    };

    vi.mocked(mockScriptDAO.get).mockResolvedValue(mockScript);
    vi.mocked(mockValueDAO.get).mockResolvedValue(existingValueModel);
    const savedUpdatetimes: number[] = [];
    vi.mocked(mockValueDAO.save).mockImplementation((_storageName, model) => {
      savedUpdatetimes.push(model.updatetime);
      return Promise.resolve({} as any);
    });

    // 连续两次变更（同一时间片内也必须保证 updatetime 变化）
    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-4061",
      keyValuePairs: [["k", encodeRValue("v1")]] satisfies TKeyValuePair[],
      valueSender: mockSender,
      isReplace: false,
    });
    await valueService.setValues({
      uuid: mockScript.uuid,
      id: "testId-4062",
      keyValuePairs: [["k", encodeRValue("v2")]] satisfies TKeyValuePair[],
      valueSender: mockSender,
      isReplace: false,
    });

    expect(savedUpdatetimes).toHaveLength(2);
    expect(savedUpdatetimes[0]).toBeGreaterThan(existingValueModel.createtime);
    expect(savedUpdatetimes[1]).toBeGreaterThan(savedUpdatetimes[0]);
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

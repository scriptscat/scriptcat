import { initTestEnv } from "@Tests/utils";
import { RuntimeService } from "./runtime";
import { vi, describe, it, expect, beforeEach, type MockedFunction } from "vitest";
import { randomUUID } from "crypto";
import type { Script, ScriptRunResource } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { getCombinedMeta } from "./utils";
import type { SystemConfig } from "@App/pkg/config/config";
import type { Group } from "@Packages/message/server";
import type { ServiceWorkerMessageSend, WindowMessageBody } from "@Packages/message/window_message";
import type { TMessageQueueGroup } from "@Packages/message/message_queue";
import type { ValueService } from "./value";
import type { ScriptService } from "./script";
import type { ResourceService } from "./resource";
import type { ScriptDAO } from "@App/app/repo/scripts";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import type { MessageConnect, TMessage } from "@Packages/message/types";

initTestEnv();

describe("RuntimeService - getAndSetUserScriptRegister 脚本匹配", () => {
  let runtime: RuntimeService;
  let mockSystemConfig: {
    getBlacklist: MockedFunction<() => string>;
  };
  let mockScriptService: {
    buildScriptRunResource: MockedFunction<(script: Script, scriptFlag?: string) => ScriptRunResource>;
  };

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
      match: ["http://www.example.com/*"],
    },
    ...overrides,
  });

  const createScriptRunResource = (script: Script): ScriptRunResource => {
    let metadata = { ...script.metadata };
    const { match, include, exclude } = metadata;
    const originalMetadata = { match, include, exclude }; // 目前只需要 match, include, exclude
    if (script.selfMetadata) {
      metadata = getCombinedMeta(script.metadata, script.selfMetadata);
    }
    return {
      ...script,
      code: "// test code",
      flag: "",
      value: {},
      resource: {},
      metadata,
      originalMetadata,
    };
  };

  beforeEach(() => {
    // 创建所有必需的mock对象
    mockSystemConfig = {
      getBlacklist: vi.fn().mockReturnValue(""),
    };

    mockScriptService = {
      buildScriptRunResource: vi.fn(),
    };

    const mockGroup = {
      use: vi.fn().mockReturnThis(),
    } as unknown as Group;
    const mockSender = {
      async init() {},
      messageHandle(_data: WindowMessageBody) {},
      async connect(_data: TMessage): Promise<MessageConnect> {
        return {} as MessageConnect;
      },
      async sendMessage<T = any>(_data: TMessage): Promise<T> {
        return {} as T;
      },
    } as ServiceWorkerMessageSend;
    const mockMessageQueue = {
      group: vi.fn().mockReturnValue(mockGroup),
    } as unknown as TMessageQueueGroup;
    const mockValueService = {} as ValueService;
    const mockResourceService = {} as ResourceService;
    const mockScriptDAO = {
      all: vi.fn().mockResolvedValue([]),
    } as unknown as ScriptDAO;
    const mockLocalStorageDAO = new LocalStorageDAO();

    runtime = new RuntimeService(
      mockSystemConfig as unknown as SystemConfig,
      mockGroup,
      mockSender,
      mockMessageQueue,
      mockValueService,
      mockScriptService as unknown as ScriptService,
      mockResourceService,
      mockScriptDAO,
      mockLocalStorageDAO
    );
  });

  describe("脚本匹配基础功能", () => {
    it("应该匹配没有自定义metadata的脚本", async () => {
      // Arrange
      const script = createMockScript({
        metadata: {
          match: ["http://www.example.com/*"],
        },
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.buildAndSetScriptMatchInfo(script);
      expect(scriptMatchInfo).toBeDefined();
      const result = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/path");

      // Assert
      expect(mockScriptService.buildScriptRunResource).toHaveBeenCalledWith(script, script.uuid);
      expect(result.has(script.uuid)).toBe(true);

      const matchInfo = result.get(script.uuid);
      expect(matchInfo).toBeDefined();
      expect(matchInfo!.effective).toBe(true);
    });

    it("应该正确处理被自定义规则排除的脚本", async () => {
      // Arrange
      const script = createMockScript({
        metadata: {
          match: ["http://www.example.com/*"],
        },
        selfMetadata: {
          exclude: ["http://www.example.com/*"],
        },
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.buildAndSetScriptMatchInfo(script);
      expect(scriptMatchInfo).toBeDefined();

      // 测试默认查询（不包含无效匹配）
      const defaultResult = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/path");

      // 测试包含无效匹配的查询
      const allResult = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/path", true);

      // Assert
      expect(mockScriptService.buildScriptRunResource).toHaveBeenCalledWith(script, script.uuid);

      // 默认查询应该不包含被排除的脚本
      expect(defaultResult.has(script.uuid)).toBe(false);

      // 包含无效匹配的查询应该包含被排除的脚本，但标记为无效
      expect(allResult.has(script.uuid)).toBe(true);
      const matchInfo = allResult.get(script.uuid);
      expect(matchInfo).toBeDefined();
      expect(matchInfo!.effective).toBe(false);
    });
  });

  describe("脚本匹配边界情况", () => {
    it("应该正确处理多个匹配规则的脚本", async () => {
      // Arrange
      const script = createMockScript({
        metadata: {
          match: ["http://www.example.com/*", "https://www.test.com/*"],
          include: ["*://*/api/*"],
        },
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.buildAndSetScriptMatchInfo(script);
      expect(scriptMatchInfo).toBeDefined();

      // 测试匹配第一个规则
      const result1 = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/path");
      // 测试匹配第二个规则
      const result2 = await runtime.getPageScriptMatchingResultByUrl("https://www.test.com/page");
      // 测试匹配include规则
      const result3 = await runtime.getPageScriptMatchingResultByUrl("https://example.org/api/users");
      // 测试不匹配的URL
      const result4 = await runtime.getPageScriptMatchingResultByUrl("https://other.com/page");

      // Assert
      expect(result1.has(script.uuid)).toBe(true);
      expect(result1.get(script.uuid)?.effective).toBe(true);

      expect(result2.has(script.uuid)).toBe(true);
      expect(result2.get(script.uuid)?.effective).toBe(true);

      expect(result3.has(script.uuid)).toBe(true);
      expect(result3.get(script.uuid)?.effective).toBe(true);

      expect(result4.has(script.uuid)).toBe(false);
    });

    it("应该正确处理include和exclude规则的优先级", async () => {
      // Arrange
      const script = createMockScript({
        metadata: {
          include: ["*://www.example.com/*"],
        },
        selfMetadata: {
          exclude: ["*://www.example.com/admin/*"],
        },
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.buildAndSetScriptMatchInfo(script);
      expect(scriptMatchInfo).toBeDefined();

      // 测试被include但不被exclude的URL
      const includeResult = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/user");
      // 测试被include但也被exclude的URL
      const excludeResult = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/admin/panel");
      // 测试被include但也被exclude的URL（包含无效匹配）
      const excludeAllResult = await runtime.getPageScriptMatchingResultByUrl(
        "http://www.example.com/admin/panel",
        true
      );

      // Assert
      expect(includeResult.has(script.uuid)).toBe(true);
      expect(includeResult.get(script.uuid)?.effective).toBe(true);

      expect(excludeResult.has(script.uuid)).toBe(false);

      expect(excludeAllResult.has(script.uuid)).toBe(true);
      expect(excludeAllResult.get(script.uuid)?.effective).toBe(false);
    });

    it("应该正确处理黑名单规则", async () => {
      // Arrange
      mockSystemConfig.getBlacklist.mockReturnValue("*://www.blacklisted.com/*");

      const script = createMockScript({
        metadata: {
          match: ["*://*/*"],
        },
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.buildAndSetScriptMatchInfo(script);
      expect(scriptMatchInfo).toBeDefined();

      // 测试正常URL
      const normalResult = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/page");
      // 测试黑名单URL
      const blacklistResult = await runtime.getPageScriptMatchingResultByUrl("http://www.blacklisted.com/page");
      // 黑名单中的无效匹配
      const blacklistAllResult = await runtime.getPageScriptMatchingResultByUrl(
        "http://www.blacklisted.com/page",
        true
      );

      // Assert
      expect(normalResult.has(script.uuid)).toBe(true);
      expect(normalResult.get(script.uuid)?.effective).toBe(true);

      expect(blacklistResult.has(script.uuid)).toBe(false);

      expect(blacklistAllResult.has(script.uuid)).toBe(false);
    });
  });

  describe("错误处理", () => {
    it("应该正确处理buildScriptRunResource抛出异常的情况", async () => {
      // Arrange
      const script = createMockScript();
      mockScriptService.buildScriptRunResource.mockImplementation(() => {
        throw new Error("Build script run resource failed");
      });

      // Act & Assert
      await expect(runtime.buildAndSetScriptMatchInfo(script)).rejects.toThrow("Build script run resource failed");
    });

    it("应该正确处理空metadata的脚本", async () => {
      // Arrange
      const script = createMockScript({
        metadata: {},
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.buildAndSetScriptMatchInfo(script);
      expect(scriptMatchInfo).toBeUndefined();
      const result = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/path");

      // Assert
      expect(result.has(script.uuid)).toBe(false);
    });
  });
  describe("测试脚本重新加载", () => {
    it("应该正确处理脚本的重新加载", async () => {
      // Arrange
      const script = createMockScript();
      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.buildAndSetScriptMatchInfo(script);
      expect(scriptMatchInfo).toBeDefined();

      // Assert
      const result = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/path");
      expect(result.has(script.uuid)).toBe(true);

      // 清空缓存之类的数据后再次操作
      runtime.scriptMatchCache = null;
      const resultAfterClear = await runtime.getPageScriptMatchingResultByUrl("http://www.example.com/path");
      expect(resultAfterClear.has(script.uuid)).toBe(true);
      expect(runtime.loadingScript).toBeNull();
    });
  });
});

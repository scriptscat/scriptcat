import { initTestEnv } from "@Tests/utils";
import { RuntimeService } from "./runtime";
import { vi, describe, it, expect, beforeEach, type MockedFunction } from "vitest";
import { randomUUID } from "crypto";
import type { Script, ScriptRunResource } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { getCombinedMeta } from "./utils";
import type { SystemConfig } from "@App/pkg/config/config";
import type { Group } from "@Packages/message/server";
import type { ServiceWorkerMessageSend, WindowMessageBody } from "@Packages/message/window_message";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { ValueService } from "./value";
import type { ScriptService } from "./script";
import type { ResourceService } from "./resource";
import type { ScriptDAO } from "@App/app/repo/scripts";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import { obtainBlackList } from "@App/pkg/utils/utils";

initTestEnv();

describe.concurrent("RuntimeService - getPageScriptMatchingResultByUrl 脚本匹配", () => {
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
      match: ["https://www.example.com/*"],
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
    } as unknown as IMessageQueue;
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

  describe.concurrent("脚本匹配基础功能", () => {
    it.concurrent("应该匹配没有自定义metadata的脚本", async () => {
      // Arrange
      const script = createMockScript({
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(scriptMatchInfo).toBeDefined();
      const result = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/path");

      // Assert
      // expect(mockScriptService.buildScriptRunResource).toHaveBeenCalledWith(script);
      expect(result.has(script.uuid)).toBe(true);

      const matchInfo = result.get(script.uuid);
      expect(matchInfo).toBeDefined();
      expect(matchInfo!.effective).toBe(true);
    });

    it.concurrent("应该正确处理被自定义规则排除的脚本", async () => {
      // Arrange
      const script = createMockScript({
        metadata: {
          match: ["https://www.example.com/*"],
        },
        selfMetadata: {
          exclude: ["https://www.example.com/*"],
        },
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(scriptMatchInfo).toBeDefined();

      // 测试默认查询（不包含无效匹配）
      const defaultResult = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/path");

      // 测试包含无效匹配的查询
      const allResult = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/path", true, true);

      // Assert
      // expect(mockScriptService.buildScriptRunResource).toHaveBeenCalledWith(script);

      // 默认查询应该不包含被排除的脚本
      expect(defaultResult.has(script.uuid)).toBe(false);

      // 包含无效匹配的查询应该包含被排除的脚本，但标记为无效
      expect(allResult.has(script.uuid)).toBe(true);
      const matchInfo = allResult.get(script.uuid);
      expect(matchInfo).toBeDefined();
      expect(matchInfo!.effective).toBe(false);
    });
  });

  describe.concurrent("脚本匹配边界情况", () => {
    it.concurrent("应该正确处理多个匹配规则的脚本", async () => {
      // Arrange
      const script = createMockScript({
        metadata: {
          match: ["https://www.example.com/*", "https://www.test.com/*"],
          include: ["*://*/api/*"],
        },
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(scriptMatchInfo).toBeDefined();

      // 测试匹配第一个规则
      const result1 = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/path");
      // 测试匹配第二个规则
      const result2 = runtime.getPageScriptMatchingResultByUrl("https://www.test.com/page");
      // 测试匹配include规则
      const result3 = runtime.getPageScriptMatchingResultByUrl("https://example.org/api/users");
      // 测试不匹配的URL
      const result4 = runtime.getPageScriptMatchingResultByUrl("https://other.com/page");

      // Assert
      expect(result1.has(script.uuid)).toBe(true);
      expect(result1.get(script.uuid)?.effective).toBe(true);

      expect(result2.has(script.uuid)).toBe(true);
      expect(result2.get(script.uuid)?.effective).toBe(true);

      expect(result3.has(script.uuid)).toBe(true);
      expect(result3.get(script.uuid)?.effective).toBe(true);

      expect(result4.has(script.uuid)).toBe(false);
    });

    it.concurrent("应该正确处理include和exclude规则的优先级", async () => {
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
      const scriptMatchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(scriptMatchInfo).toBeDefined();

      // 测试被include但不被exclude的URL
      const includeResult = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/user");
      // 测试被include但也被exclude的URL
      const excludeResult = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/admin/panel");
      // 测试被include但也被exclude的URL（包含无效匹配）
      const excludeAllResult = runtime.getPageScriptMatchingResultByUrl(
        "https://www.example.com/admin/panel",
        true,
        true
      );

      // Assert
      expect(includeResult.has(script.uuid)).toBe(true);
      expect(includeResult.get(script.uuid)?.effective).toBe(true);

      expect(excludeResult.has(script.uuid)).toBe(false);

      expect(excludeAllResult.has(script.uuid)).toBe(true);
      expect(excludeAllResult.get(script.uuid)?.effective).toBe(false);
    });
  });

  describe.concurrent("错误处理", () => {
    // it.concurrent("应该正确处理buildScriptRunResource抛出异常的情况", async () => {
    //   // Arrange
    //   const script = createMockScript();
    //   mockScriptService.buildScriptRunResource.mockImplementation(() => {
    //     throw new Error("Build script run resource failed");
    //   });

    //   // Act & Assert
    //   await expect(runtime.applyScriptMatchInfo(script)).rejects.toThrow("Build script run resource failed");
    // });

    it.concurrent("应该正确处理空metadata的脚本", async () => {
      // Arrange
      const script = createMockScript({
        metadata: {},
      });

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(scriptMatchInfo).toBeUndefined();
      const result = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/path");

      // Assert
      expect(result.has(script.uuid)).toBe(false);
    });
  });

  describe.concurrent("includeDisabled 选项", () => {
    it.concurrent("当 includeDisabled=false 时不返回禁用脚本；当 includeDisabled=true 时返回禁用脚本", async () => {
      // Arrange
      // 启用脚本
      const enabledScript = createMockScript({
        metadata: {
          match: ["https://www.example.com/*"],
        },
        status: SCRIPT_STATUS_ENABLE,
      });

      // 禁用脚本
      const disabledScript = createMockScript({
        metadata: {
          match: ["https://www.example.com/*"],
        },
        status: SCRIPT_STATUS_DISABLE,
      });

      const enabledRunResource = createScriptRunResource(enabledScript);
      const disabledRunResource = createScriptRunResource(disabledScript);

      mockScriptService.buildScriptRunResource
        .mockReturnValueOnce(enabledRunResource)
        .mockReturnValueOnce(disabledRunResource);

      // Act
      // 先应用匹配信息（内部应分别记录到 enable/disable 的匹配器中）
      const enabledMatchInfo = await runtime.applyScriptMatchInfo(enabledRunResource);
      const disabledMatchInfo = await runtime.applyScriptMatchInfo(disabledRunResource);

      expect(enabledMatchInfo).toBeDefined();
      expect(disabledMatchInfo).toBeDefined();

      // 默认查询（不包含禁用）
      const defaultResult = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/path");
      // 包含禁用脚本的查询
      const withDisabledResult = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/path", true);

      // Assert
      // 默认不包含禁用脚本
      expect(defaultResult.has(enabledScript.uuid)).toBe(true);
      expect(defaultResult.get(enabledScript.uuid)?.effective).toBe(true);
      expect(defaultResult.has(disabledScript.uuid)).toBe(false);

      // includeDisabled=true 时应包含禁用脚本
      expect(withDisabledResult.has(enabledScript.uuid)).toBe(true);
      expect(withDisabledResult.get(enabledScript.uuid)?.effective).toBe(true);

      expect(withDisabledResult.has(disabledScript.uuid)).toBe(true);
      // 禁用脚本在匹配器中同样是“命中”的，故 effective=true
      expect(withDisabledResult.get(disabledScript.uuid)?.effective).toBe(true);
    });
  });

  describe.concurrent("黑名單測試", async () => {
    it.concurrent("黑名單測試 A", async () => {
      // Arrange
      const blacklistString = "*://www.blacklisted.com/*";
      mockSystemConfig.getBlacklist.mockReturnValue(blacklistString);
      runtime.blacklist = obtainBlackList(blacklistString); //  this.systemConfig.addListener("blacklist", ... ) 裡自動更新 blacklist
      runtime.loadBlacklist();
      expect(runtime.blackMatch?.rulesMap?.size || 0).toBe(1);
      expect(runtime.blackMatch?.rulesMap.get("BK")?.length || 0).toBe(1);
      expect(runtime.blacklistExcludeMatches?.length || 0).toBe(1);
      expect(runtime.blacklistExcludeGlobs?.length || 0).toBe(0);

      // 测试正常URL
      const normalResult = runtime.isUrlBlacklist("https://www.example.com/page");
      // 测试黑名单URL
      const blacklistResult = runtime.isUrlBlacklist("https://www.blacklisted.com/page");

      // Assert
      expect(normalResult).toBe(false);

      expect(blacklistResult).toBe(true);
    });

    it.concurrent("黑名單測試 B", async () => {
      // Arrange
      const blacklistString = "*://www.blacklisted.com/*\nhttps://*.google.com/*";
      mockSystemConfig.getBlacklist.mockReturnValue(blacklistString);
      runtime.blacklist = obtainBlackList(blacklistString); //  this.systemConfig.addListener("blacklist", ... ) 裡自動更新 blacklist
      runtime.loadBlacklist();
      expect(runtime.blackMatch?.rulesMap?.size || 0).toBe(1);
      expect(runtime.blackMatch?.rulesMap.get("BK")?.length || 0).toBe(2);
      expect(runtime.blacklistExcludeMatches?.length || 0).toBe(1);
      expect(runtime.blacklistExcludeGlobs?.length || 0).toBe(1);

      // 测试正常URL
      const normalResult1 = runtime.isUrlBlacklist("https://www.example.com/page");
      // 测试黑名单URL
      const blacklistResult1 = runtime.isUrlBlacklist("https://www.blacklisted.com/page");
      // 测试黑名单URL
      const blacklistResult2 = runtime.isUrlBlacklist("https://www.google.com/page");
      // 测试正常URL
      const normalResult2 = runtime.isUrlBlacklist("https://www.google.cn/page");

      // Assert
      expect(normalResult1).toBe(false);
      expect(blacklistResult1).toBe(true);
      expect(blacklistResult2).toBe(true);
      expect(normalResult2).toBe(false);
    });
  });
});

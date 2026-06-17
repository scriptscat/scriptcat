import { initTestEnv } from "@Tests/utils";
import { RuntimeService } from "./runtime";
import { vi, describe, it, expect, beforeEach, type MockedFunction } from "vitest";
import { randomUUID } from "crypto";
import type { Script, ScriptRunResource } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { getCombinedMeta, scriptURLPatternResults } from "./utils";
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
import type { CompiledResource } from "@App/app/repo/resource";

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

  const createRuntimeTestContext = () => {
    const localMockSystemConfig = {
      getBlacklist: vi.fn().mockReturnValue(""),
    };

    const localMockScriptService = {
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
    const localMockScriptDAO = {
      all: vi.fn().mockResolvedValue([]),
    };
    const mockLocalStorageDAO = new LocalStorageDAO();

    const localRuntime = new RuntimeService(
      localMockSystemConfig as unknown as SystemConfig,
      mockGroup,
      mockSender,
      mockMessageQueue,
      mockValueService,
      localMockScriptService as unknown as ScriptService,
      mockResourceService,
      localMockScriptDAO as unknown as ScriptDAO,
      mockLocalStorageDAO
    );

    return {
      runtime: localRuntime,
      mockSystemConfig: localMockSystemConfig,
      mockScriptService: localMockScriptService,
      mockScriptDAO: localMockScriptDAO,
    };
  };

  beforeEach(() => {
    // 创建所有必需的mock对象
    const context = createRuntimeTestContext();
    runtime = context.runtime;
    mockSystemConfig = context.mockSystemConfig;
    mockScriptService = context.mockScriptService;
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
      const allResult = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/path", true);

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
      const excludeAllResult = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/admin/panel", true);

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
      // The top-level suite is concurrent, so this test must not use the shared
      // runtime/mockScriptDAO variables while awaiting Popup's lazy disabled matcher.
      const { runtime, mockScriptDAO, mockScriptService } = createRuntimeTestContext();

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
      // Enabled rules are written eagerly; disabled rules are built lazily from DAO for Popup.
      const enabledMatchInfo = await runtime.applyScriptMatchInfo(enabledRunResource);
      const disabledMatchInfo = await runtime.applyScriptMatchInfo(disabledRunResource);
      mockScriptDAO.all.mockResolvedValue([disabledScript]);

      expect(enabledMatchInfo).toBeDefined();
      expect(disabledMatchInfo).toBeDefined();

      // 默认查询（不包含禁用）
      const defaultResult = runtime.getPageScriptMatchingResultByUrl("https://www.example.com/path");
      // Popup 查询包含禁用脚本
      const withDisabledResult = await runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/path");

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

  describe("redo matcher cache behavior", () => {
    it("安装或排序更新后，已缓存 URL 的下一次匹配顺序应立即反映新 sort", async () => {
      const { runtime } = createRuntimeTestContext();
      const slowScript = createMockScript({ sort: 20 });
      const fastScript = createMockScript({ sort: 10 });
      await runtime.applyScriptMatchInfo(createScriptRunResource(slowScript));
      await runtime.applyScriptMatchInfo(createScriptRunResource(fastScript));

      const url = "https://www.example.com/path";
      expect([...runtime.getPageScriptMatchingResultByUrl(url).keys()]).toEqual([slowScript.uuid, fastScript.uuid]);

      (runtime as any).updateSorter((next: Record<string, number>) => {
        (runtime as any).setScriptSort(next, slowScript);
        (runtime as any).setScriptSort(next, fastScript);
      });

      expect([...runtime.getPageScriptMatchingResultByUrl(url).keys()]).toEqual([fastScript.uuid, slowScript.uuid]);
    });

    it("两个 RuntimeService 实例的 sorter 互不影响", async () => {
      const { runtime, mockSystemConfig, mockScriptService, mockScriptDAO } = createRuntimeTestContext();
      const scriptA = createMockScript({ sort: 2 });
      const scriptB = createMockScript({ sort: 1 });
      const anotherRuntime = new RuntimeService(
        mockSystemConfig as unknown as SystemConfig,
        { use: vi.fn().mockReturnThis() } as unknown as Group,
        {} as ServiceWorkerMessageSend,
        { group: vi.fn().mockReturnValue({ use: vi.fn().mockReturnThis() }) } as unknown as IMessageQueue,
        {} as ValueService,
        mockScriptService as unknown as ScriptService,
        {} as ResourceService,
        mockScriptDAO as unknown as ScriptDAO,
        new LocalStorageDAO()
      );

      await runtime.applyScriptMatchInfo(createScriptRunResource(scriptA));
      await runtime.applyScriptMatchInfo(createScriptRunResource(scriptB));
      await anotherRuntime.applyScriptMatchInfo(createScriptRunResource(scriptA));
      await anotherRuntime.applyScriptMatchInfo(createScriptRunResource(scriptB));

      (runtime as any).updateSorter((next: Record<string, number>) => {
        (runtime as any).setScriptSort(next, scriptA);
        (runtime as any).setScriptSort(next, scriptB);
      });

      const url = "https://www.example.com/path";
      expect([...runtime.getPageScriptMatchingResultByUrl(url).keys()]).toEqual([scriptB.uuid, scriptA.uuid]);
      expect([...anotherRuntime.getPageScriptMatchingResultByUrl(url).keys()]).toEqual([scriptA.uuid, scriptB.uuid]);
    });
  });

  describe("Popup disabled matcher lazy cache", () => {
    it("构建 disabled matcher 期间失效不会丢失，本次 Popup 会重取最新快照", async () => {
      const { runtime, mockScriptDAO } = createRuntimeTestContext();
      const staleDisabled = createMockScript({ status: SCRIPT_STATUS_DISABLE, name: "stale" });
      const latestDisabled = createMockScript({ status: SCRIPT_STATUS_DISABLE, name: "latest" });
      let resolveFirst!: (scripts: Script[]) => void;
      mockScriptDAO.all
        .mockImplementationOnce(() => new Promise<Script[]>((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce([latestDisabled]);

      const popupResult = runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/path");
      (runtime as any).invalidateDisabledMatcher();
      resolveFirst([staleDisabled]);

      const result = await popupResult;
      expect(result.has(staleDisabled.uuid)).toBe(false);
      expect(result.has(latestDisabled.uuid)).toBe(true);
      expect(mockScriptDAO.all).toHaveBeenCalledTimes(2);
    });

    it("并发 Popup 请求共享同一次 disabled matcher 构建", async () => {
      const { runtime, mockScriptDAO } = createRuntimeTestContext();
      const disabledScript = createMockScript({ status: SCRIPT_STATUS_DISABLE });
      mockScriptDAO.all.mockResolvedValue([disabledScript]);

      const [first, second] = await Promise.all([
        runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/path"),
        runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/path"),
      ]);

      expect(first.has(disabledScript.uuid)).toBe(true);
      expect(second.has(disabledScript.uuid)).toBe(true);
      expect(mockScriptDAO.all).toHaveBeenCalledTimes(1);
    });
  });

  describe("getScriptsForTab 页面脚本加载与缓存", () => {
    const pageUrl = "https://www.example.com/path";

    const createCacheTestContext = () => {
      const { runtime, mockScriptDAO } = createRuntimeTestContext();

      const script = createMockScript({
        metadata: { match: ["https://www.example.com/*"] },
        status: SCRIPT_STATUS_ENABLE,
        createtime: 1000,
        updatetime: 2000,
      });

      const scriptRes = createScriptRunResource(script);
      const patterns = scriptURLPatternResults(scriptRes)!;
      const compiledResource: CompiledResource = {
        name: script.name,
        flag: "",
        uuid: script.uuid,
        require: [],
        matches: ["https://www.example.com/*"],
        includeGlobs: [],
        excludeMatches: [],
        excludeGlobs: [],
        allFrames: false,
        world: "USER_SCRIPT",
        runAt: "document-idle",
        scriptUrlPatterns: patterns.scriptUrlPatterns,
        originalUrlPatterns: null,
      };

      const mockCompiledResourceDAO = {
        gets: vi.fn().mockResolvedValue([compiledResource]),
        get: vi.fn().mockResolvedValue(compiledResource),
        save: vi.fn().mockResolvedValue(undefined),
      };

      const mockScriptCodeDAO = {
        get: vi.fn().mockResolvedValue({ code: "// test code" }),
      };

      const mockResourceService = {
        getScriptResources: vi.fn().mockResolvedValue({}),
      };

      const mockValueService = {
        getScriptValue: vi.fn().mockResolvedValue({}),
      };

      (mockScriptDAO as any).gets = vi.fn().mockResolvedValue([script]);
      (mockScriptDAO as any).scriptCodeDAO = mockScriptCodeDAO;
      runtime.compiledResourceDAO = mockCompiledResourceDAO as any;
      (runtime as any).resource = mockResourceService;
      (runtime as any).value = mockValueService;

      return {
        runtime,
        script,
        scriptRes,
        compiledResource,
        mockCompiledResourceDAO,
        mockScriptCodeDAO,
        mockResourceService,
        mockValueService,
        mockScriptDAO,
      };
    };

    it("首次加载时从 compiledResourceDAO 获取 compiledResource 并写入缓存，返回脚本信息", async () => {
      const { runtime, script, scriptRes, mockCompiledResourceDAO, mockScriptCodeDAO, mockValueService } =
        createCacheTestContext();
      await runtime.applyScriptMatchInfo(scriptRes);

      const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });

      expect(result).not.toBeNull();
      expect(mockCompiledResourceDAO.gets).toHaveBeenCalledTimes(1);
      expect(mockScriptCodeDAO.get).toHaveBeenCalledWith(script.uuid);
      expect(mockValueService.getScriptValue).toHaveBeenCalledTimes(1);
      expect(result!.injectScriptList.length + result!.contentScriptList.length).toBe(1);
    });

    it("第二次请求命中缓存，不再调用 compiledResourceDAO，但每次都重新加载 value", async () => {
      const { runtime, scriptRes, mockCompiledResourceDAO, mockScriptCodeDAO, mockValueService } =
        createCacheTestContext();
      await runtime.applyScriptMatchInfo(scriptRes);

      await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });
      await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });

      expect(mockCompiledResourceDAO.gets).toHaveBeenCalledTimes(1);
      expect(mockScriptCodeDAO.get).toHaveBeenCalledTimes(1);
      expect(mockValueService.getScriptValue).toHaveBeenCalledTimes(2);
    });

    it("deleteScriptRuntimeCache 后下一次请求重新从 DAO 获取 compiledResource", async () => {
      const { runtime, script, scriptRes, mockCompiledResourceDAO } = createCacheTestContext();
      await runtime.applyScriptMatchInfo(scriptRes);

      await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });
      expect(mockCompiledResourceDAO.gets).toHaveBeenCalledTimes(1);

      (runtime as any).deleteScriptRuntimeCache(script.uuid);

      await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });
      expect(mockCompiledResourceDAO.gets).toHaveBeenCalledTimes(2);
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

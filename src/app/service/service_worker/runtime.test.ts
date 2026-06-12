import { initTestEnv } from "@Tests/utils";
import { RuntimeService } from "./runtime";
import { vi, describe, it, expect, beforeEach, type MockedFunction } from "vitest";
import { randomUUID } from "crypto";
import type { Script, ScriptRunResource } from "@App/app/repo/scripts";
import {
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
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
import type { CompiledResource, Resource } from "@App/app/repo/resource";

initTestEnv();

describe("RuntimeService - getPageScriptMatchingResultByUrl 脚本匹配", () => {
  let runtime: RuntimeService;
  let mockSystemConfig: {
    getBlacklist: MockedFunction<() => string>;
  };
  let mockScriptService: {
    buildScriptRunResource: MockedFunction<(script: Script, scriptFlag?: string) => ScriptRunResource>;
  };
  let mockValueService: {
    getScriptValue: MockedFunction<(script: Script) => Promise<Record<string, any>>>;
  };
  let mockResourceService: {
    getScriptResources: MockedFunction<(script: Script, load: boolean) => Promise<Record<string, any>>>;
    updateResource: MockedFunction<(uuid: string, url: string, type: any) => Promise<any>>;
  };
  let mockScriptDAO: {
    all: MockedFunction<() => Promise<Script[]>>;
    gets: MockedFunction<(uuids: string[]) => Promise<(Script | undefined)[]>>;
    scriptCodeDAO: {
      get: MockedFunction<(uuid: string) => Promise<{ uuid: string; code: string } | undefined>>;
    };
  };

  const updateMockScripts = async (scripts: Script[]) => {
    mockScriptDAO.all.mockResolvedValue(scripts);
    runtime.scriptMatchDisable = await runtime.createPopupDisabledScriptMatch();
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

  const createUserScriptCode = (script: Script, body = "console.log('test');") =>
    [
      "// ==UserScript==",
      `// @name ${script.name}`,
      `// @namespace ${script.namespace}`,
      ...(script.metadata.match || []).map((item) => `// @match ${item}`),
      ...(script.metadata.include || []).map((item) => `// @include ${item}`),
      "// ==/UserScript==",
      body,
    ].join("\n");

  const createCompiledResourceAsync = async (
    script: Script,
    scriptRunResource: ScriptRunResource
  ): Promise<CompiledResource> => {
    const matchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
    expect(matchInfo).toBeDefined();
    return {
      name: script.name,
      flag: scriptRunResource.flag,
      uuid: script.uuid,
      require: [],
      matches: script.metadata.match || ["https://www.example.com/*"],
      includeGlobs: [],
      excludeMatches: [],
      excludeGlobs: [],
      allFrames: !script.metadata.noframes,
      world: script.metadata["inject-into"]?.[0] === "content" ? "USER_SCRIPT" : "MAIN",
      runAt: "",
      scriptUrlPatterns: matchInfo!.scriptUrlPatterns,
      originalUrlPatterns:
        matchInfo!.originalUrlPatterns === matchInfo!.scriptUrlPatterns ? null : matchInfo!.originalUrlPatterns,
    };
  };

  const createTextResource = (url: string, content: string, sha512: string): Resource => ({
    url,
    content,
    base64: "base64",
    hash: {
      md5: "",
      sha1: "",
      sha256: "",
      sha384: "",
      sha512,
    },
    type: "require",
    link: {},
    contentType: "text/javascript",
    createtime: 1,
    updatetime: 1,
  });

  beforeEach(() => {
    // 创建所有必需的mock对象
    mockSystemConfig = {
      getBlacklist: vi.fn().mockReturnValue(""),
    };

    mockScriptService = {
      buildScriptRunResource: vi.fn(),
    };
    mockValueService = {
      getScriptValue: vi.fn(),
    };
    mockResourceService = {
      getScriptResources: vi.fn(),
      updateResource: vi.fn(),
    };
    mockScriptDAO = {
      all: vi.fn().mockResolvedValue([]),
      gets: vi.fn().mockResolvedValue([]),
      scriptCodeDAO: {
        get: vi.fn(),
      },
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
    const mockLocalStorageDAO = new LocalStorageDAO();

    runtime = new RuntimeService(
      mockSystemConfig as unknown as SystemConfig,
      mockGroup,
      mockSender,
      mockMessageQueue,
      mockValueService as unknown as ValueService,
      mockScriptService as unknown as ScriptService,
      mockResourceService as unknown as ResourceService,
      mockScriptDAO as unknown as ScriptDAO,
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
      const result = runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/path");

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

      await updateMockScripts([script]);

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(scriptMatchInfo).toBeDefined();

      // 测试默认查询（不包含无效匹配）
      const defaultResult = runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/path");

      // 测试包含无效匹配的查询
      const allResult = runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/path", true, true);

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
      await updateMockScripts([script]);

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(scriptMatchInfo).toBeDefined();

      // 测试匹配第一个规则
      const result1 = runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/path");
      // 测试匹配第二个规则
      const result2 = runtime.getPageScriptMatchingResultByUrlInternal("https://www.test.com/page");
      // 测试匹配include规则
      const result3 = runtime.getPageScriptMatchingResultByUrlInternal("https://example.org/api/users");
      // 测试不匹配的URL
      const result4 = runtime.getPageScriptMatchingResultByUrlInternal("https://other.com/page");

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
      await updateMockScripts([script]);

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(scriptMatchInfo).toBeDefined();

      // 测试被include但不被exclude的URL
      const includeResult = runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/user");
      // 测试被include但也被exclude的URL
      const excludeResult = runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/admin/panel");
      // 测试被include但也被exclude的URL（包含无效匹配）
      const excludeAllResult = runtime.getPageScriptMatchingResultByUrlInternal(
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
      await updateMockScripts([script]);

      const scriptRunResource = createScriptRunResource(script);
      mockScriptService.buildScriptRunResource.mockReturnValue(scriptRunResource);

      // Act
      const scriptMatchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(scriptMatchInfo).toBeUndefined();
      const result = runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/path");

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

      await updateMockScripts([disabledScript, disabledScript]);
      runtime.scriptMatchDisable = await runtime.createPopupDisabledScriptMatch();

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
      const defaultResult = runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/path");
      // 包含禁用脚本的查询
      const withDisabledResult = runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/path", true);

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

  describe("getScriptsForTab cache", () => {
    it("应该复用静态脚本信息，只在每次页面加载时刷新 value", async () => {
      const script = createMockScript({
        uuid: "cache-script",
        metadata: {
          match: ["https://www.example.com/*"],
        },
        updatetime: 100,
      });
      await updateMockScripts([script]);
      const scriptRunResource = createScriptRunResource(script);
      const matchInfo = await runtime.applyScriptMatchInfo(scriptRunResource);
      expect(matchInfo).toBeDefined();

      const compiledResource = {
        name: script.name,
        flag: scriptRunResource.flag,
        uuid: script.uuid,
        require: [],
        matches: ["https://www.example.com/*"],
        includeGlobs: [],
        excludeMatches: [],
        excludeGlobs: [],
        allFrames: true,
        world: "MAIN",
        runAt: "",
        scriptUrlPatterns: matchInfo!.scriptUrlPatterns,
        originalUrlPatterns: null,
      };
      const compiledResourceDAO = {
        gets: vi.fn().mockResolvedValue([compiledResource]),
      };
      runtime.compiledResourceDAO = compiledResourceDAO as any;

      mockScriptDAO.gets.mockResolvedValue([script]);
      mockScriptDAO.scriptCodeDAO.get.mockResolvedValue({
        uuid: script.uuid,
        code: [
          "// ==UserScript==",
          "// @name test-script",
          "// @namespace test-namespace",
          "// @match https://www.example.com/*",
          "// ==/UserScript==",
          "console.log('cached');",
        ].join("\n"),
      });
      mockResourceService.getScriptResources.mockResolvedValue({});
      mockValueService.getScriptValue.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 2 });

      const first = await runtime.getScriptsForTab({
        url: "https://www.example.com/path",
        tabId: 1,
        frameId: 0,
      });
      const second = await runtime.getScriptsForTab({
        url: "https://www.example.com/path",
        tabId: 1,
        frameId: 0,
      });

      expect(first?.injectScriptList[0].value).toEqual({ count: 1 });
      expect(second?.injectScriptList[0].value).toEqual({ count: 2 });
      expect(second?.injectScriptList[0].metadataStr).toContain("@name test-script");
      expect(runtime.pageLoadCaches.has(script.uuid)).toBe(true);
      expect(compiledResourceDAO.gets).toHaveBeenCalledTimes(1);
      expect(mockResourceService.getScriptResources).toHaveBeenCalledTimes(1);
      expect(mockScriptDAO.scriptCodeDAO.get).toHaveBeenCalledTimes(1);
      expect(mockValueService.getScriptValue).toHaveBeenCalledTimes(2);
    });

    it("应该在全局停用、黑名单、没有匹配脚本时直接返回 null", async () => {
      runtime.isLoadScripts = false;
      expect(
        await runtime.getScriptsForTab({
          url: "https://www.example.com/path",
          tabId: 1,
          frameId: 0,
        })
      ).toBeNull();

      runtime.isLoadScripts = true;
      runtime.blacklist = obtainBlackList("*://www.example.com/*");
      runtime.loadBlacklist();
      expect(
        await runtime.getScriptsForTab({
          url: "https://www.example.com/path",
          tabId: 1,
          frameId: 0,
        })
      ).toBeNull();

      runtime.blacklist = [];
      runtime.loadBlacklist();
      expect(
        await runtime.getScriptsForTab({
          url: "https://not-matched.example/path",
          tabId: 1,
          frameId: 0,
        })
      ).toBeNull();
      expect(mockScriptDAO.gets).not.toHaveBeenCalled();
    });

    it("应该按运行条件过滤脚本，并按 inject-into 拆分 inject/content 列表且保留顺序", async () => {
      const injectScript = createMockScript({
        uuid: "script-inject",
        sort: 1,
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });
      const contentScript = createMockScript({
        uuid: "script-content",
        sort: 2,
        metadata: {
          match: ["https://www.example.com/*"],
          "inject-into": ["content"],
        },
      });
      const noframesScript = createMockScript({
        uuid: "script-noframes",
        sort: 3,
        metadata: {
          match: ["https://www.example.com/*"],
          noframes: [""],
        },
      });
      const incognitoOnlyScript = createMockScript({
        uuid: "script-incognito",
        sort: 4,
        metadata: {
          match: ["https://www.example.com/*"],
          "run-in": ["incognito-tabs"],
        },
      });

      const scripts = [injectScript, contentScript, noframesScript, incognitoOnlyScript];
      await updateMockScripts(scripts);
      const runResources = scripts.map(createScriptRunResource);
      const compiledResources = await Promise.all(
        scripts.map((script, index) => createCompiledResourceAsync(script, runResources[index]))
      );
      runtime.compiledResourceDAO = {
        gets: vi.fn().mockResolvedValue(compiledResources),
      } as any;
      mockScriptDAO.gets.mockResolvedValue(scripts);
      mockScriptDAO.scriptCodeDAO.get.mockImplementation(async (uuid) => {
        const script = scripts.find((item) => item.uuid === uuid);
        return script ? { uuid, code: createUserScriptCode(script) } : undefined;
      });
      mockResourceService.getScriptResources.mockResolvedValue({});
      mockValueService.getScriptValue.mockResolvedValue({});

      const result = await runtime.getScriptsForTab({
        url: "https://www.example.com/path",
        tabId: 1,
        frameId: 1,
      });

      expect(result?.injectScriptList.map((script) => script.uuid)).toEqual(["script-inject"]);
      expect(result?.contentScriptList.map((script) => script.uuid)).toEqual(["script-content"]);
      expect(result?.scriptmenus.map((script) => script.uuid)).toEqual(["script-inject", "script-content"]);
    });

    it("应该在脚本更新时间变化后丢弃旧 page-load cache 并重建静态信息", async () => {
      const oldScript = createMockScript({
        uuid: "cache-invalidated",
        metadata: {
          match: ["https://www.example.com/*"],
        },
        updatetime: 100,
      });
      await updateMockScripts([oldScript]);
      const newScript = {
        ...oldScript,
        updatetime: 200,
      };
      const oldRunResource = createScriptRunResource(oldScript);
      const _newRunResource = createScriptRunResource(newScript);
      const oldCompiled = await createCompiledResourceAsync(oldScript, oldRunResource);
      const newCompiled = {
        ...oldCompiled,
        name: newScript.name,
      };
      const compiledResourceDAO = {
        gets: vi.fn().mockResolvedValueOnce([oldCompiled]).mockResolvedValueOnce([newCompiled]),
      };
      runtime.compiledResourceDAO = compiledResourceDAO as any;
      mockScriptDAO.gets.mockResolvedValueOnce([oldScript]).mockResolvedValueOnce([newScript]);
      mockScriptDAO.scriptCodeDAO.get
        .mockResolvedValueOnce({
          uuid: oldScript.uuid,
          code: createUserScriptCode(oldScript, "console.log('old');"),
        })
        .mockResolvedValueOnce({
          uuid: newScript.uuid,
          code: createUserScriptCode(newScript, "console.log('new');"),
        });
      mockResourceService.getScriptResources.mockResolvedValue({});
      mockValueService.getScriptValue.mockResolvedValue({});

      await runtime.getScriptsForTab({
        url: "https://www.example.com/path",
        tabId: 1,
        frameId: 0,
      });
      await runtime.getScriptsForTab({
        url: "https://www.example.com/path",
        tabId: 1,
        frameId: 0,
      });

      expect(compiledResourceDAO.gets).toHaveBeenCalledTimes(2);
      expect(mockResourceService.getScriptResources).toHaveBeenCalledTimes(2);
      expect(mockScriptDAO.scriptCodeDAO.get).toHaveBeenCalledTimes(2);
      expect(runtime.pageLoadCaches.get(oldScript.uuid)?.code).toContain("console.log('new');");
    });

    it("应该在本地 file resource 改变时更新缓存资源并刷新已注册 userScript", async () => {
      const resourceUrl = "file:///tmp/local.js";
      const script = createMockScript({
        uuid: "local-resource-script",
        metadata: {
          match: ["https://www.example.com/*"],
          require: [resourceUrl],
        },
        updatetime: 100,
      });
      await updateMockScripts([script]);
      const scriptRunResource = createScriptRunResource(script);
      const compiledResource = await createCompiledResourceAsync(script, scriptRunResource);
      runtime.compiledResourceDAO = {
        gets: vi.fn().mockResolvedValue([compiledResource]),
      } as any;
      mockScriptDAO.gets.mockResolvedValue([script]);
      mockScriptDAO.scriptCodeDAO.get.mockResolvedValue({
        uuid: script.uuid,
        code: createUserScriptCode(script, "console.log('with local resource');"),
      });
      mockResourceService.getScriptResources.mockResolvedValue({
        [resourceUrl]: createTextResource(resourceUrl, "console.log('old resource');", "old-sha"),
      });
      mockResourceService.updateResource.mockResolvedValue(
        createTextResource(resourceUrl, "console.log('new resource');", "new-sha")
      );
      mockValueService.getScriptValue.mockResolvedValue({});

      const getScripts = vi.fn().mockResolvedValue([{ id: script.uuid, js: [{ code: "old registered code" }] }]);
      const update = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(chrome.userScripts, "getScripts").mockImplementation(getScripts as any);
      vi.spyOn(chrome.userScripts, "update").mockImplementation(update as any);

      const result = await runtime.getScriptsForTab({
        url: "https://www.example.com/path",
        tabId: 1,
        frameId: 0,
      });

      expect(result?.injectScriptList[0].resource[resourceUrl].content).toBe("console.log('new resource');");
      expect(result?.injectScriptList[0].resource[resourceUrl].base64).toBeUndefined();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0][0].id).toBe(script.uuid);
      const updatedCode = update.mock.calls[0][0][0].js[0].code;
      expect(updatedCode).toContain("console.log('new resource');");
      expect(updatedCode).not.toContain("console.log('old resource');");
      expect(runtime.pageLoadCaches.get(script.uuid)?.localResources[0].sha512).toBe("new-sha");
    });

    it("应该支持命名 @resource file:/// 改变时更新缓存资源", async () => {
      const resourceUrl = "file:///tmp/local.txt";
      const script = createMockScript({
        uuid: "local-named-resource-script",
        metadata: {
          match: ["https://www.example.com/*"],
          resource: [`asset ${resourceUrl}`],
        },
        updatetime: 100,
      });
      await updateMockScripts([script]);
      const scriptRunResource = createScriptRunResource(script);
      const compiledResource = await createCompiledResourceAsync(script, scriptRunResource);
      runtime.compiledResourceDAO = {
        gets: vi.fn().mockResolvedValue([compiledResource]),
      } as any;
      mockScriptDAO.gets.mockResolvedValue([script]);
      mockScriptDAO.scriptCodeDAO.get.mockResolvedValue({
        uuid: script.uuid,
        code: createUserScriptCode(script, "console.log('with named local resource');"),
      });
      mockResourceService.getScriptResources.mockResolvedValue({
        asset: { ...createTextResource(resourceUrl, "old text", "old-sha"), type: "resource" },
      });
      mockResourceService.updateResource.mockResolvedValue({
        ...createTextResource(resourceUrl, "new text", "new-sha"),
        type: "resource",
      });
      mockValueService.getScriptValue.mockResolvedValue({});

      vi.spyOn(chrome.userScripts, "getScripts").mockResolvedValue([{ id: script.uuid, js: [{ code: "old" }] }] as any);
      const update = vi.spyOn(chrome.userScripts, "update").mockResolvedValue(undefined);
      update.mockClear();

      const result = await runtime.getScriptsForTab({
        url: "https://www.example.com/path",
        tabId: 1,
        frameId: 0,
      });

      expect(result?.injectScriptList[0].resource.asset.content).toBe("new text");
      expect(runtime.pageLoadCaches.get(script.uuid)?.localResources[0]).toMatchObject({
        resourceKey: "asset",
        url: resourceUrl,
        type: "resource",
        sha512: "new-sha",
      });
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  describe("getPopupPageScriptMatchingResultByUrl", () => {
    it("应该按需匹配 disabled 脚本，且不写入 runtime disabled matcher 或 page-load cache", async () => {
      const disabledScript = createMockScript({
        uuid: "disabled-effective",
        status: SCRIPT_STATUS_DISABLE,
        sort: 1,
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });
      const disabledExcludedScript = createMockScript({
        uuid: "disabled-excluded",
        status: SCRIPT_STATUS_DISABLE,
        sort: 2,
        metadata: {
          match: ["https://www.example.com/*"],
        },
        selfMetadata: {
          exclude: ["https://www.example.com/*"],
        },
      });

      await updateMockScripts([disabledScript, disabledExcludedScript]);
      expect(runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/path", true, true).size).toBe(2);

      const result = await runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/path");

      expect(result.get(disabledScript.uuid)).toEqual({
        uuid: disabledScript.uuid,
        effective: true,
      });
      expect(result.get(disabledExcludedScript.uuid)).toEqual({
        uuid: disabledExcludedScript.uuid,
        effective: false,
      });
      expect(runtime.getPageScriptMatchingResultByUrlInternal("https://www.example.com/path", true, true).size).toBe(2);
      expect(runtime.pageLoadCaches.size).toBe(0);
    });

    it("应该缓存 Popup disabled matcher，重复打开 Popup 时不重复扫描全部脚本", async () => {
      const disabledScript = createMockScript({
        uuid: "disabled-cached",
        status: SCRIPT_STATUS_DISABLE,
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });

      await updateMockScripts([disabledScript]);

      const first = await runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/path");
      const second = await runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/other");

      expect(first.get(disabledScript.uuid)?.effective).toBe(true);
      expect(second.get(disabledScript.uuid)?.effective).toBe(true);
      expect(mockScriptDAO.all).toHaveBeenCalledTimes(1);
    });

    it("应该在 runtime cache 被清理后重建 Popup disabled matcher", async () => {
      const oldDisabledScript = createMockScript({
        uuid: "disabled-old",
        status: SCRIPT_STATUS_DISABLE,
        metadata: {
          match: ["https://old.example.com/*"],
        },
      });

      await updateMockScripts([oldDisabledScript]);
      const result1 = await runtime.getPopupPageScriptMatchingResultByUrl("https://old.example.com/path");
      expect(result1.has("disabled-old")).toBe(true);
      expect(result1.has("disabled-new")).toBe(false);
      expect(mockScriptDAO.all).toHaveBeenCalledTimes(1);

      runtime.deleteScriptRuntimeCache(oldDisabledScript.uuid);

      const newDisabledScript = createMockScript({
        uuid: "disabled-new",
        status: SCRIPT_STATUS_DISABLE,
        metadata: {
          match: ["https://new.example.com/*"],
        },
      });

      await updateMockScripts([newDisabledScript]);
      const result2 = await runtime.getPopupPageScriptMatchingResultByUrl("https://new.example.com/path");

      expect(result2.has("disabled-old")).toBe(false);
      expect(result2.has("disabled-new")).toBe(true);
      expect(result2.get("disabled-new")?.effective).toBe(true);
      expect(mockScriptDAO.all).toHaveBeenCalledTimes(2);
    });

    it("应该合并 enabled matcher 与按需 disabled 匹配，并保留 effective / non-effective 状态", async () => {
      const enabledScript = createMockScript({
        uuid: "enabled-effective",
        sort: 1,
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });
      const enabledExcludedScript = createMockScript({
        uuid: "enabled-excluded",
        sort: 2,
        metadata: {
          match: ["https://www.example.com/*"],
        },
        selfMetadata: {
          exclude: ["https://www.example.com/*"],
        },
      });
      const disabledScript = createMockScript({
        uuid: "disabled-effective",
        status: SCRIPT_STATUS_DISABLE,
        sort: 3,
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });

      await runtime.applyScriptMatchInfo(createScriptRunResource(enabledScript));
      await runtime.applyScriptMatchInfo(createScriptRunResource(enabledExcludedScript));
      await updateMockScripts([enabledScript, enabledExcludedScript, disabledScript]);

      const result = await runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/path");

      expect([...result.keys()]).toEqual(["enabled-effective", "enabled-excluded", "disabled-effective"]);
      expect(result.get(enabledScript.uuid)?.effective).toBe(true);
      expect(result.get(enabledExcludedScript.uuid)?.effective).toBe(false);
      expect(result.get(disabledScript.uuid)?.effective).toBe(true);
    });

    it("应该忽略非普通脚本、enabled 脚本和没有匹配规则的 disabled 脚本按需扫描", async () => {
      const backgroundScript = createMockScript({
        uuid: "background-disabled",
        type: SCRIPT_TYPE_BACKGROUND,
        status: SCRIPT_STATUS_DISABLE,
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });
      const enabledScriptNotInMatcher = createMockScript({
        uuid: "enabled-not-in-runtime-matcher",
        status: SCRIPT_STATUS_ENABLE,
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });
      const disabledWithoutRules = createMockScript({
        uuid: "disabled-without-rules",
        status: SCRIPT_STATUS_DISABLE,
        metadata: {},
      });
      const disabledMatched = createMockScript({
        uuid: "disabled-matched",
        status: SCRIPT_STATUS_DISABLE,
        metadata: {
          include: ["*://www.example.com/*"],
        },
      });

      await updateMockScripts([backgroundScript, enabledScriptNotInMatcher, disabledWithoutRules, disabledMatched]);

      const result = await runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/path");

      expect([...result.keys()]).toEqual(["disabled-matched"]);
      expect(mockScriptDAO.all).toHaveBeenCalledTimes(1);
    });

    it("应该按 disabled 脚本 sort 顺序返回按需匹配结果", async () => {
      const laterScript = createMockScript({
        uuid: "sort-later",
        status: SCRIPT_STATUS_DISABLE,
        sort: 20,
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });
      const earlierScript = createMockScript({
        uuid: "sort-earlier",
        status: SCRIPT_STATUS_DISABLE,
        sort: 10,
        metadata: {
          match: ["https://www.example.com/*"],
        },
      });

      await updateMockScripts([laterScript, earlierScript]);

      const result = await runtime.getPopupPageScriptMatchingResultByUrl("https://www.example.com/path");

      expect([...result.keys()]).toEqual(["sort-earlier", "sort-later"]);
    });
  });

  describe.concurrent("黑名单测试", async () => {
    it.concurrent("黑名单测试 A", async () => {
      // Arrange
      const blacklistString = "*://www.blacklisted.com/*";
      mockSystemConfig.getBlacklist.mockReturnValue(blacklistString);
      runtime.blacklist = obtainBlackList(blacklistString); //  this.systemConfig.addListener("blacklist", ... ) 里自动更新 blacklist
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

    it.concurrent("黑名单测试 B", async () => {
      // Arrange
      const blacklistString = "*://www.blacklisted.com/*\nhttps://*.google.com/*";
      mockSystemConfig.getBlacklist.mockReturnValue(blacklistString);
      runtime.blacklist = obtainBlackList(blacklistString); //  this.systemConfig.addListener("blacklist", ... ) 里自动更新 blacklist
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

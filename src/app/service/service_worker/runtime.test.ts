import { initTestEnv } from "@Tests/utils";
import { RuntimeService } from "./runtime";
import { vi, describe, it, expect, beforeEach, afterEach, type MockedFunction } from "vitest";
import { randomUUID } from "crypto";
import type { Script, ScriptRunResource } from "@App/app/repo/scripts";
import {
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import { buildScriptRunResourceBasic, getCombinedMeta, scriptURLPatternResults } from "./utils";
import type { SystemConfig } from "@App/pkg/config/config";
import { SenderRuntime, type Group } from "@Packages/message/server";
import type { ServiceWorkerMessageSend, WindowMessageBody } from "@Packages/message/window_message";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { ValueService } from "./value";
import type { ScriptService } from "./script";
import type { ResourceService } from "./resource";
import type { ScriptDAO } from "@App/app/repo/scripts";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import { getStorageName, obtainBlackList } from "@App/pkg/utils/utils";
import { CompiledResourceNamespace, type CompiledResource, type Resource } from "@App/app/repo/resource";

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

  it.concurrent("match 覆盖清空后此前的匹配规则不再生效，但仍以未生效列出", async () => {
    const { runtime } = createRuntimeTestContext();
    const script = createMockScript({
      metadata: { match: ["https://www.example.com/*"] },
      selfMetadata: { match: ["https://www.example.com/*"] },
    });

    await runtime.applyScriptMatchInfo(createScriptRunResource(script));
    expect(runtime.getPageScriptMatchingResultByUrl("https://www.example.com/").has(script.uuid)).toBe(true);

    const emptyMatchOverride = createScriptRunResource({
      ...script,
      selfMetadata: { match: [] },
    });
    await runtime.applyScriptMatchInfo(emptyMatchOverride);

    expect(runtime.getPageScriptMatchingResultByUrl("https://www.example.com/").has(script.uuid)).toBe(false);
    // 原始规则仍在匹配器内，Popup 才能把它列为未生效并给出「允许在此执行」的恢复入口
    expect(runtime.getPageScriptMatchingResultByUrl("https://www.example.com/", true).get(script.uuid)?.effective).toBe(
      false
    );
  });

  it.concurrent("match 覆盖清空的脚本不应被注册（空规则会被 UserScripts API 退回成全站匹配）", async () => {
    const { runtime } = createRuntimeTestContext();
    (runtime as any).resource = {
      getScriptResourceValueByType: vi.fn().mockResolvedValue({ require: {}, "require-css": {}, resource: {} }),
    };
    const script = createMockScript({
      metadata: { match: ["https://www.example.com/*"] },
      selfMetadata: { match: [] },
    });

    expect(await runtime.buildCompiledResourceFromScript(script)).toBeUndefined();
  });

  it.concurrent("空匹配覆盖时应删除持久化 CompiledResource 并注销旧注册", async () => {
    const { runtime, mockScriptService } = createRuntimeTestContext();
    const script = createMockScript({
      metadata: { match: ["https://www.example.com/*"] },
      selfMetadata: { match: [] },
      status: SCRIPT_STATUS_ENABLE,
    });
    const scriptRunResource = createScriptRunResource(script);
    mockScriptService.buildScriptRunResource.mockResolvedValue(scriptRunResource);

    const deleteSpy = vi.spyOn(runtime.compiledResourceDAO, "delete").mockResolvedValue(undefined);
    const unregisterSpy = vi.spyOn(runtime, "unregistryPageScripts").mockResolvedValue(undefined);

    await runtime.updateResourceOnScriptChange(script);

    // 空覆盖 = 全站不匹配：旧 CompiledResource 与浏览器注册必须被清掉，否则 SW 重启后旧范围复活
    expect(deleteSpy).toHaveBeenCalledWith(script.uuid);
    expect(unregisterSpy).toHaveBeenCalledWith([script.uuid]);
  });

  it("compiled revision 应覆盖生成代码和有效执行元数据", async () => {
    const { runtime, mockScriptService } = createRuntimeTestContext();
    const script = createMockScript({
      metadata: { match: ["https://www.example.com/*"], "run-at": ["document-start"], "early-start": [""] },
    });
    const scriptRunResource = createScriptRunResource(script);
    mockScriptService.buildScriptRunResource.mockResolvedValue(scriptRunResource);
    (runtime as any).resource = {
      getScriptResourceValueByType: vi.fn().mockResolvedValue({ require: {}, "require-css": {}, resource: {} }),
    };
    const first = await runtime.buildCompiledResourceFromScript(script, true);
    const same = await runtime.buildCompiledResourceFromScript(script, true);
    const changedOriginalMetadata = await runtime.buildCompiledResourceFromScript(
      { ...script, metadata: { ...script.metadata, tag: ["updated"] } },
      true
    );
    mockScriptService.buildScriptRunResource.mockResolvedValue({
      ...scriptRunResource,
      code: `${scriptRunResource.code}\n// changed source`,
    });
    const changed = await runtime.buildCompiledResourceFromScript(script, true);
    mockScriptService.buildScriptRunResource.mockResolvedValue({
      ...scriptRunResource,
      metadata: { ...scriptRunResource.metadata, "run-at": ["document-end"] },
    });
    const changedMetadata = await runtime.buildCompiledResourceFromScript(script, true);
    const requiredResource = (content: string): Resource => ({
      url: "https://cdn.example.com/lib.js",
      content,
      base64: "",
      hash: { md5: "", sha1: "", sha256: "", sha384: "", sha512: "" },
      type: "require",
      link: {},
      contentType: "text/javascript",
      createtime: 1,
    });
    const resourceRun = {
      ...scriptRunResource,
      resourceByType: {
        require: { "https://cdn.example.com/lib.js": requiredResource("v1") },
        "require-css": {},
        resource: {},
      },
    } as ScriptRunResource;
    mockScriptService.buildScriptRunResource.mockResolvedValue(resourceRun);
    const firstResource = await runtime.buildCompiledResourceFromScript(script, true);
    mockScriptService.buildScriptRunResource.mockResolvedValue({
      ...resourceRun,
      resourceByType: {
        ...resourceRun.resourceByType,
        require: { "https://cdn.example.com/lib.js": requiredResource("v2") },
      },
    });
    const changedResource = await runtime.buildCompiledResourceFromScript(script, true);

    expect(first?.compiledResource.scriptRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(first?.apiScript.js?.[0].code).toContain(first?.compiledResource.scriptRevision);
    expect(same?.compiledResource.scriptRevision).toBe(first?.compiledResource.scriptRevision);
    expect(changedOriginalMetadata?.compiledResource.scriptRevision).not.toBe(first?.compiledResource.scriptRevision);
    expect(changed?.compiledResource.scriptRevision).not.toBe(first?.compiledResource.scriptRevision);
    expect(changedMetadata?.compiledResource.scriptRevision).not.toBe(changed?.compiledResource.scriptRevision);
    expect(changedResource?.compiledResource.scriptRevision).not.toBe(firstResource?.compiledResource.scriptRevision);
  });

  it("normal（非 early-start）脚本注册代码同样携带当前 compiled revision", async () => {
    // 上面那个用例特意带 early-start metadata；早期路径已经会在拿到 revision 后重新编译一次，
    // 因此不能覆盖普通脚本这条路径。这里用默认（无 early-start）fixture 单独验证。
    const { runtime, mockScriptService } = createRuntimeTestContext();
    const script = createMockScript();
    const scriptRunResource = createScriptRunResource(script);
    mockScriptService.buildScriptRunResource.mockResolvedValue(scriptRunResource);
    (runtime as any).resource = {
      getScriptResourceValueByType: vi.fn().mockResolvedValue({ require: {}, "require-css": {}, resource: {} }),
    };

    const candidate = await runtime.buildCompiledResourceFromScript(script, true);

    expect(candidate?.compiledResource.scriptRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(candidate?.apiScript.js?.[0].code).toContain(candidate?.compiledResource.scriptRevision);
  });

  it("browser registration failure must not publish a newly compiled revision", async () => {
    const { runtime, mockScriptService } = createRuntimeTestContext();
    const script = createMockScript({ selfMetadata: { match: ["https://changed.example.com/*"] } });
    const previousScript = { ...script, selfMetadata: undefined };
    await runtime.applyScriptMatchInfo(createScriptRunResource(previousScript));
    (runtime as any).pageLoadCaches.set(script.uuid, { scriptCacheKey: "stale" });
    mockScriptService.buildScriptRunResource.mockResolvedValue(createScriptRunResource(script));
    (runtime as any).isUserScriptsAvailable = true;
    (runtime as any).resource = {
      getScriptResourceValueByType: vi.fn().mockResolvedValue({ require: {}, "require-css": {}, resource: {} }),
    };
    vi.spyOn(chrome.userScripts, "getScripts").mockResolvedValue([{ id: script.uuid }] as any);
    vi.spyOn(chrome.userScripts, "update").mockRejectedValue(new Error("registration failed"));
    const saveSpy = vi.spyOn(runtime.compiledResourceDAO, "save").mockResolvedValue({} as CompiledResource);

    await runtime.updateResourceOnScriptChange(script);

    expect(saveSpy).not.toHaveBeenCalled();
    expect((runtime as any).pageLoadCaches.has(script.uuid)).toBe(false);
    expect(runtime.getPageScriptMatchingResultByUrl("https://www.example.com/").has(script.uuid)).toBe(false);
    expect(runtime.getPageScriptMatchingResultByUrl("https://changed.example.com/").has(script.uuid)).toBe(true);
  });

  it("script updates should refresh URL matching before compiled registration work", async () => {
    const { runtime, mockScriptService } = createRuntimeTestContext();
    const script = createMockScript({ selfMetadata: { match: ["https://changed.example.com/*"] } });
    const previousScript = { ...script, selfMetadata: undefined };
    await runtime.applyScriptMatchInfo(createScriptRunResource(previousScript));
    let resolveScriptRunResource!: (resource: ScriptRunResource) => void;
    mockScriptService.buildScriptRunResource.mockReturnValue(
      new Promise((resolve) => {
        resolveScriptRunResource = resolve;
      })
    );

    const update = runtime.updateResourceOnScriptChange(script);

    expect(runtime.getPageScriptMatchingResultByUrl("https://changed.example.com/").has(script.uuid)).toBe(true);
    resolveScriptRunResource(createScriptRunResource(script));
    await update;
  });

  it("successful browser registration publishes the compiled revision afterward", async () => {
    const { runtime, mockScriptService } = createRuntimeTestContext();
    const script = createMockScript();
    mockScriptService.buildScriptRunResource.mockResolvedValue(createScriptRunResource(script));
    (runtime as any).isUserScriptsAvailable = true;
    vi.spyOn(chrome.userScripts, "getScripts").mockResolvedValue([] as any);
    const saveSpy = vi.spyOn(runtime.compiledResourceDAO, "save").mockResolvedValue({} as CompiledResource);
    vi.spyOn(chrome.userScripts, "register").mockImplementation(async () => {
      expect(saveSpy).not.toHaveBeenCalled();
    });

    await runtime.updateResourceOnScriptChange(script);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][0].scriptRevision).toMatch(/^[a-f0-9]{64}$/);
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
        scriptRevision: "0".repeat(64),
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
        getScriptResourceValue: vi.fn().mockResolvedValue({}),
        getScriptResourceValueByType: vi.fn().mockResolvedValue({ require: {}, "require-css": {}, resource: {} }),
      };

      const mockValueService = {
        getScriptValue: vi.fn().mockResolvedValue({}),
      };

      (mockScriptDAO as any).gets = vi.fn().mockResolvedValue([script]);
      (mockScriptDAO as any).scriptCodeDAO = mockScriptCodeDAO;
      runtime.compiledResourceDAO = mockCompiledResourceDAO as any;
      (runtime as any).resource = mockResourceService;
      (runtime as any).value = mockValueService;
      vi.spyOn(runtime, "buildCompiledResourceFromScript").mockResolvedValue({ compiledResource } as any);

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

    it("本地资源注册失败时保留旧页面缓存", async () => {
      const {
        runtime,
        script,
        scriptRes,
        compiledResource,
        mockCompiledResourceDAO,
        mockResourceService,
        mockValueService,
      } = createCacheTestContext();
      script.metadata.require = ["file:///tmp/required.js"];
      scriptRes.metadata.require = ["file:///tmp/required.js"];
      await runtime.applyScriptMatchInfo(scriptRes);
      mockValueService.getScriptValue.mockResolvedValue({ latest: "value" });
      const oldResource = {
        url: "file:///tmp/required.js",
        content: "old resource",
        base64: "",
        hash: { sha512: "old hash" },
        type: "require",
        link: { [script.uuid]: true },
        contentType: "text/javascript",
        createtime: 1,
      } as Resource;
      const newResource = { ...oldResource, content: "new resource", hash: { sha512: "new hash" } } as Resource;
      (mockResourceService.getScriptResourceValueByType as any).mockResolvedValue({
        require: { [oldResource.url]: oldResource },
        "require-css": {},
        resource: {},
      });
      (mockResourceService as any).getResourceModel = vi.fn().mockResolvedValue(oldResource);
      (mockResourceService as any).updateResource = vi.fn().mockResolvedValue(newResource);
      mockCompiledResourceDAO.get.mockResolvedValue(compiledResource);
      vi.spyOn(chrome.userScripts, "getScripts").mockResolvedValue([
        { id: script.uuid, js: [{ code: "old wrapper" }] } as chrome.userScripts.RegisteredUserScript,
      ] as any);
      const browserUpdateSpy = vi
        .spyOn(chrome.userScripts, "update")
        .mockRejectedValue(new Error("registration failed"));

      await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });

      const cache = (runtime as any).pageLoadCaches.get(script.uuid);
      expect(cache.resourceByType.require[oldResource.url].content).toBe("old resource");
      expect(cache.localResources[0].sha512).toBe("old hash");

      browserUpdateSpy.mockResolvedValue(undefined as any);
      const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });

      const updatedCache = (runtime as any).pageLoadCaches.get(script.uuid);
      expect(updatedCache.resourceByType.require[oldResource.url].content).toBe("new resource");
      expect(updatedCache.localResources[0].sha512).toBe("new hash");
      expect(result!.injectScriptList[0].value).toEqual({ latest: "value" });
      expect(browserUpdateSpy).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ js: [expect.objectContaining({ code: expect.stringContaining("new resource") })] }),
        ])
      );
      expect(mockCompiledResourceDAO.save).toHaveBeenCalledWith(
        expect.objectContaining({ scriptRevision: expect.not.stringMatching(/^0+$/) })
      );
      expect(result!.injectScriptList[0].scriptRevision).toBe(
        mockCompiledResourceDAO.save.mock.calls.at(-1)?.[0].scriptRevision
      );
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

// ─────────────────────────────────────────────────────────────────────────────
// 以下为新增测试，覆盖原有测试未触及的分支
// ─────────────────────────────────────────────────────────────────────────────

// 公共辅助：与外层 describe 同款，但提升到文件级供新 describe 复用。
const _createMockScript = (overrides: Partial<Script> = {}): Script => ({
  uuid: randomUUID(),
  name: "test-script",
  namespace: "test-namespace",
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: "running" as const,
  createtime: Date.now(),
  checktime: Date.now(),
  metadata: { match: ["https://www.example.com/*"] },
  ...overrides,
});

const _createScriptRunResource = (script: Script): ScriptRunResource => {
  let metadata = { ...script.metadata };
  const { match, include, exclude } = metadata;
  const originalMetadata = { match, include, exclude };
  if (script.selfMetadata) metadata = getCombinedMeta(script.metadata, script.selfMetadata);
  return { ...script, code: "// test", flag: "", value: {}, resource: {}, metadata, originalMetadata };
};

const _createRuntimeContext = () => {
  const mockSystemConfig = {
    getBlacklist: vi.fn().mockReturnValue(""),
    getEnableScriptIncognito: vi.fn().mockResolvedValue(true),
    getLanguage: vi.fn().mockResolvedValue("zh-CN"),
    addListener: vi.fn(),
  };
  const mockScriptService = { buildScriptRunResource: vi.fn() };
  const mockGroup = {
    use: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    publish: vi.fn(),
  };
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
  const mockMQ = { group: vi.fn().mockReturnValue(mockGroup) } as unknown as IMessageQueue;
  const mockScriptDAO = { all: vi.fn().mockResolvedValue([]), gets: vi.fn().mockResolvedValue([]) };
  const runtime = new RuntimeService(
    mockSystemConfig as unknown as SystemConfig,
    mockGroup as unknown as Group,
    mockSender,
    mockMQ,
    {} as ValueService,
    mockScriptService as unknown as ScriptService,
    {} as ResourceService,
    mockScriptDAO as unknown as ScriptDAO,
    new LocalStorageDAO()
  );
  return { runtime, mockSystemConfig, mockScriptService, mockScriptDAO, mockGroup };
};

// ─────────────────────────────────────────────────────────────────────────────

describe("shouldSkipPageLoadScript 页面脚本加载过滤规则", () => {
  it("启用脚本且无特殊 metadata → 不跳过（返回 false）", () => {
    const { runtime } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(_createMockScript());
    expect((runtime as any).shouldSkipPageLoadScript(scriptRes, undefined)).toBe(false);
  });

  it("脚本状态为 DISABLE → 跳过（返回 true）", () => {
    const { runtime } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(_createMockScript({ status: SCRIPT_STATUS_DISABLE }));
    expect((runtime as any).shouldSkipPageLoadScript(scriptRes, undefined)).toBe(true);
  });

  it("metadata.noframes 为真 + frameId 非 0（子框架）→ 跳过", () => {
    const { runtime } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(
      _createMockScript({ metadata: { match: ["https://example.com/*"], noframes: [""] } })
    );
    expect((runtime as any).shouldSkipPageLoadScript(scriptRes, 5)).toBe(true);
  });

  it("metadata.noframes 为真 + frameId 未定义（主框架）→ 不跳过", () => {
    const { runtime } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(
      _createMockScript({ metadata: { match: ["https://example.com/*"], noframes: [""] } })
    );
    expect((runtime as any).shouldSkipPageLoadScript(scriptRes, undefined)).toBe(false);
  });

  it("run-in: normal-tabs（测试环境默认非隐身）→ 与当前环境匹配，不跳过", () => {
    const { runtime } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(
      _createMockScript({ metadata: { match: ["https://example.com/*"], "run-in": ["normal-tabs"] } })
    );
    // chrome.extension.inIncognitoContext 在测试环境中为 false，"normal-tabs" 匹配
    expect((runtime as any).shouldSkipPageLoadScript(scriptRes, undefined)).toBe(false);
  });

  it("run-in: incognito-tabs（测试环境非隐身）→ 与当前环境不匹配，跳过", () => {
    const { runtime } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(
      _createMockScript({ metadata: { match: ["https://example.com/*"], "run-in": ["incognito-tabs"] } })
    );
    expect((runtime as any).shouldSkipPageLoadScript(scriptRes, undefined)).toBe(true);
  });

  it("run-in: incognito-tabs 在真实隐身标签页中匹配，不跳过", () => {
    const { runtime } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(
      _createMockScript({ metadata: { match: ["https://example.com/*"], "run-in": ["incognito-tabs"] } })
    );

    expect((runtime as any).shouldSkipPageLoadScript(scriptRes, undefined, true)).toBe(false);
  });

  it("run-in: normal-tabs 在真实隐身标签页中不匹配，跳过", () => {
    const { runtime } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(
      _createMockScript({ metadata: { match: ["https://example.com/*"], "run-in": ["normal-tabs"] } })
    );

    expect((runtime as any).shouldSkipPageLoadScript(scriptRes, undefined, true)).toBe(true);
  });

  it("run-in: all → 任意环境均不跳过", () => {
    const { runtime } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(
      _createMockScript({ metadata: { match: ["https://example.com/*"], "run-in": ["all"] } })
    );
    expect((runtime as any).shouldSkipPageLoadScript(scriptRes, undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("getPageLoadScriptCacheKey 页面加载缓存键生成", () => {
  const { runtime } = _createRuntimeContext();

  it("相同脚本两次调用生成同一缓存键", () => {
    const script = _createMockScript({ updatetime: 100 });
    const res = buildScriptRunResourceBasic(script);
    const k1 = (runtime as any).getPageLoadScriptCacheKey(res);
    const k2 = (runtime as any).getPageLoadScriptCacheKey(res);
    expect(k1).toBe(k2);
  });

  it("updatetime 不同 → 缓存键不同", () => {
    const base = _createMockScript({ updatetime: 100 });
    const updated = { ...base, updatetime: 200 };
    const k1 = (runtime as any).getPageLoadScriptCacheKey(buildScriptRunResourceBasic(base));
    const k2 = (runtime as any).getPageLoadScriptCacheKey(buildScriptRunResourceBasic(updated));
    expect(k1).not.toBe(k2);
  });

  it("match 规则变化 → 缓存键不同", () => {
    const s1 = _createMockScript({ metadata: { match: ["https://a.com/*"] } });
    const s2 = _createMockScript({ ...s1, metadata: { match: ["https://b.com/*"] } });
    const k1 = (runtime as any).getPageLoadScriptCacheKey(buildScriptRunResourceBasic(s1));
    const k2 = (runtime as any).getPageLoadScriptCacheKey(buildScriptRunResourceBasic(s2));
    expect(k1).not.toBe(k2);
  });

  it("status 不同 → 缓存键不同（禁用脚本 key 与启用脚本 key 区分）", () => {
    const enabled = _createMockScript({ updatetime: 50, status: SCRIPT_STATUS_ENABLE });
    const disabled = { ...enabled, status: SCRIPT_STATUS_DISABLE };
    const k1 = (runtime as any).getPageLoadScriptCacheKey(buildScriptRunResourceBasic(enabled));
    const k2 = (runtime as any).getPageLoadScriptCacheKey(buildScriptRunResourceBasic(disabled));
    expect(k1).not.toBe(k2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("page-load resource cache", () => {
  it("保留分类资源并在重建页面 payload 时保持 legacy resource 视图", () => {
    const { runtime } = _createRuntimeContext();
    const sharedKey = "https://example.com/shared";
    const makeResource = (type: Resource["type"], content: string): Resource => ({
      url: sharedKey,
      content,
      base64: "",
      hash: { md5: "", sha1: "", sha256: "", sha384: "", sha512: "" },
      type,
      link: {},
      contentType: "text/plain",
      createtime: Date.now(),
    });
    const scriptRes = _createScriptRunResource(_createMockScript());
    const cache = {
      scriptCacheKey: "cache-key",
      scriptRevision: "compiled-revision",
      code: "console.log(1)",
      scriptUrlPatterns: [],
      originalUrlPatterns: null,
      metadataStr: "",
      userConfigStr: "",
      userConfig: undefined,
      resourceByType: {
        require: { [sharedKey]: makeResource("require", "require content") },
        "require-css": { [sharedKey]: makeResource("require-css", "css content") },
        resource: { [sharedKey]: makeResource("resource", "resource content") },
      },
      localResources: [],
    };

    const pageInfo = (runtime as any).createPageLoadScriptInfo(scriptRes, cache);

    expect(pageInfo.resourceByType.require[sharedKey].content).toBe("require content");
    expect(pageInfo.resourceByType["require-css"][sharedKey].content).toBe("css content");
    expect(pageInfo.resourceByType.resource[sharedKey].content).toBe("resource content");
    expect(pageInfo.resource[sharedKey].content).toBe("resource content");
    expect(pageInfo.scriptRevision).toBe("compiled-revision");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("getScriptsForTab 附加边界场景", () => {
  const pageUrl = "https://www.example.com/path";

  /** 带完整 mock 的测试上下文，可按需覆盖各层依赖 */
  const createFullContext = (scriptOverrides: Partial<Script> = {}) => {
    const { runtime, mockScriptDAO, mockScriptService, mockSystemConfig } = _createRuntimeContext();

    const script = _createMockScript({
      metadata: { match: ["https://www.example.com/*"] },
      status: SCRIPT_STATUS_ENABLE,
      createtime: 1000,
      updatetime: 2000,
      ...scriptOverrides,
    });

    const scriptRes = _createScriptRunResource(script);
    const patterns = scriptURLPatternResults(scriptRes)!;
    const compiledResource: CompiledResource = {
      name: script.name,
      flag: "",
      uuid: script.uuid,
      scriptRevision: "0".repeat(64),
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
    const mockScriptCodeDAO = { get: vi.fn().mockResolvedValue({ code: "// test" }) };
    const mockResourceService = {
      getScriptResourceValue: vi.fn().mockResolvedValue({}),
      getScriptResourceValueByType: vi.fn().mockResolvedValue({ require: {}, "require-css": {}, resource: {} }),
    };
    const mockValueService = { getScriptValue: vi.fn().mockResolvedValue({}) };

    (mockScriptDAO as any).gets = vi.fn().mockResolvedValue([script]);
    (mockScriptDAO as any).scriptCodeDAO = mockScriptCodeDAO;
    runtime.compiledResourceDAO = mockCompiledResourceDAO as any;
    (runtime as any).resource = mockResourceService;
    (runtime as any).value = mockValueService;
    vi.spyOn(runtime, "buildCompiledResourceFromScript").mockResolvedValue({ compiledResource } as any);

    return {
      runtime,
      script,
      scriptRes,
      mockScriptService,
      compiledResource,
      mockCompiledResourceDAO,
      mockScriptDAO,
      mockScriptCodeDAO,
      mockSystemConfig,
    };
  };

  it("isLoadScripts 为 false 时直接返回 null，不查匹配器", async () => {
    const { runtime, scriptRes } = createFullContext();
    await runtime.applyScriptMatchInfo(scriptRes);
    runtime.isLoadScripts = false;

    const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });
    expect(result).toBeNull();
  });

  it("隐身标签页关闭隐身脚本总开关时直接返回 null", async () => {
    const { runtime, scriptRes, mockSystemConfig } = createFullContext();
    await runtime.applyScriptMatchInfo(scriptRes);
    mockSystemConfig.getEnableScriptIncognito.mockResolvedValue(false);

    const result = await runtime.getScriptsForTab({
      url: pageUrl,
      tabId: 12,
      frameId: 0,
      incognito: true,
    });

    expect(result).toBeNull();
  });

  it("URL 在黑名单时返回 null", async () => {
    const { runtime, scriptRes } = createFullContext();
    await runtime.applyScriptMatchInfo(scriptRes);
    // 设置黑名单
    runtime.blacklist = obtainBlackList("https://www.example.com/*");
    runtime.loadBlacklist();

    const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });
    expect(result).toBeNull();
  });

  it("无任何脚本匹配当前 URL 时返回 null", async () => {
    const { runtime } = createFullContext();
    // 不调用 applyScriptMatchInfo，匹配器为空

    const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });
    expect(result).toBeNull();
  });

  it("匹配结果中的脚本被 DAO 返回为 DISABLE 状态时，shouldSkipPageLoadScript 过滤后返回 null", async () => {
    const { runtime, script, scriptRes, mockScriptDAO } = createFullContext();
    await runtime.applyScriptMatchInfo(scriptRes); // 启用时写入匹配器

    // DAO 返回禁用状态（模拟「事件与 DAO 读取之间状态已变」的竞态）
    (mockScriptDAO as any).gets = vi.fn().mockResolvedValue([{ ...script, status: SCRIPT_STATUS_DISABLE }]);

    const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });
    expect(result).toBeNull();
  });

  it("noframes 脚本在 frameId 非 0（子框架请求）时被过滤，返回 null", async () => {
    // 创建带 noframes 的脚本
    const { runtime, script, scriptRes, mockScriptDAO } = createFullContext({
      metadata: { match: ["https://www.example.com/*"], noframes: [""] },
    });
    await runtime.applyScriptMatchInfo(scriptRes);

    // DAO 返回含 noframes metadata 的脚本
    (mockScriptDAO as any).gets = vi
      .fn()
      .mockResolvedValue([{ ...script, metadata: { match: ["https://www.example.com/*"], noframes: [""] } }]);

    const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: 5 });
    expect(result).toBeNull();
  });

  it("noframes 脚本在 frameId 为 undefined（主框架请求）时不被过滤，返回脚本列表", async () => {
    const { runtime, script, scriptRes, mockScriptDAO } = createFullContext({
      metadata: { match: ["https://www.example.com/*"], noframes: [""] },
    });
    await runtime.applyScriptMatchInfo(scriptRes);
    (mockScriptDAO as any).gets = vi
      .fn()
      .mockResolvedValue([{ ...script, metadata: { match: ["https://www.example.com/*"], noframes: [""] } }]);

    const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });
    expect(result).not.toBeNull();
    expect(result!.injectScriptList.length + result!.contentScriptList.length).toBe(1);
  });

  it("隐身标签页返回的 GM_info 环境标记为隐身", async () => {
    const { runtime, script, scriptRes, mockScriptDAO } = createFullContext();
    await runtime.applyScriptMatchInfo(scriptRes);
    (mockScriptDAO as any).gets = vi.fn().mockResolvedValue([script]);

    const result = await runtime.getScriptsForTab({
      url: pageUrl,
      tabId: 12,
      frameId: 0,
      incognito: true,
    });

    expect(result?.envInfo.isIncognito).toBe(true);
  });

  it("compiledResource 不存在时不发布未注册的页面脚本", async () => {
    const { runtime, scriptRes, compiledResource, mockCompiledResourceDAO } = createFullContext();
    await runtime.applyScriptMatchInfo(scriptRes);

    // 没有已发布的 compiled revision 时，不能把未注册的候选版本作为权威脚本信息发送。
    mockCompiledResourceDAO.gets.mockResolvedValue([undefined]);
    const buildSpy = vi
      .spyOn(runtime as any, "buildCompiledResourceFromScript")
      .mockResolvedValue({ compiledResource });

    const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });

    expect(buildSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("compiled revision 不匹配时不向页面发布当前脚本资料", async () => {
    const { runtime, scriptRes, compiledResource } = createFullContext();
    await runtime.applyScriptMatchInfo(scriptRes);
    vi.spyOn(runtime, "buildCompiledResourceFromScript").mockResolvedValue({
      compiledResource: { ...compiledResource, scriptRevision: "1".repeat(64) },
    } as any);

    const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });

    expect(result).toBeNull();
  });

  it("页面脚本资料携带已注册的编译 revision", async () => {
    const { runtime, script, scriptRes, mockScriptService, mockCompiledResourceDAO } = createFullContext();
    await runtime.applyScriptMatchInfo(scriptRes);
    (runtime as any).buildCompiledResourceFromScript.mockRestore();
    mockScriptService.buildScriptRunResource.mockResolvedValue(scriptRes);
    const registeredCandidate = await runtime.buildCompiledResourceFromScript(script, true);
    mockCompiledResourceDAO.gets.mockResolvedValue([registeredCandidate!.compiledResource]);

    const result = await runtime.getScriptsForTab({ url: pageUrl, tabId: undefined, frameId: undefined });

    expect(result!.injectScriptList[0].scriptRevision).toBe(registeredCandidate!.compiledResource.scriptRevision);
  });
});

describe("pageLoad 按消息发送方标签页区分隐身上下文", () => {
  const createSender = (incognito: boolean): chrome.runtime.MessageSender => ({
    id: "scriptcat-test",
    url: "https://www.example.com/page",
    frameId: 0,
    tab: {
      id: incognito ? 22 : 11,
      index: 0,
      windowId: incognito ? 2 : 1,
      active: true,
      highlighted: true,
      selected: true,
      pinned: false,
      incognito,
      discarded: false,
      frozen: false,
      autoDiscardable: true,
      groupId: -1,
      url: "https://www.example.com/page",
    },
  });

  it("拒绝 USER_SCRIPT 来源直接请求页面脚本清单", async () => {
    const { runtime } = _createRuntimeContext();
    const getScriptsForTab = vi.spyOn(runtime, "getScriptsForTab");

    const result = await runtime.pageLoad(undefined, new SenderRuntime(createSender(false), "userScript"));

    expect(result).toEqual({ ok: false });
    expect(getScriptsForTab).not.toHaveBeenCalled();
  });

  it.each([
    ["普通", false],
    ["隐身", true],
  ] as const)("真实 RuntimeMessageSender 的%s标签页状态会传给脚本匹配", async (_label, incognito) => {
    const { runtime } = _createRuntimeContext();
    const getScriptsForTab = vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue(null);

    await runtime.pageLoad(undefined, new SenderRuntime(createSender(incognito)));

    expect(getScriptsForTab).toHaveBeenCalledWith({
      url: "https://www.example.com/page",
      tabId: incognito ? 22 : 11,
      frameId: 0,
      incognito,
    });
  });

  it("preserves tab ID zero for page matching and BFCache reporting", async () => {
    const { runtime, mockGroup } = _createRuntimeContext();
    const getScriptsForTab = vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue(null);
    const sender = new SenderRuntime({
      ...createSender(false),
      tab: { ...(createSender(false).tab as chrome.tabs.Tab), id: 0 } as chrome.tabs.Tab,
    });

    await runtime.pageLoad(undefined, sender);
    await runtime.pageShow(undefined, sender);

    expect(getScriptsForTab).toHaveBeenCalledWith({
      url: "https://www.example.com/page",
      tabId: 0,
      frameId: 0,
      incognito: false,
    });
    expect(mockGroup.emit).toHaveBeenCalledWith("popupPageRestored", {
      tabId: 0,
      frameId: 0,
      url: "https://www.example.com/page",
    });
  });

  it("discards an older same-frame pageLoad response that resolves after a newer one", async () => {
    const { runtime } = _createRuntimeContext();
    const firstScript = _createScriptRunResource(_createMockScript({ uuid: "first-page-load" }));
    const secondScript = _createScriptRunResource(_createMockScript({ uuid: "second-page-load" }));
    const loadResult = (script: ScriptRunResource) =>
      ({
        injectScriptList: [script],
        contentScriptList: [],
        envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
        scriptmenus: [],
      }) as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>;
    let resolveFirst!: (result: Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>) => void;
    let resolveSecond!: (result: Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>) => void;
    vi.spyOn(runtime, "getScriptsForTab")
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));
    const sender = new SenderRuntime({
      url: "https://www.example.com/page",
      frameId: 0,
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender);

    const firstLoad = runtime.pageLoad(undefined, sender);
    const secondLoad = runtime.pageLoad(undefined, sender);
    resolveSecond(loadResult(secondScript));
    const second = await secondLoad;
    expect(second.ok).toBe(true);
    const secondHandle = second.ok ? second.injectScriptList[0].executionHandle : undefined;

    resolveFirst(loadResult(firstScript));
    await expect(firstLoad).resolves.toEqual({ ok: false });
    expect(runtime.resolvePageExecutionBinding(secondHandle!, sender)).toBeDefined();
  });

  // bfcache 还原不会重新注入 content script，页面里的脚本却还活着；
  // 这条上报只用来重新确认「本页扩展触及得到」，绝不能顺带重放脚本。
  it("bfcache 还原上报只广播 popupPageRestored，不重新下发脚本", async () => {
    const { runtime, mockGroup } = _createRuntimeContext();
    const getScriptsForTab = vi.spyOn(runtime, "getScriptsForTab");

    await runtime.pageShow(undefined, new SenderRuntime(createSender(false)));

    expect(getScriptsForTab).not.toHaveBeenCalled();
    expect(mockGroup.emit).toHaveBeenCalledWith("popupPageRestored", {
      tabId: 11,
      frameId: 0,
      url: "https://www.example.com/page",
    });
  });

  it("为每个页面文档签发绑定，并拒绝跨标签页、跨 frame 和旧文档复用", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createScriptRunResource(
      _createMockScript({ uuid: "bound-script", metadata: { grant: ["GM_getTab"] } })
    );
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [script],
      contentScriptList: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);

    const rawSender = {
      url: "https://www.example.com/page",
      frameId: 0,
      documentId: "doc-a",
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender;
    const sender = new SenderRuntime(rawSender);
    const first = await runtime.pageLoad(undefined, sender);
    const firstHandle = first.ok ? first.injectScriptList[0].executionHandle : undefined;
    const firstRunFlag = first.ok ? first.injectScriptList[0].executionRunFlag : undefined;
    expect(firstHandle).toEqual(expect.any(String));
    expect(firstRunFlag).toEqual(expect.any(String));
    expect(runtime.resolvePageExecutionBinding(firstHandle!, sender)).toMatchObject({
      uuid: "bound-script",
      envTag: "it",
      tabId: 41,
      frameId: 0,
      documentId: "doc-a",
    });

    const otherTab = new SenderRuntime({ ...rawSender, tab: { ...rawSender.tab, id: 42 } as chrome.tabs.Tab });
    const otherFrame = new SenderRuntime({ ...rawSender, frameId: 1 });
    expect(runtime.resolvePageExecutionBinding(firstHandle!, otherTab)).toBeUndefined();
    expect(runtime.resolvePageExecutionBinding(firstHandle!, otherFrame)).toBeUndefined();

    const secondSender = new SenderRuntime({ ...rawSender, documentId: "doc-b" });
    const second = await runtime.pageLoad(undefined, secondSender);
    const secondHandle = second.ok ? second.injectScriptList[0].executionHandle : undefined;
    const secondRunFlag = second.ok ? second.injectScriptList[0].executionRunFlag : undefined;
    expect(secondHandle).toEqual(expect.any(String));
    expect(secondRunFlag).toEqual(expect.any(String));
    expect(secondHandle).not.toBe(firstHandle);
    expect(secondRunFlag).not.toBe(firstRunFlag);
    expect(runtime.resolvePageExecutionBinding(firstHandle!, sender)).toBeUndefined();
    expect(runtime.resolvePageExecutionBinding(secondHandle!, secondSender)).toBeDefined();

    runtime.revokePageBindingsForTab(41);
    expect(runtime.resolvePageExecutionBinding(firstHandle!, sender)).toBeUndefined();
    expect(runtime.resolvePageExecutionBinding(secondHandle!, secondSender)).toBeUndefined();
  });

  it("新文档加载时撤销上一文档的执行绑定", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createScriptRunResource(_createMockScript({ uuid: "navigation-bound-script" }));
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [script],
      contentScriptList: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);
    const firstRawSender = {
      url: "https://www.example.com/first",
      frameId: 0,
      documentId: "doc-first",
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender;
    const firstSender = new SenderRuntime(firstRawSender);
    const firstLoad = await runtime.pageLoad(undefined, firstSender);
    expect(firstLoad.ok).toBe(true);
    if (!firstLoad.ok) return;
    const firstHandle = firstLoad.injectScriptList[0].executionHandle;
    expect(runtime.resolvePageExecutionBinding(firstHandle!, firstSender)).toBeDefined();

    const secondRawSender = { ...firstRawSender, url: "https://www.example.com/second", documentId: "doc-second" };
    const secondSender = new SenderRuntime(secondRawSender);
    const secondLoad = await runtime.pageLoad(undefined, secondSender);
    expect(secondLoad.ok).toBe(true);
    if (!secondLoad.ok) return;

    expect(runtime.resolvePageExecutionBinding(firstHandle!, firstSender)).toBeUndefined();
  });

  it("rejects a stale URL when the browser omits documentId", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createScriptRunResource(
      _createMockScript({ uuid: "url-bound-script", metadata: { grant: ["GM_getTab"] } })
    );
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [script],
      contentScriptList: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);
    const initialSender = new SenderRuntime({
      url: "https://www.example.com/page",
      frameId: 0,
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender);

    const load = await runtime.pageLoad(undefined, initialSender);
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    const handle = load.injectScriptList[0].executionHandle;
    expect(runtime.resolvePageExecutionBinding(handle!, initialSender)).toBeDefined();

    const navigatedSender = new SenderRuntime({
      url: "https://www.example.com/next",
      frameId: 0,
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender);
    expect(runtime.resolvePageExecutionBinding(handle!, navigatedSender)).toBeUndefined();
  });

  it("content USER_SCRIPT 的 pageLoad 只轮换 content 绑定", async () => {
    const { runtime } = _createRuntimeContext();
    const inject = _createScriptRunResource(_createMockScript({ uuid: "inject-script" }));
    const content = _createScriptRunResource(_createMockScript({ uuid: "content-script" }));
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [inject],
      contentScriptList: [content],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);
    const sender = new SenderRuntime({
      url: "https://www.example.com/page",
      frameId: 0,
      documentId: "doc-a",
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender);

    const first = await runtime.pageLoad(undefined, sender);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const injectHandle = first.injectScriptList[0].executionHandle;
    const contentLoad = await runtime.pageLoad({ envTag: "ct" }, sender);

    expect(contentLoad.ok).toBe(true);
    if (!contentLoad.ok) return;
    expect(contentLoad.injectScriptList).toEqual([]);
    expect(contentLoad.contentScriptList[0].executionHandle).toEqual(expect.any(String));
    expect(runtime.resolvePageExecutionBinding(injectHandle!, sender)).toBeDefined();
  });

  it("isolated scripting 的 pageLoad 会撤销上一轮 content 绑定", async () => {
    const { runtime } = _createRuntimeContext();
    const inject = _createScriptRunResource(_createMockScript({ uuid: "inject-script" }));
    const content = _createScriptRunResource(_createMockScript({ uuid: "content-script" }));
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [inject],
      contentScriptList: [content],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);
    const sender = new SenderRuntime({
      url: "https://www.example.com/page",
      frameId: 0,
      documentId: "doc-a",
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender);

    const contentLoad = await runtime.pageLoad({ envTag: "ct" }, sender);
    expect(contentLoad.ok).toBe(true);
    if (!contentLoad.ok) return;
    const contentHandle = contentLoad.contentScriptList[0].executionHandle;
    const injectLoad = await runtime.pageLoad({ envTag: "it" }, sender);

    expect(injectLoad.ok).toBe(true);
    expect(runtime.resolvePageExecutionBinding(contentHandle!, sender)).toBeUndefined();
  });

  it("没有匹配脚本时也会撤销当前页面的旧绑定", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createScriptRunResource(_createMockScript({ uuid: "stale-script" }));
    const getScriptsForTab = vi.spyOn(runtime, "getScriptsForTab");
    getScriptsForTab.mockResolvedValueOnce({
      injectScriptList: [script],
      contentScriptList: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);
    getScriptsForTab.mockResolvedValueOnce(null);
    const sender = new SenderRuntime({
      url: "https://www.example.com/page",
      frameId: 0,
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender);

    const first = await runtime.pageLoad(undefined, sender);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const handle = first.injectScriptList[0].executionHandle;
    expect(runtime.resolvePageExecutionBinding(handle!, sender)).toBeDefined();

    await runtime.pageLoad(undefined, sender);
    expect(runtime.resolvePageExecutionBinding(handle!, sender)).toBeUndefined();
  });
});

describe("page execution binding effective grants (P1-2)", () => {
  // issuePageBinding() must compute allowedAPIs from the same effective-grant policy as
  // ExecScript and the content fallback PageRpcRegistry, not raw metadata.grant. Otherwise a
  // context-menu script with `@grant none` can register its menu command locally but the SW
  // binding rejects the resulting GM_registerMenuCommand page RPC call.
  it("SW Test A (it): context-menu + grant none allows GM_registerMenuCommand, denies GM_setValue", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createScriptRunResource(
      _createMockScript({
        metadata: { match: ["https://www.example.com/*"], grant: ["none"], "run-at": ["context-menu"] },
      })
    );
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [script],
      contentScriptList: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);
    const sender = new SenderRuntime({
      url: "https://www.example.com/page",
      frameId: 0,
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender);

    const pageLoad = await runtime.pageLoad({ envTag: "it" }, sender);
    expect(pageLoad.ok).toBe(true);
    if (!pageLoad.ok) return;
    const handle = pageLoad.injectScriptList[0].executionHandle;
    expect(handle).toEqual(expect.any(String));

    const binding = runtime.resolvePageExecutionBinding(handle!, sender);
    expect(binding?.allowedAPIs.has("GM_registerMenuCommand")).toBe(true);
    expect(binding?.allowedAPIs.has("GM_setValue")).toBe(false);
  });

  it("SW Test B (ct): context-menu + grant none allows GM_registerMenuCommand, denies GM_setValue", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createScriptRunResource(
      _createMockScript({
        metadata: { match: ["https://www.example.com/*"], grant: ["none"], "run-at": ["context-menu"] },
      })
    );
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [],
      contentScriptList: [script],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);
    const sender = new SenderRuntime({
      url: "https://www.example.com/page",
      frameId: 0,
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender);

    const pageLoad = await runtime.pageLoad({ envTag: "ct" }, sender);
    expect(pageLoad.ok).toBe(true);
    if (!pageLoad.ok) return;
    const handle = pageLoad.contentScriptList[0].executionHandle;
    expect(handle).toEqual(expect.any(String));

    const binding = runtime.resolvePageExecutionBinding(handle!, sender);
    expect(binding?.allowedAPIs.has("GM_registerMenuCommand")).toBe(true);
    expect(binding?.allowedAPIs.has("GM_setValue")).toBe(false);
  });
});

describe("USER_SCRIPT native callbacks", () => {
  it("does not issue or accept a native MAIN bootstrap", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createScriptRunResource(
      _createMockScript({ uuid: "inject-script", metadata: { match: ["https://www.example.com/*"] } })
    );
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [script],
      contentScriptList: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);

    const rawSender = {
      url: "https://www.example.com/page",
      frameId: 0,
      documentId: "doc-main",
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender;

    const pageLoad = await runtime.pageLoad({ envTag: "it" }, new SenderRuntime(rawSender));
    expect(pageLoad.ok).toBe(true);
    if (!pageLoad.ok) return;
    expect("userScriptInjectBootstrapToken" in pageLoad).toBe(false);

    const connection = {
      onMessage: vi.fn(),
      sendMessage: vi.fn(),
      disconnect: vi.fn(),
      onDisconnect: vi.fn(),
    } as unknown as MessageConnect;
    const sender = {
      getType: () => 3,
      isType: () => true,
      getSender: () => rawSender,
      getExtMessageSender: () => ({ tabId: 41, frameId: 0, documentId: "doc-main" }),
      getConnect: () => connection,
      getConnectOrigin: () => "extension" as const,
    };

    expect(
      runtime.registerUserScriptConnection(
        { world: "MAIN", bootstrapToken: "not-issued", transport: "extension" },
        sender
      )
    ).toBe(false);
  });

  it("queues USER_SCRIPT value updates until a reconnect finishes its bootstrap", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createScriptRunResource(
      _createMockScript({ uuid: "queued-content-script", metadata: { match: ["https://www.example.com/*"] } })
    );
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [],
      contentScriptList: [script],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);

    const rawSender = {
      url: "https://www.example.com/page",
      frameId: 0,
      documentId: "doc-a",
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender;
    const makeConnection = () =>
      ({
        onMessage: vi.fn(),
        sendMessage: vi.fn(),
        disconnect: vi.fn(),
        onDisconnect: vi.fn(),
      }) as unknown as MessageConnect;
    const firstConnection = makeConnection();
    const sender = {
      getType: () => 3,
      isType: () => true,
      getSender: () => rawSender,
      getExtMessageSender: () => ({ tabId: 41, frameId: 0, documentId: "doc-a" }),
      getConnect: () => firstConnection,
      getConnectOrigin: () => "userScript" as const,
    };
    const pageLoad = await runtime.pageLoad({ envTag: "it" }, new SenderRuntime(rawSender));
    const contentBootstrapToken = pageLoad.ok ? pageLoad.userScriptBootstrapToken : undefined;
    expect(contentBootstrapToken).toEqual(expect.any(String));
    expect(
      runtime.registerUserScriptConnection({ world: "USER_SCRIPT", bootstrapToken: contentBootstrapToken }, sender)
    ).toBe(true);

    const update = {
      uuid: script.uuid,
      storageName: getStorageName(script),
      entries: [["beforeReconnect", [0, "new"], [0, "old"]]],
      sender: { runFlag: "remote", tabId: 42 },
      valueUpdated: true,
    };
    (runtime as any).sendUserScriptMessage(undefined, "runtime/valueUpdate", update);
    expect(firstConnection.sendMessage).not.toHaveBeenCalled();

    const firstBootstrapHandler = (firstConnection.onMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      packet: TMessage
    ) => void;
    firstBootstrapHandler({ action: "userScript/bootstrap" });
    expect(firstConnection.sendMessage).toHaveBeenCalledTimes(2);
    expect(firstConnection.sendMessage).toHaveBeenLastCalledWith({
      action: "content/runtime/valueUpdate",
      data: update,
    });

    const disconnectHandler = (firstConnection.onDisconnect as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      isSelfDisconnected: boolean
    ) => void;
    disconnectHandler(false);
    (runtime as any).sendUserScriptMessage(undefined, "runtime/valueUpdate", {
      ...update,
      entries: [["afterReconnect", [0, "next"], [0, "old-next"]]],
    });
    (runtime as any).sendUserScriptMessage(undefined, "runtime/valueUpdate", {
      ...update,
      entries: [["afterReconnectAgain", [0, "latest"], [0, "old-latest"]]],
    });
    const reconnect = runtime.reconnectUserScript(
      { reconnectToken: contentBootstrapToken },
      {
        getType: () => 4,
        isType: (type: number) => type === 4,
        getSender: () => rawSender,
        getExtMessageSender: () => ({ tabId: 41, frameId: 0, documentId: "doc-a" }),
        getConnect: () => undefined,
        getConnectOrigin: () => "userScript" as const,
      }
    );
    expect(reconnect).toEqual({ bootstrapToken: expect.any(String) });

    const secondConnection = makeConnection();
    expect(
      runtime.registerUserScriptConnection(
        { world: "USER_SCRIPT", bootstrapToken: reconnect?.bootstrapToken },
        { ...sender, getConnect: () => secondConnection }
      )
    ).toBe(true);
    const secondBootstrapHandler = (secondConnection.onMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      packet: TMessage
    ) => void;
    secondBootstrapHandler({ action: "userScript/bootstrap" });

    expect(secondConnection.sendMessage).toHaveBeenCalledTimes(2);
    expect(secondConnection.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "content/runtime/valueUpdate",
        data: expect.objectContaining({
          entries: [
            ["afterReconnect", [0, "next"], [0, "old-next"]],
            ["afterReconnectAgain", [0, "latest"], [0, "old-latest"]],
          ],
        }),
      })
    );
  });

  it("只向当前文档中声明了对应脚本或 storageName 的连接投递更新", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createScriptRunResource(
      _createMockScript({ uuid: "content-script", metadata: { match: ["https://www.example.com/*"] } })
    );
    vi.spyOn(runtime, "getScriptsForTab").mockResolvedValue({
      injectScriptList: [],
      contentScriptList: [script],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      scriptmenus: [],
    } as unknown as Awaited<ReturnType<RuntimeService["getScriptsForTab"]>>);

    const rawSender = {
      url: "https://www.example.com/page",
      frameId: 0,
      documentId: "doc-a",
      tab: { id: 41, incognito: false } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender;
    const sendMessage = vi.fn();
    const onMessage = vi.fn();
    const connection = {
      onMessage,
      sendMessage,
      disconnect: vi.fn(),
      onDisconnect: vi.fn(),
    } as unknown as MessageConnect;
    const connectionSender = {
      getType: () => 3,
      isType: () => true,
      getSender: () => rawSender,
      getExtMessageSender: () => ({ tabId: 41, frameId: 0, documentId: "doc-a" }),
      getConnect: () => connection,
      getConnectOrigin: () => "userScript" as const,
    };

    const pageLoad = await runtime.pageLoad({ envTag: "it" }, new SenderRuntime(rawSender));
    const contentBindings = [...(runtime as any).pageExecutionBindings.values()] as Array<{ handle: string }>;
    const handles = contentBindings.map(({ handle }) => handle);
    expect(handles).toHaveLength(1);
    expect(pageLoad.ok && pageLoad.userScriptBootstrapToken).toEqual(expect.any(String));
    const bootstrapToken = pageLoad.ok ? pageLoad.userScriptBootstrapToken : undefined;
    expect(
      runtime.registerUserScriptConnection(
        { world: "USER_SCRIPT", bootstrapToken },
        { ...connectionSender, getConnectOrigin: () => "extension" as const }
      )
    ).toBe(false);
    expect(
      runtime.registerUserScriptConnection(
        { world: "USER_SCRIPT", bootstrapToken, transport: "extension" },
        connectionSender
      )
    ).toBe(false);
    expect(
      runtime.registerUserScriptConnection(
        { world: "USER_SCRIPT", bootstrapToken, transport: "extension" },
        { ...connectionSender, getConnectOrigin: () => "extension" as const }
      )
    ).toBe(true);
    expect(runtime.registerUserScriptConnection({ world: "USER_SCRIPT" }, connectionSender)).toBe(false);
    const bootstrapHandler = onMessage.mock.calls[0]?.[0] as ((packet: TMessage) => void) | undefined;
    bootstrapHandler?.({ action: "userScript/bootstrap" });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "content/pageLoad",
        data: expect.objectContaining({ scripts: expect.any(Array) }),
      })
    );

    const sendUserScriptMessage = (runtime as any).sendUserScriptMessage.bind(runtime);
    sendMessage.mockClear();
    sendUserScriptMessage(undefined, "runtime/valueUpdate", {
      uuid: "other-script",
      storageName: getStorageName(script),
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    sendMessage.mockClear();
    sendUserScriptMessage(undefined, "runtime/valueUpdate", {
      uuid: "content-script",
      storageName: "unrelated-storage",
    });
    expect(sendMessage).not.toHaveBeenCalled();

    const reconnect = runtime.reconnectUserScript(
      { reconnectToken: bootstrapToken },
      {
        getType: () => 4,
        isType: (type: number) => type === 4,
        getSender: () => rawSender,
        getExtMessageSender: () => ({ tabId: 41, frameId: 0, documentId: "doc-a" }),
        getConnect: () => undefined,
        getConnectOrigin: () => "extension" as const,
      }
    );
    expect(reconnect).toEqual({ bootstrapToken: expect.any(String) });
    expect((runtime as any).userScriptBootstraps.size).toBe(1);
    expect(
      runtime.reconnectUserScript(
        { reconnectToken: bootstrapToken },
        {
          getType: () => 4,
          isType: (type: number) => type === 4,
          getSender: () => rawSender,
          getExtMessageSender: () => ({ tabId: 41, frameId: 0, documentId: "doc-a" }),
          getConnect: () => undefined,
          getConnectOrigin: () => "userScript" as const,
        }
      )
    ).toBeUndefined();

    (runtime as any).revokePageBindingsForScript("content-script");
    expect(connection.disconnect).toHaveBeenCalledWith(true);
    expect((runtime as any).userScriptConnections.size).toBe(0);
  });
});

describe("sandbox verified 初始化重放", () => {
  it("忽略 fallback 通知，并且真实握手与重复握手只初始化一次脚本和语言监听", async () => {
    const { runtime, mockSystemConfig, mockScriptDAO } = _createRuntimeContext();
    mockScriptDAO.all.mockResolvedValue([
      _createMockScript({ uuid: "background-script", type: SCRIPT_TYPE_BACKGROUND, status: SCRIPT_STATUS_ENABLE }),
    ]);
    const handlePreparationOffscreen = (
      runtime as unknown as { handlePreparationOffscreen(data: { verified: boolean }): Promise<void> }
    ).handlePreparationOffscreen.bind(runtime);

    await handlePreparationOffscreen({ verified: false });
    await handlePreparationOffscreen({ verified: true });
    await handlePreparationOffscreen({ verified: true });

    expect(mockScriptDAO.all).toHaveBeenCalledTimes(1);
    expect((runtime.mq as unknown as { publish: ReturnType<typeof vi.fn> }).publish).toHaveBeenCalledWith(
      "enableScripts",
      [{ uuid: "background-script", enable: true }]
    );
    expect((runtime.mq as unknown as { publish: ReturnType<typeof vi.fn> }).publish).toHaveBeenCalledWith(
      "setSandboxLanguage",
      "zh-CN"
    );
    expect(mockSystemConfig.addListener).toHaveBeenCalledTimes(1);
    expect(mockSystemConfig.addListener).toHaveBeenCalledWith("language", expect.any(Function));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("MQ 事件处理效果（enableScripts / deleteScripts / sortedScripts）", () => {
  /**
   * 这些测试直接调用 runtime 内部方法，验证各事件处理器执行后的可观测状态。
   * 注释标注了对应事件处理器中的调用路径。
   */
  const pageUrl = "https://www.example.com/path";

  it("deleteScripts 效果：匹配器规则清除、运行时缓存删除、sorter 权重移除", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createMockScript({ sort: 5 });
    const scriptRes = _createScriptRunResource(script);

    await runtime.applyScriptMatchInfo(scriptRes);
    // 初始状态：脚本在匹配器中可以找到
    expect(runtime.getPageScriptMatchingResultByUrl(pageUrl).has(script.uuid)).toBe(true);

    // 模拟 deleteScripts 处理器执行的操作
    (runtime as any).invalidateDisabledMatcher();
    (runtime as any).updateSorter((next: Record<string, number>) => {
      (runtime as any).deleteScriptRuntimeCache(script.uuid);
      (runtime as any).deleteScriptSort(next, script.uuid);
      runtime.scriptMatchEnable.clearRules(script.uuid);
      runtime.scriptMatchEnable.clearRules((runtime as any).getOriginalMatchUuid(script.uuid));
    });

    // 删除后：匹配器中找不到，sorter 中也无该 uuid
    expect(runtime.getPageScriptMatchingResultByUrl(pageUrl).has(script.uuid)).toBe(false);
    expect((runtime as any).sorter[script.uuid]).toBeUndefined();
    expect((runtime as any).pageLoadCaches.has(script.uuid)).toBe(false);
  });

  it("sortedScripts 效果：updateSorter 使 URL 结果缓存失效，下次匹配反映新顺序", async () => {
    const { runtime } = _createRuntimeContext();
    const scriptA = _createMockScript({ sort: 10 });
    const scriptB = _createMockScript({ sort: 20 });
    await runtime.applyScriptMatchInfo(_createScriptRunResource(scriptA));
    await runtime.applyScriptMatchInfo(_createScriptRunResource(scriptB));

    // 首次查询（建立 URL 缓存）
    const before = [...runtime.getPageScriptMatchingResultByUrl(pageUrl).keys()];
    expect(before[0]).toBe(scriptA.uuid); // sort 10 在前

    // 模拟 sortedScripts 处理器：调换 sort 权重
    (runtime as any).updateSorter((next: Record<string, number>) => {
      (runtime as any).setScriptSort(next, { uuid: scriptA.uuid, sort: 30 }); // 调低
      (runtime as any).setScriptSort(next, { uuid: scriptB.uuid, sort: 5 }); // 调高
    });

    const after = [...runtime.getPageScriptMatchingResultByUrl(pageUrl).keys()];
    expect(after[0]).toBe(scriptB.uuid); // sort 5 在前
  });

  it("enableScripts 禁用效果：清除匹配器规则和运行时缓存，脚本不再出现在 getPageScriptMatchingResultByUrl", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createMockScript();
    await runtime.applyScriptMatchInfo(_createScriptRunResource(script));
    expect(runtime.getPageScriptMatchingResultByUrl(pageUrl).has(script.uuid)).toBe(true);

    // 模拟 enableScripts（disable 分支）处理器执行的操作
    (runtime as any).invalidateDisabledMatcher();
    (runtime as any).deleteScriptRuntimeCache(script.uuid);
    runtime.scriptMatchEnable.clearRules(script.uuid);
    runtime.scriptMatchEnable.clearRules((runtime as any).getOriginalMatchUuid(script.uuid));

    expect(runtime.getPageScriptMatchingResultByUrl(pageUrl).has(script.uuid)).toBe(false);
    expect((runtime as any).disabledMatcher).toBeNull();
  });

  it("installScript 效果：invalidateDisabledMatcher 使 disabledMatcher 缓存失效", async () => {
    const { runtime, mockScriptDAO } = _createRuntimeContext();
    const disabledScript = _createMockScript({ status: SCRIPT_STATUS_DISABLE });
    mockScriptDAO.all.mockResolvedValue([disabledScript]);

    // 建立 disabled matcher 缓存
    await runtime.getPopupPageScriptMatchingResultByUrl(pageUrl);
    expect((runtime as any).disabledMatcher).not.toBeNull();

    // 模拟 installScript 处理器最开始做的事
    (runtime as any).invalidateDisabledMatcher();

    expect((runtime as any).disabledMatcher).toBeNull();
  });

  it("deleteScriptRuntimeCache 一次性清除三层缓存（pageLoadCaches / codeCacheMap / cachedPatterns）", () => {
    const { runtime } = _createRuntimeContext();
    const uuid = randomUUID();

    // 手动往三层缓存里写入假数据
    (runtime as any).pageLoadCaches.set(uuid, { scriptCacheKey: "k" });
    (runtime as any).codeCacheMap.set(uuid, { cacheKey: "c" });
    (runtime as any).cachedPatterns.set(uuid, { scriptUrlPatterns: [], originalUrlPatterns: [] });

    (runtime as any).deleteScriptRuntimeCache(uuid);

    expect((runtime as any).pageLoadCaches.has(uuid)).toBe(false);
    expect((runtime as any).codeCacheMap.has(uuid)).toBe(false);
    expect((runtime as any).cachedPatterns.has(uuid)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("restoreJSCodeFromCompiledResource 还原代码时的生效 metadata", () => {
  // 设置面板改运行时机只写 selfMetadata，脚本自带 metadata 原封不动；
  // 还原路径若只看自带 metadata，重新注册后用户覆写就会静默失效（#1649）。
  const createContext = (script: Script) => {
    const { runtime, mockScriptService } = _createRuntimeContext();
    const scriptRes = _createScriptRunResource(script);
    const compiledResource: CompiledResource = {
      name: script.name,
      flag: `#-${script.uuid}`,
      uuid: script.uuid,
      scriptRevision: "0".repeat(64),
      require: [],
      matches: ["https://www.example.com/*"],
      includeGlobs: [],
      excludeMatches: [],
      excludeGlobs: [],
      allFrames: false,
      world: "MAIN",
      runAt: "document_idle",
      scriptUrlPatterns: scriptURLPatternResults(scriptRes)!.scriptUrlPatterns,
      originalUrlPatterns: null,
    };
    mockScriptService.buildScriptRunResource.mockResolvedValue(scriptRes);
    (runtime as any).script = {
      ...mockScriptService,
      scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "console.log(1);" }) },
    };
    (runtime as any).resource = { resourceDAO: { get: vi.fn().mockResolvedValue(undefined) } };
    return { runtime, compiledResource };
  };

  it("selfMetadata 覆写 run-at=context-menu 时，还原的代码应包裹 GM_registerMenuCommand", async () => {
    const script = _createMockScript({
      metadata: { match: ["https://www.example.com/*"], "run-at": ["document-idle"] },
      selfMetadata: { "run-at": ["context-menu"] },
    });
    const { runtime, compiledResource } = createContext(script);

    const code = await runtime.restoreJSCodeFromCompiledResource(script, compiledResource);

    expect(code).toContain("GM_registerMenuCommand");
  });

  it("selfMetadata 覆写为 early-start 时，还原的代码应走预注入编译", async () => {
    const script = _createMockScript({
      metadata: { match: ["https://www.example.com/*"], "run-at": ["document-idle"] },
      selfMetadata: { "early-start": [""], "run-at": ["document-start"] },
    });
    const { runtime, compiledResource } = createContext(script);

    const code = await runtime.restoreJSCodeFromCompiledResource(script, compiledResource);

    expect(code).toContain("performance.dispatchEvent");
  });
});

describe("pushValueUpdate 判断是否需要为 early-start 脚本重新编译", () => {
  // early-start 会把 GM 值编进预注入代码，值变了必须重编；
  // 该脚本的 early-start 可能来自用户覆写，不能只看脚本自带 metadata。
  it("selfMetadata 覆写为 early-start 的脚本，值更新后应重新编译注册", async () => {
    const { runtime } = _createRuntimeContext();
    const script = _createMockScript({
      metadata: { match: ["https://www.example.com/*"], "run-at": ["document-idle"] },
      selfMetadata: { "early-start": [""], "run-at": ["document-start"] },
    });
    const updateSpy = vi.spyOn(runtime, "updateResourceOnScriptChange").mockResolvedValue(undefined);

    await runtime.pushValueUpdate(script, {
      entries: [],
      uuid: script.uuid,
      storageName: "test-storage",
      sender: { runFlag: "", tabId: -1 },
      valueUpdated: true,
    });

    expect(updateSpy).toHaveBeenCalledWith(script);
  });
});

describe("waitInit CompiledResourceNamespace 迁移", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("命名空间不匹配时清理已启用普通脚本与共享注册资源，并让下次注册不再被判定为已完成", async () => {
    const { runtime, mockScriptDAO } = _createRuntimeContext();
    const localStorageDAO = (runtime as unknown as { localStorageDAO: LocalStorageDAO }).localStorageDAO;
    // 审计头 601e5502 上实际持久化的旧 CompiledResourceNamespace 值；必须真的碰到这个历史值
    // 才代表命中了迁移边界，而不是随便一个必然不相等的字符串——命名空间还没提升前，
    // 这个值会与当前 CompiledResourceNamespace 相等，下面的清理断言会失败（RED）。
    const previousNamespace = "9a12f3c8-1b72-4c8a-875c-8a941f44d9f1";
    await localStorageDAO.saveValue("compiledResourceNamespace", previousNamespace);

    const enabledScript = _createMockScript({ uuid: "legacy-normal-script" });
    mockScriptDAO.all.mockResolvedValue([enabledScript]);
    // waitInit() 会为「已启用普通脚本」预热 compiledResourceDAO 缓存未命中时的编译；
    // 这里只需要它不因缺少 resource/script 依赖而抛出未处理的 rejection。
    (runtime as unknown as { resource: { getScriptResourceValueByType: unknown } }).resource = {
      getScriptResourceValueByType: vi.fn().mockResolvedValue({ require: {}, "require-css": {}, resource: {} }),
    };
    (runtime as unknown as { script: { scriptCodeDAO: { get: unknown } } }).script = {
      scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "" }) },
    };

    const unregistryPageScripts = vi.spyOn(runtime, "unregistryPageScripts").mockResolvedValue(undefined);
    // 清理之后浏览器里不应再看到旧的 scriptcat-inject，下次 registerUserscripts() 才会真的重建。
    vi.spyOn(chrome.userScripts as any, "getScripts").mockResolvedValue([]);

    await runtime.waitInit();
    await runtime.initialCompiledResourcePromise;

    expect(unregistryPageScripts).toHaveBeenCalledWith(
      expect.arrayContaining([
        "legacy-normal-script",
        "scriptcat-early-start-flag",
        "scriptcat-inject",
        "scriptcat-content",
      ]),
      true
    );
    expect(await localStorageDAO.getValue("compiledResourceNamespace")).toBe(CompiledResourceNamespace);
  });

  it("清理完成后 registerUserscripts() 不会因为旧的已完成状态而跳过重建", async () => {
    const { runtime, mockScriptDAO } = _createRuntimeContext();
    const localStorageDAO = (runtime as unknown as { localStorageDAO: LocalStorageDAO }).localStorageDAO;
    await localStorageDAO.saveValue("compiledResourceNamespace", "9a12f3c8-1b72-4c8a-875c-8a941f44d9f1");
    mockScriptDAO.all.mockResolvedValue([]);

    const originalScripting = (chrome as any).scripting;
    (chrome as any).scripting = {
      getRegisteredContentScripts: vi.fn().mockResolvedValue([{ id: "scriptcat-scripting" }]),
      registerContentScripts: vi.fn().mockResolvedValue(undefined),
      unregisterContentScripts: vi.fn().mockResolvedValue(undefined),
    };
    // waitInit() 清理之后，浏览器已不再持有旧的 scriptcat-inject。
    vi.spyOn(chrome.userScripts as any, "getScripts").mockResolvedValue([]);
    vi.spyOn(chrome.userScripts, "register").mockResolvedValue(undefined);
    vi.spyOn(chrome.userScripts, "resetWorldConfiguration").mockResolvedValue(undefined);
    vi.spyOn(runtime, "unregistryPageScripts").mockResolvedValue(undefined);
    vi.spyOn(runtime, "unregisterUserscripts").mockResolvedValue(undefined);
    vi.spyOn(runtime as any, "getParticularScriptList").mockResolvedValue({
      registerScripts: [],
      compiledResourceCandidates: [],
    });
    vi.spyOn(runtime as any, "getContentAndInjectScript").mockResolvedValue({ content: [], inject: [] });
    runtime.isUserScriptsAvailable = true;

    try {
      await runtime.waitInit();
      // getScripts 的调用记录只属于 waitInit() 的迁移判定；下面重新验证 registerUserscripts() 自己的行为。
      (chrome.userScripts.getScripts as any).mockClear();
      await runtime.registerUserscripts();

      // 若 registerState 仍被当成 REGISTER_DONE，这里只会查询健康检查用的 getScripts /
      // getRegisteredContentScripts 就直接返回，不会走到 unregisterUserscripts + register。
      expect(runtime.unregisterUserscripts).toHaveBeenCalled();
      expect(chrome.userScripts.register).toHaveBeenCalled();
    } finally {
      (chrome as any).scripting = originalScripting;
    }
  });
});

describe("registerUserscripts 注册健康检查", () => {
  let runtime: RuntimeService;
  let originalScripting: unknown;

  beforeEach(() => {
    runtime = _createRuntimeContext().runtime;
    originalScripting = (chrome as any).scripting;
    (chrome as any).scripting = {
      getRegisteredContentScripts: vi.fn().mockResolvedValue([{ id: "scriptcat-scripting" }]),
      registerContentScripts: vi.fn().mockResolvedValue(undefined),
      unregisterContentScripts: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(chrome.userScripts as any, "getScripts").mockResolvedValue([{ id: "scriptcat-inject" }]);
    vi.spyOn(chrome.userScripts, "register").mockResolvedValue(undefined);
    vi.spyOn(chrome.userScripts, "resetWorldConfiguration").mockResolvedValue(undefined);
    vi.spyOn(runtime, "unregisterUserscripts").mockResolvedValue(undefined);
    vi.spyOn(runtime as any, "getParticularScriptList").mockResolvedValue({
      registerScripts: [],
      compiledResourceCandidates: [],
    });
    vi.spyOn(runtime as any, "getContentAndInjectScript").mockResolvedValue({ content: [], inject: [] });
    runtime.isUserScriptsAvailable = true;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await runtime.unregisterUserscripts();
    (chrome as any).scripting = originalScripting;
  });

  const primeRegisteredState = async () => {
    await runtime.registerUserscripts();
    vi.clearAllMocks();
  };

  it("已注册用户脚本但 scripting 广播者丢失时重新注册", async () => {
    await primeRegisteredState();
    (chrome as any).scripting.getRegisteredContentScripts.mockResolvedValue([]);

    await runtime.registerUserscripts();

    expect(chrome.userScripts.getScripts).toHaveBeenCalledWith({ ids: ["scriptcat-inject"] });
    expect((chrome as any).scripting.getRegisteredContentScripts).toHaveBeenCalledWith({
      ids: ["scriptcat-scripting"],
    });
    expect(runtime.unregisterUserscripts).toHaveBeenCalled();
    expect(chrome.userScripts.register).toHaveBeenCalled();
  });

  it("用户脚本和 scripting 广播者都在时跳过重复注册", async () => {
    await primeRegisteredState();

    await runtime.registerUserscripts();

    expect(chrome.userScripts.getScripts).toHaveBeenCalledWith({ ids: ["scriptcat-inject"] });
    expect((chrome as any).scripting.getRegisteredContentScripts).toHaveBeenCalledWith({
      ids: ["scriptcat-scripting"],
    });
    expect(runtime.unregisterUserscripts).not.toHaveBeenCalled();
    expect(chrome.userScripts.register).not.toHaveBeenCalled();
  });
});

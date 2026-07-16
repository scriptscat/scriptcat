import { initTestEnv } from "@Tests/utils";
import { ScriptService } from "./script";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import type { Script, ScriptDAO } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { Group } from "@Packages/message/server";
import { Server } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import { MessageQueue } from "@Packages/message/message_queue";
import { MockMessage } from "@Packages/message/mock_message";
import EventEmitter from "eventemitter3";
import type { SystemConfig } from "@App/pkg/config/config";
import type { ValueService } from "./value";
import type { ResourceService } from "./resource";

initTestEnv();

/**
 * selfMetadata 是「用户对脚本自带 @metadata 的覆盖」。
 * undefined 表示撤销覆盖(生效值回落脚本自带 metadata)，空数组表示用户显式清空，两者语义不同。
 */
describe("ScriptService selfMetadata 用户覆盖", () => {
  let scriptService: ScriptService;
  let mockScriptDAO: ScriptDAO;
  let mockGroup: Group;
  let mockMessageQueue: IMessageQueue;

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
      name: ["test-script"],
      match: ["*://script.com/*"],
      exclude: ["*://ads.script.com/*"],
      tag: ["script-tag"],
    },
    ...overrides,
  });

  // 取回 scriptDAO.update 实际写入的 selfMetadata
  const savedSelfMetadata = () => vi.mocked(mockScriptDAO.update).mock.calls[0][1].selfMetadata;

  beforeEach(() => {
    const eventEmitter = new EventEmitter<string, any>();
    const server = new Server("test", new MockMessage(eventEmitter));
    mockGroup = server.group("script");
    mockMessageQueue = new MessageQueue();
    mockMessageQueue.publish = vi.fn();

    mockScriptDAO = {
      get: vi.fn(),
      update: vi.fn().mockResolvedValue(true),
    } as any;

    scriptService = new ScriptService(
      {} as SystemConfig,
      mockGroup,
      mockMessageQueue,
      {} as ValueService,
      {} as ResourceService,
      mockScriptDAO
    );
  });

  describe("excludeUrl - popup 排除/取消排除", () => {
    it("取消最后一条排除后应保存空覆盖，而不是回落脚本自带的 exclude", async () => {
      // 脚本自带 @exclude，用户此前未覆盖：集合以脚本自带规则为起点
      const script = createMockScript();
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeUrl({ uuid: script.uuid, excludePattern: "*://ads.script.com/*", remove: true });

      // 若删除覆盖，生效 exclude 会回落 metadata.exclude 使该规则复活，用户永远取消不掉
      expect(savedSelfMetadata()).toEqual({ exclude: [] });
    });

    it("取消排除后仍有其他规则时应保存剩余规则", async () => {
      const script = createMockScript({
        selfMetadata: { exclude: ["*://ads.script.com/*", "*://user.com/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeUrl({ uuid: script.uuid, excludePattern: "*://user.com/*", remove: true });

      expect(savedSelfMetadata()).toEqual({ exclude: ["*://ads.script.com/*"] });
    });

    it("排除新网站时应追加到覆盖中", async () => {
      const script = createMockScript();
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeUrl({ uuid: script.uuid, excludePattern: "*://user.com/*", remove: false });

      expect(savedSelfMetadata()).toEqual({ exclude: ["*://ads.script.com/*", "*://user.com/*"] });
    });
  });

  describe("resetMatch / resetExclude - 编辑器匹配列表", () => {
    it("传入 undefined(重置)应删除用户覆盖", async () => {
      const script = createMockScript({ selfMetadata: { match: ["*://user.com/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetMatch({ uuid: script.uuid, match: undefined });

      expect(savedSelfMetadata()).toBeUndefined();
    });

    it("传入空数组(删除最后一项)应保存空覆盖", async () => {
      const script = createMockScript({ selfMetadata: { match: ["*://user.com/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetMatch({ uuid: script.uuid, match: [] });

      expect(savedSelfMetadata()).toEqual({ match: [] });
    });

    it("resetExclude 传入 undefined(重置)应删除用户覆盖", async () => {
      const script = createMockScript({ selfMetadata: { exclude: ["*://user.com/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetExclude({ uuid: script.uuid, exclude: undefined });

      expect(savedSelfMetadata()).toBeUndefined();
    });

    it("resetExclude 传入空数组(删除最后一项)应保存空覆盖", async () => {
      const script = createMockScript({ selfMetadata: { exclude: ["*://user.com/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetExclude({ uuid: script.uuid, exclude: [] });

      expect(savedSelfMetadata()).toEqual({ exclude: [] });
    });
  });

  describe("updateMetadata - 标签与运行环境", () => {
    it("删除最后一个标签时应保存空覆盖，而不是回落脚本自带的 tag", async () => {
      const script = createMockScript({ selfMetadata: { tag: ["user-tag"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.updateMetadata({ uuid: script.uuid, key: "tag", value: [] });

      expect(savedSelfMetadata()).toEqual({ tag: [] });
    });

    it("传入 undefined 应删除用户覆盖(run-in 选择「默认」即跟随脚本)", async () => {
      const script = createMockScript({ selfMetadata: { "run-in": ["content-script"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.updateMetadata({ uuid: script.uuid, key: "run-in", value: undefined });

      expect(savedSelfMetadata()).toBeUndefined();
    });
  });
});

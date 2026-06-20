import { describe, it, expect, vi, beforeAll, afterEach, type Mock } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { ScriptInfo } from "@App/pkg/utils/scriptInstall";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";

vi.mock("@App/pages/store/features/script", () => ({
  scriptClient: { getInstallInfo: vi.fn(), install: vi.fn(), setCheckUpdateUrl: vi.fn() },
  subscribeClient: { install: vi.fn() },
  agentClient: {
    getSkillInstallData: vi.fn(),
    completeSkillInstall: vi.fn(),
    cancelSkillInstall: vi.fn(),
    prepareSkillFromUrl: vi.fn(),
  },
}));
vi.mock("@App/pkg/utils/scriptInstall", async (io) => ({
  ...(await io<Record<string, unknown>>()),
  getTempCode: vi.fn(),
}));
vi.mock("@App/pkg/utils/script", async (io) => ({
  ...(await io<Record<string, unknown>>()),
  prepareScriptByCode: vi.fn(),
  prepareSubscribeByCode: vi.fn(),
  fetchScriptBody: vi.fn(),
  parseMetadata: vi.fn(),
}));
vi.mock("@App/pkg/utils/filehandle-db", () => ({
  loadHandle: vi.fn(),
  saveHandle: vi.fn(async () => {}),
  cleanupOldHandles: vi.fn(async () => {}),
}));
vi.mock("@App/pkg/utils/file-tracker", () => ({
  startFileTrack: vi.fn(),
  unmountFileTrack: vi.fn(async () => {}),
}));
vi.mock("@App/app/repo/tempStorage", () => ({
  TempStorageDAO: class {
    update() {
      return Promise.resolve();
    }
    save() {
      return Promise.resolve();
    }
  },
  TempStorageItemType: { tempCode: "tempCode" },
}));

import { scriptClient, agentClient } from "@App/pages/store/features/script";
import { getTempCode } from "@App/pkg/utils/scriptInstall";
import { prepareScriptByCode, fetchScriptBody, parseMetadata } from "@App/pkg/utils/script";
import { loadHandle } from "@App/pkg/utils/filehandle-db";
import { startFileTrack, unmountFileTrack } from "@App/pkg/utils/file-tracker";
import { assembleInstallView, useInstallData } from "./useInstallData";

const makeScriptInfo = (metadata: Record<string, string[]>, url = "https://example.com/x.user.js"): ScriptInfo => ({
  url,
  code: "",
  uuid: "u1",
  userSubscribe: false,
  metadata,
  source: "user",
});

const makeAction = (metadata: Record<string, string[]>): Script =>
  ({ name: "示例脚本", metadata, status: SCRIPT_STATUS_ENABLE }) as unknown as Script;

beforeAll(() => initTestLanguage("zh-CN"));

describe("assembleInstallView 组装安装视图", () => {
  it("全新安装组装名称、来源、版本与权限", () => {
    const metadata = {
      name: ["示例脚本"],
      version: ["2.3.1"],
      author: ["scriptcat"],
      match: ["https://example.com/*"],
      connect: ["*"],
    };
    const view = assembleInstallView({
      isUpdate: false,
      scriptInfo: makeScriptInfo(metadata),
      action: makeAction(metadata),
      code: "// code",
      oldVersion: null,
    });
    expect(view.isSubscribe).toBe(false);
    expect(view.name).toBe("示例脚本");
    expect(view.author).toBe("scriptcat");
    expect(view.source).toContain("example.com");
    expect(view.version).toEqual({ kind: "install", version: "2.3.1" });
    expect(view.permissions.find((p) => p.kind === "connect")?.risk).toBe("danger");
  });

  it("更新态组装 旧→新 版本", () => {
    const metadata = { name: ["示例脚本"], version: ["2.3.1"] };
    const view = assembleInstallView({
      isUpdate: true,
      scriptInfo: makeScriptInfo(metadata),
      action: makeAction(metadata),
      code: "// code",
      oldVersion: "2.1.0",
    });
    expect(view.version).toEqual({ kind: "update", oldVersion: "2.1.0", newVersion: "2.3.1", changed: true });
  });

  it("更新态把旧代码透传到 oldCode 供 diff 使用", () => {
    const metadata = { name: ["示例脚本"], version: ["2.3.1"] };
    const view = assembleInstallView({
      isUpdate: true,
      scriptInfo: makeScriptInfo(metadata),
      action: makeAction(metadata),
      code: "// new code",
      oldVersion: "2.1.0",
      oldCode: "// old code",
    });
    expect(view.oldCode).toBe("// old code");
  });

  it("全新安装无旧代码时 oldCode 为 undefined", () => {
    const metadata = { name: ["示例脚本"], version: ["2.3.1"] };
    const view = assembleInstallView({
      isUpdate: false,
      scriptInfo: makeScriptInfo(metadata),
      action: makeAction(metadata),
      code: "// new code",
      oldVersion: null,
    });
    expect(view.oldCode).toBeUndefined();
  });

  it("更新态且旧代码不同时填充 diffStat 增删统计", () => {
    const metadata = { name: ["示例脚本"], version: ["2.3.1"] };
    const view = assembleInstallView({
      isUpdate: true,
      scriptInfo: makeScriptInfo(metadata),
      action: makeAction(metadata),
      code: "a\nX\nc",
      oldVersion: "2.1.0",
      oldCode: "a\nb\nc",
    });
    expect(view.diffStat).toEqual({ added: 1, removed: 1 });
  });

  it("全新安装(无旧代码)时 diffStat 为 undefined", () => {
    const metadata = { name: ["示例脚本"], version: ["2.3.1"] };
    const view = assembleInstallView({
      isUpdate: false,
      scriptInfo: makeScriptInfo(metadata),
      action: makeAction(metadata),
      code: "a\nb\nc",
      oldVersion: null,
    });
    expect(view.diffStat).toBeUndefined();
  });

  it("定时脚本组装 cron 信息条与下次运行", () => {
    const metadata = { name: ["定时脚本"], version: ["1.0.0"], crontab: ["0 8 * * *"] };
    const view = assembleInstallView({
      isUpdate: false,
      scriptInfo: makeScriptInfo(metadata),
      action: makeAction(metadata),
      code: "// code",
      oldVersion: null,
    });
    expect(view.schedule).toEqual({ kind: "cron", expression: "0 8 * * *" });
    expect(typeof view.scheduleNextRun).toBe("string");
    expect(view.scheduleNextRun!.length).toBeGreaterThan(0);
  });
});

describe("useInstallData 数据流编排", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/install.html");
  });

  it("无 uuid 参数时进入 invalid 状态", () => {
    window.history.replaceState({}, "", "/install.html");
    const { result } = renderHook(() => useInstallData());
    expect(result.current.state.status).toBe("invalid");
  });

  it("uuid 全新安装时读取信息并进入 ready 状态", async () => {
    window.history.replaceState({}, "", "/install.html?uuid=u1");
    const metadata = { name: ["示例脚本"], version: ["1.0.0"], match: ["https://e.com/*"] };
    const info: ScriptInfo = {
      url: "https://e.com/x.user.js",
      code: "",
      uuid: "u1",
      userSubscribe: false,
      metadata,
      source: "user",
    };
    (scriptClient.getInstallInfo as Mock).mockResolvedValue([false, info, {}]);
    (getTempCode as Mock).mockResolvedValue("// code");
    (prepareScriptByCode as Mock).mockResolvedValue({
      script: { name: "示例脚本", metadata, status: SCRIPT_STATUS_ENABLE } as unknown as Script,
    });

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = result.current.state;
    if (state.status !== "ready") throw new Error("not ready");
    expect(state.view.name).toBe("示例脚本");
    expect(state.view.isUpdate).toBe(false);
    expect(result.current.enabled).toBe(true);
  });

  it("uuid 更新时从 oldScriptCode 取旧代码到 view.oldCode", async () => {
    window.history.replaceState({}, "", "/install.html?uuid=u1");
    const metadata = { name: ["示例脚本"], version: ["2.0.0"], match: ["https://e.com/*"] };
    const oldMetadata = { name: ["示例脚本"], version: ["1.0.0"] };
    const info: ScriptInfo = {
      url: "https://e.com/x.user.js",
      code: "",
      uuid: "u1",
      userSubscribe: false,
      metadata,
      source: "user",
    };
    (scriptClient.getInstallInfo as Mock).mockResolvedValue([true, info, {}]);
    (getTempCode as Mock).mockResolvedValue("// new code");
    (prepareScriptByCode as Mock).mockResolvedValue({
      script: { name: "示例脚本", metadata, status: SCRIPT_STATUS_ENABLE } as unknown as Script,
      oldScript: { metadata: oldMetadata } as unknown as Script,
      oldScriptCode: "// old code",
    });

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = result.current.state;
    if (state.status !== "ready") throw new Error("not ready");
    expect(state.view.isUpdate).toBe(true);
    expect(state.view.oldCode).toBe("// old code");
  });

  it("?skill= 时读取技能数据进入 skill 状态", async () => {
    window.history.replaceState({}, "", "/install.html?skill=sk1");
    const skill = {
      skillMd: "# skill",
      metadata: { name: "技能X", description: "desc" },
      prompt: "提示词",
      scripts: [],
      references: [],
      isUpdate: false,
    };
    (agentClient.getSkillInstallData as Mock).mockResolvedValue(skill);

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("skill"));
    const state = result.current.state;
    if (state.status !== "skill") throw new Error("not skill");
    expect(state.skill.metadata.name).toBe("技能X");
  });

  it("?url= 指向 .cat.md 时走 Skill 安装流程而非脚本解析", async () => {
    window.history.replaceState({}, "", "/install.html?url=https://e.com/foo.cat.md");
    const skill = {
      skillMd: "# skill",
      metadata: { name: "URL技能", description: "desc" },
      prompt: "提示词",
      scripts: [],
      references: [],
      isUpdate: false,
    };
    (agentClient.prepareSkillFromUrl as Mock).mockResolvedValue("sk-from-url");
    (agentClient.getSkillInstallData as Mock).mockResolvedValue(skill);

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("skill"));
    const state = result.current.state;
    if (state.status !== "skill") throw new Error("not skill");
    expect(state.skill.metadata.name).toBe("URL技能");
    expect(agentClient.prepareSkillFromUrl as Mock).toHaveBeenCalledWith("https://e.com/foo.cat.md");
    expect(agentClient.getSkillInstallData as Mock).toHaveBeenCalledWith("sk-from-url");
    // 不应当走脚本下载/解析路径
    expect(fetchScriptBody as Mock).not.toHaveBeenCalled();
  });

  it("?url= 指向带查询串的 .cat.md 时仍走 Skill 流程(正则匹配 ? 边界)", async () => {
    window.history.replaceState({}, "", "/install.html?url=https://e.com/foo.cat.md?v=2");
    const skill = {
      skillMd: "# skill",
      metadata: { name: "查询串技能", description: "desc" },
      prompt: "提示词",
      scripts: [],
      references: [],
      isUpdate: false,
    };
    (agentClient.prepareSkillFromUrl as Mock).mockResolvedValue("sk-q");
    (agentClient.getSkillInstallData as Mock).mockResolvedValue(skill);

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("skill"));
    expect(agentClient.prepareSkillFromUrl as Mock).toHaveBeenCalledWith("https://e.com/foo.cat.md?v=2");
    // 解析得到的 uuid 应写入 skillUuidRef,供后续 installSkill/cancelSkill 复用
    const state = result.current.state;
    if (state.status !== "skill") throw new Error("not skill");
    expect(state.skill.metadata.name).toBe("查询串技能");
  });

  it("getInstallInfo 无数据时进入 error 状态", async () => {
    window.history.replaceState({}, "", "/install.html?uuid=u1");
    (scriptClient.getInstallInfo as Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("error"));
  });

  it("加载失败后调用 retry 重新加载并进入 ready", async () => {
    window.history.replaceState({}, "", "/install.html?uuid=u1");
    const metadata = { name: ["示例脚本"], version: ["1.0.0"], match: ["https://e.com/*"] };
    const info: ScriptInfo = {
      url: "https://e.com/x.user.js",
      code: "",
      uuid: "u1",
      userSubscribe: false,
      metadata,
      source: "user",
    };
    // 用开关而非调用计数控制成败:retry 前的任意次加载都返回空(→error),retry 后才放行成功。
    // 这样对 effect 在负载下因 t 引用变化导致的重跑次数不敏感(否则计数法会脆)。
    let allowSuccess = false;
    (scriptClient.getInstallInfo as Mock).mockImplementation(async () =>
      allowSuccess ? [false, info, {}] : undefined
    );
    (getTempCode as Mock).mockResolvedValue("// code");
    (prepareScriptByCode as Mock).mockResolvedValue({
      script: { name: "示例脚本", metadata, status: SCRIPT_STATUS_ENABLE } as unknown as Script,
    });

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    allowSuccess = true;
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
  });

  it("?url= 时下载并解析后进入 ready 状态", async () => {
    window.history.replaceState({}, "", "/install.html?url=https://e.com/x.user.js");
    const metadata = { name: ["URL脚本"], version: ["1.0.0"], match: ["https://e.com/*"] };
    (fetchScriptBody as Mock).mockResolvedValue("// url code");
    (parseMetadata as Mock).mockReturnValue(metadata);
    (prepareScriptByCode as Mock).mockResolvedValue({
      script: { name: "URL脚本", metadata, status: SCRIPT_STATUS_ENABLE } as unknown as Script,
    });

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = result.current.state;
    if (state.status !== "ready") throw new Error("not ready");
    expect(state.view.name).toBe("URL脚本");
    expect(result.current.localFile).toBe(false);
  });

  it("?url= 下载过程中在 loading 状态展示已接收字节与百分比", async () => {
    window.history.replaceState({}, "", "/install.html?url=https://e.com/x.user.js");
    const metadata = { name: ["URL脚本"], version: ["1.0.0"] };
    (fetchScriptBody as Mock).mockImplementation(
      async (
        _url: string,
        _signal: unknown,
        onProgress?: (p: { receivedLength: number; totalLength?: number }) => void
      ) => {
        onProgress?.({ receivedLength: 512, totalLength: 1024 });
        return "// code";
      }
    );
    (parseMetadata as Mock).mockReturnValue(metadata);
    // 让准备阶段挂起,使视图停留在带进度的 loading 态以便断言
    (prepareScriptByCode as Mock).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => {
      const s = result.current.state;
      expect(s.status).toBe("loading");
      if (s.status !== "loading") throw new Error("not loading");
      expect(s.percent).toBe(50);
      expect(s.bytesText).toContain("512.00 B");
      expect(s.bytesText).toContain("1.00 KB");
    });
  });

  it("?url= 已接收字节超过 totalLength 时回退为仅显示已接收(不显示错误百分比)", async () => {
    window.history.replaceState({}, "", "/install.html?url=https://e.com/x.user.js");
    const metadata = { name: ["URL脚本"], version: ["1.0.0"] };
    (fetchScriptBody as Mock).mockImplementation(
      async (
        _url: string,
        _signal: unknown,
        onProgress?: (p: { receivedLength: number; totalLength?: number }) => void
      ) => {
        // 解压后字节(3000)超过压缩后的 Content-Length(1000),总量不可信
        onProgress?.({ receivedLength: 3000, totalLength: 1000 });
        return "// code";
      }
    );
    (parseMetadata as Mock).mockReturnValue(metadata);
    (prepareScriptByCode as Mock).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => {
      const s = result.current.state;
      expect(s.status).toBe("loading");
      if (s.status !== "loading") throw new Error("not loading");
      expect(s.bytesText).toContain("2.93 KB");
    });
    const s = result.current.state;
    if (s.status !== "loading") throw new Error("not loading");
    expect(s.percent).toBeUndefined();
    expect(s.bytesText).not.toContain("1000.00 B");
  });

  it("?file= 时读取本地文件并进入 ready,localFile 为 true", async () => {
    window.history.replaceState({}, "", "/install.html?file=fid1");
    const metadata = { name: ["本地脚本"], version: ["1.0.0"] };
    (loadHandle as Mock).mockResolvedValue({
      name: "x.user.js",
      getFile: async () => ({ text: async () => "// file code", name: "x.user.js" }),
    });
    (parseMetadata as Mock).mockReturnValue(metadata);
    (prepareScriptByCode as Mock).mockResolvedValue({
      script: { name: "本地脚本", metadata, status: SCRIPT_STATUS_ENABLE } as unknown as Script,
    });

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.localFile).toBe(true);
  });

  it("本地文件切换监听:开启调用 startFileTrack,关闭调用 unmountFileTrack", async () => {
    window.history.replaceState({}, "", "/install.html?file=fid1");
    const metadata = { name: ["本地脚本"], version: ["1.0.0"] };
    (loadHandle as Mock).mockResolvedValue({
      name: "x.user.js",
      getFile: async () => ({ text: async () => "// file code", name: "x.user.js" }),
    });
    (parseMetadata as Mock).mockReturnValue(metadata);
    (prepareScriptByCode as Mock).mockResolvedValue({
      script: { name: "本地脚本", metadata, status: SCRIPT_STATUS_ENABLE, uuid: "u9" } as unknown as Script,
    });
    (scriptClient.install as Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    await act(async () => result.current.toggleWatch());
    expect(result.current.watching).toBe(true);
    expect(startFileTrack as Mock).toHaveBeenCalledTimes(1);

    await act(async () => result.current.toggleWatch());
    expect(result.current.watching).toBe(false);
    expect(unmountFileTrack as Mock).toHaveBeenCalled();
  });

  it("开启监听时预装失败则不进入监听也不追踪文件", async () => {
    window.history.replaceState({}, "", "/install.html?file=fid1");
    const metadata = { name: ["本地脚本"], version: ["1.0.0"] };
    (loadHandle as Mock).mockResolvedValue({
      name: "x.user.js",
      getFile: async () => ({ text: async () => "// file code", name: "x.user.js" }),
    });
    (parseMetadata as Mock).mockReturnValue(metadata);
    (prepareScriptByCode as Mock).mockResolvedValue({
      script: { name: "本地脚本", metadata, status: SCRIPT_STATUS_ENABLE, uuid: "u9" } as unknown as Script,
    });
    (scriptClient.install as Mock).mockRejectedValue(new Error("装不上"));

    const { result } = renderHook(() => useInstallData());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    await act(async () => result.current.toggleWatch());
    expect(result.current.watching).toBe(false);
    expect(startFileTrack as Mock).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import type { Server } from "@Packages/message/server";
import type { WindowMessage } from "@Packages/message/window_message";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { TExtensionEnv } from "../extension/extension_env";
import { SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB, type SCRIPT_TYPE } from "@App/app/repo/scripts";

// 单测重点：sandbox runtime.execScript 中新加的 run-in 过滤逻辑
// 通过 mock BgExecScriptWarp 与 offscreen client，观察是否构造执行实例来判断过滤是否生效
const mockExec = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn();
const BgExecScriptWarpCtor = vi.fn().mockImplementation(() => ({
  exec: mockExec,
  stop: mockStop,
  scriptRes: { uuid: "uuid-bg" },
  valueUpdate: vi.fn(),
  emitEvent: vi.fn(),
}));

vi.mock("../content/exec_warp", () => ({
  BgExecScriptWarp: function (...args: any[]) {
    return BgExecScriptWarpCtor(...args);
  },
  CATRetryError: class CATRetryError {
    constructor(
      public msg: string,
      public time: Date
    ) {}
  },
}));

vi.mock("../offscreen/client", () => ({
  proxyUpdateRunStatus: vi.fn(),
}));

import { Runtime } from "./runtime";
import { initLanguage } from "@App/locales/locales";
import { proxyUpdateRunStatus } from "../offscreen/client";
import { CATRetryError } from "../content/exec_warp";
import { SCRIPT_RUN_STATUS_COMPLETE } from "@App/app/repo/scripts";

initTestEnv();
// 生产中 sandbox init() 会先 initLanguage()，setSandboxLanguage 依赖已初始化的 i18n
initLanguage();

const buildScript = (runIn?: string, type: SCRIPT_TYPE = SCRIPT_TYPE_BACKGROUND): ScriptLoadInfo =>
  ({
    uuid: `uuid-${type}-${runIn ?? "none"}`,
    name: "bg",
    type,
    code: "",
    sourceCode: "",
    metadata: runIn ? { "run-in": [runIn] } : {},
    metadataStr: "",
    userConfig: {},
    userConfigStr: "",
    value: {},
    resource: {},
  }) as unknown as ScriptLoadInfo;

const setup = (extensionEnv: TExtensionEnv | undefined) => {
  const windowMessage = {} as WindowMessage;
  const api = {} as Server;
  return new Runtime(windowMessage, api, Promise.resolve(extensionEnv));
};

describe("Runtime.execScript run-in 过滤", () => {
  beforeEach(() => {
    BgExecScriptWarpCtor.mockClear();
    mockExec.mockClear();
    mockStop.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("metadata 没有 run-in 时无论 incognito 状态都执行", async () => {
    const runtime = setup({ inIncognitoContext: false });
    await runtime.execScript(buildScript());
    expect(BgExecScriptWarpCtor).toHaveBeenCalledTimes(1);
  });

  it('run-in === "all" 时无论 incognito 状态都执行', async () => {
    const runtime = setup({ inIncognitoContext: true });
    await runtime.execScript(buildScript("all"));
    expect(BgExecScriptWarpCtor).toHaveBeenCalledTimes(1);
  });

  it('run-in === "normal-tabs" 在普通环境中执行', async () => {
    const runtime = setup({ inIncognitoContext: false });
    await runtime.execScript(buildScript("normal-tabs"));
    expect(BgExecScriptWarpCtor).toHaveBeenCalledTimes(1);
  });

  it('run-in === "normal-tabs" 在隐身环境中跳过执行', async () => {
    const runtime = setup({ inIncognitoContext: true });
    await runtime.execScript(buildScript("normal-tabs"));
    expect(BgExecScriptWarpCtor).not.toHaveBeenCalled();
  });

  it('run-in === "incognito-tabs" 在普通环境中跳过执行', async () => {
    const runtime = setup({ inIncognitoContext: false });
    await runtime.execScript(buildScript("incognito-tabs"));
    expect(BgExecScriptWarpCtor).not.toHaveBeenCalled();
  });

  it('run-in === "incognito-tabs" 在隐身环境中执行', async () => {
    const runtime = setup({ inIncognitoContext: true });
    await runtime.execScript(buildScript("incognito-tabs"));
    expect(BgExecScriptWarpCtor).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["后台", "normal-tabs", SCRIPT_TYPE_BACKGROUND],
    ["后台", "incognito-tabs", SCRIPT_TYPE_BACKGROUND],
    ["定时", "normal-tabs", SCRIPT_TYPE_CRONTAB],
    ["定时", "incognito-tabs", SCRIPT_TYPE_CRONTAB],
  ] as const)('Firefox spanning 共享事件页不把%s脚本的 run-in === "%s" 伪装成窗口隔离', async (_label, runIn, type) => {
    const runtime = setup({ inIncognitoContext: false, incognitoMode: "spanning" });

    await runtime.execScript(buildScript(runIn, type));

    expect(BgExecScriptWarpCtor).toHaveBeenCalledTimes(1);
  });

  it("执行时向 BgExecScriptWarp 传入最近一次同步的界面语言", async () => {
    const runtime = setup({ inIncognitoContext: false });
    runtime.setSandboxLanguage("ko-KR");
    await runtime.execScript(buildScript());
    expect(BgExecScriptWarpCtor.mock.calls[0][3]).toBe("ko-KR");
  });

  it("extensionEnv 为 undefined 时，过滤被跳过照常执行（fail-open）", async () => {
    // 当前实现：拿不到 incognito 状态时不做过滤，避免静默丢失任务
    const runtime = setup(undefined);
    await runtime.execScript(buildScript("incognito-tabs"));
    expect(BgExecScriptWarpCtor).toHaveBeenCalledTimes(1);
  });
});

describe("Runtime.executeSkillScript 执行环境", () => {
  beforeEach(() => {
    BgExecScriptWarpCtor.mockClear();
    mockExec.mockClear();
    mockStop.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("执行 skill 脚本时向 BgExecScriptWarp 传入扩展环境与界面语言", async () => {
    const extensionEnv: TExtensionEnv = { inIncognitoContext: true };
    const runtime = setup(extensionEnv);
    runtime.setSandboxLanguage("pt-BR");

    await runtime.executeSkillScript({
      uuid: "skill-uuid",
      name: "skill",
      code: "return 1;",
      grants: [],
      args: {},
    });

    expect(BgExecScriptWarpCtor).toHaveBeenCalledTimes(1);
    expect(BgExecScriptWarpCtor.mock.calls[0][2]).toBe(extensionEnv);
    expect(BgExecScriptWarpCtor.mock.calls[0][3]).toBe("pt-BR");
  });
});

describe("Runtime.execScript 被停止的旧运行迟到结束", () => {
  // 每次 exec 返回一个由测试控制结束时机的运行；started[n] 在第 n 次 exec 被调用时兑现。
  let runs: Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }>;
  let execCalled: Array<() => void>;
  const execStarted = (n: number) => new Promise<void>((resolve) => (execCalled[n] = resolve));

  beforeEach(() => {
    BgExecScriptWarpCtor.mockClear();
    mockStop.mockClear();
    vi.mocked(proxyUpdateRunStatus).mockClear();
    runs = [];
    execCalled = [];
    mockExec.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          runs.push({ resolve, reject });
          execCalled[runs.length]?.();
        })
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    mockExec.mockReset().mockResolvedValue(undefined);
    vi.useRealTimers();
  });

  // 返回本次运行使用的 logger，info/error 被调用时兑现对应 Promise，作为旧运行收尾处理已执行完的信号。
  const spyRunLogger = (runtime: Runtime) => {
    const runLogger = runtime.logger.with();
    vi.spyOn(runtime.logger, "with").mockReturnValue(runLogger);
    let infoLogged!: () => void;
    let errorLogged!: () => void;
    const info = new Promise<void>((resolve) => (infoLogged = resolve));
    const error = new Promise<void>((resolve) => (errorLogged = resolve));
    vi.spyOn(runLogger, "info").mockImplementation(() => infoLogged());
    vi.spyOn(runLogger, "error").mockImplementation(() => errorLogged());
    return { info, error };
  };

  // execScript 的返回值就是脚本运行的 Promise（交给消息层答复调用方），返回旧运行的那一个供断言其结局。
  const startTwoRuns = async (runtime: Runtime, script: ScriptLoadInfo) => {
    const firstStarted = execStarted(1);
    const oldRun = runtime.execScript(script);
    await firstStarted;
    const secondStarted = execStarted(2);
    void runtime.execScript(script);
    await secondStarted;
    vi.mocked(proxyUpdateRunStatus).mockClear();
    return { oldRun };
  };

  it("旧运行在新运行开始后才完成：不发布 COMPLETE，新运行结束时照常发布", async () => {
    const runtime = setup({ inIncognitoContext: false });
    const logged = spyRunLogger(runtime);
    const script = buildScript();
    const { oldRun } = await startTwoRuns(runtime, script);

    runs[0].resolve("old");
    await expect(oldRun).resolves.toBe("old");
    await logged.info;
    expect(proxyUpdateRunStatus).not.toHaveBeenCalled();

    runs[1].resolve("new");
    await vi.waitFor(() =>
      expect(proxyUpdateRunStatus).toHaveBeenCalledWith(expect.anything(), {
        uuid: script.uuid,
        runStatus: SCRIPT_RUN_STATUS_COMPLETE,
      })
    );
  });

  it("旧运行在新运行开始后才以 CATRetryError 失败：不发布 ERROR、不加入重试队列", async () => {
    const runtime = setup({ inIncognitoContext: false });
    const logged = spyRunLogger(runtime);
    const script = buildScript(undefined, SCRIPT_TYPE_CRONTAB);
    const { oldRun } = await startTwoRuns(runtime, script);

    runs[0].reject(new CATRetryError("retry later", new Date(Date.now() + 60_000)));
    await expect(oldRun).rejects.toBeInstanceOf(CATRetryError);
    await logged.error;

    expect(proxyUpdateRunStatus).not.toHaveBeenCalled();
    expect(runtime.retryList).toEqual([]);
  });
});

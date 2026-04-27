import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import type { Server } from "@Packages/message/server";
import type { WindowMessage } from "@Packages/message/window_message";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { TExtensionEnv } from "../extension/extension_env";

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
  CATRetryError: class CATRetryError {},
}));

vi.mock("../offscreen/client", () => ({
  proxyUpdateRunStatus: vi.fn(),
}));

import { Runtime } from "./runtime";

initTestEnv();

const buildScript = (runIn?: string): ScriptLoadInfo =>
  ({
    uuid: `uuid-${runIn ?? "none"}`,
    name: "bg",
    type: 2,
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

  it("extensionEnv 为 undefined 时，过滤被跳过照常执行（fail-open）", async () => {
    // 当前实现：拿不到 incognito 状态时不做过滤，避免静默丢失任务
    const runtime = setup(undefined);
    await runtime.execScript(buildScript("incognito-tabs"));
    expect(BgExecScriptWarpCtor).toHaveBeenCalledTimes(1);
  });
});

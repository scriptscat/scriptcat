import { describe, expect, it } from "vitest";
import { BgExecScriptWarp } from "./exec_warp";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { Message } from "@Packages/message/types";
import type { TExtensionEnv } from "../extension/extension_env";

const buildScriptRes = () =>
  ({
    uuid: "uuid-bg",
    name: "bg-script",
    metadata: {
      grant: ["none"],
      version: ["1.0.0"],
    },
    code: "return GM_info;",
    sourceCode: "return GM_info;",
    value: {},
  }) as unknown as ScriptLoadInfo;

const fakeMessage = undefined as unknown as Message;

const getGMInfo = (exec: BgExecScriptWarp) => (exec as any).named?.GM_info;

describe("BgExecScriptWarp envInfo 注入", () => {
  it("extensionEnv 为 undefined 时使用默认值", () => {
    const exec = new BgExecScriptWarp(buildScriptRes(), fakeMessage, undefined);
    const gmInfo = getGMInfo(exec);
    expect(gmInfo.isIncognito).toBe(false);
    expect(gmInfo.userAgentData).toEqual({
      brands: [],
      mobile: false,
      platform: "",
    });
    expect(gmInfo.sandboxMode).toBe("raw");
  });

  it("inIncognitoContext=true 时覆盖 isIncognito 为 true", () => {
    const extensionEnv: TExtensionEnv = { inIncognitoContext: true };
    const exec = new BgExecScriptWarp(buildScriptRes(), fakeMessage, extensionEnv);
    const gmInfo = getGMInfo(exec);
    expect(gmInfo.isIncognito).toBe(true);
    // 没传 userAgentData，沿用默认空值
    expect(gmInfo.userAgentData).toEqual({
      brands: [],
      mobile: false,
      platform: "",
    });
  });

  it("传入完整 userAgentData 时整体替换默认值", () => {
    const extensionEnv: TExtensionEnv = {
      inIncognitoContext: false,
      userAgentData: {
        brands: [{ brand: "Chromium", version: "120" }],
        mobile: true,
        platform: "Android",
        architecture: "arm",
        bitness: "64",
      } as any,
    };
    const exec = new BgExecScriptWarp(buildScriptRes(), fakeMessage, extensionEnv);
    const gmInfo = getGMInfo(exec);
    expect(gmInfo.isIncognito).toBe(false);
    expect(gmInfo.userAgentData).toEqual({
      brands: [{ brand: "Chromium", version: "120" }],
      mobile: true,
      platform: "Android",
      architecture: "arm",
      bitness: "64",
    });
  });

  it("userAgentData 为 null 时保留默认值", () => {
    const extensionEnv: TExtensionEnv = {
      inIncognitoContext: true,
      userAgentData: null,
    };
    const exec = new BgExecScriptWarp(buildScriptRes(), fakeMessage, extensionEnv);
    const gmInfo = getGMInfo(exec);
    expect(gmInfo.isIncognito).toBe(true);
    expect(gmInfo.userAgentData).toEqual({
      brands: [],
      mobile: false,
      platform: "",
    });
  });
});

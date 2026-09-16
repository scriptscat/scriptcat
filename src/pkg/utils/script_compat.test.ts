import { describe, it, expect } from "vitest";
import "@App/app/service/content/gm_api/gm_api";
import { GMContextApiNames } from "@App/app/service/content/gm_api/gm_context";
import { compatMap as eslintHeaderCompatMap } from "@Packages/eslint/compat-headers";
import {
  CONTEXT_PROVIDED_GRANTS,
  SUPPORTED_GRANTS,
  SUPPORTED_METADATA_TAGS,
  SYNTHETIC_METADATA_TAGS,
  isSupportedGrant,
  isScriptCatOnlyGrant,
  isSupportedMetadataTag,
  resolveMetadataTagBase,
} from "./script_compat";

describe("元数据指令支持判定", () => {
  it("运行时会消费的指令视为支持", () => {
    for (const tag of ["match", "include", "exclude", "grant", "run-at", "run-in", "noframes", "connect"]) {
      expect(isSupportedMetadataTag(tag), tag).toBe(true);
    }
  });

  it("脚本猫独有的指令视为支持", () => {
    for (const tag of ["crontab", "background", "early-start", "require-css", "storagename", "cloudcat"]) {
      expect(isSupportedMetadataTag(tag), tag).toBe(true);
    }
  });

  it("别家管理器会执行、脚本猫未实现的指令视为不支持", () => {
    for (const tag of ["exclude-match", "top-level-await", "sandbox", "webRequest", "allFrames", "user-agent"]) {
      expect(isSupportedMetadataTag(tag), tag).toBe(false);
    }
  });

  it("脚本站与著作信息类指令不报不支持——脚本猫不执行它们，但也不影响脚本行为", () => {
    for (const tag of ["license", "compatible", "contributionURL", "uso:script", "oujs:author", "screenshot"]) {
      expect(isSupportedMetadataTag(tag), tag).toBe(true);
    }
  });

  it("指令名大小写不敏感", () => {
    expect(isSupportedMetadataTag("MATCH")).toBe(true);
    expect(isSupportedMetadataTag("Run-At")).toBe(true);
    expect(isSupportedMetadataTag("EXCLUDE-MATCH")).toBe(false);
  });

  it("name/description 的语言后缀归到同一指令", () => {
    expect(isSupportedMetadataTag("name:zh-CN")).toBe(true);
    expect(isSupportedMetadataTag("description:ja")).toBe(true);
    expect(resolveMetadataTagBase("Name:zh-CN")).toBe("name");
    // 只有 name/description 有语言后缀，其余指令的冒号后缀不参与归一
    expect(resolveMetadataTagBase("uso:script")).toBe("uso:script");
  });

  it("拼写错误等未知指令视为不支持", () => {
    expect(isSupportedMetadataTag("mathc")).toBe(false);
    expect(isSupportedMetadataTag("matchAboutBlank")).toBe(false);
  });
});

describe("GM 能力支持判定", () => {
  it("注册表中的 GM API 视为支持", () => {
    for (const grant of ["GM_setValue", "GM.setValue", "CAT_fileStorage", "CAT.agent.dom", "window.close"]) {
      expect(isSupportedGrant(grant), grant).toBe(true);
    }
  });

  it("GM_ 与 GM. 前缀互认——与运行时 getGrantCandidates 同一套规则", () => {
    // 注册表只登记了 GM_xmlhttpRequest / GM.xmlHttpRequest 两种写法，交叉写法靠候选规则兜住
    expect(isSupportedGrant("GM.deleteValues")).toBe(true);
    expect(isSupportedGrant("GM_deleteValues")).toBe(true);
  });

  it("不经注册表、由上下文直接提供的能力也视为支持", () => {
    for (const grant of ["unsafeWindow", "window.onurlchange", "GM_info", "none"]) {
      expect(isSupportedGrant(grant), grant).toBe(true);
    }
  });

  it("脚本猫未实现的 GM API 视为不支持", () => {
    for (const grant of ["GM_audio", "GM_webRequest", "GM_addScript", "GM_createObjectURL"]) {
      expect(isSupportedGrant(grant), grant).toBe(false);
    }
  });
});

describe("仅限脚本猫的 GM 能力判定", () => {
  it("CAT_ 与 CAT. 命名空间下的已实现能力仅限脚本猫", () => {
    for (const grant of ["CAT_fileStorage", "CAT_userConfig", "CAT.agent.dom"]) {
      expect(isScriptCatOnlyGrant(grant), grant).toBe(true);
    }
  });

  it("通用 GM 能力、上下文能力与脚本猫未实现的 CAT 名字都不算", () => {
    for (const grant of ["GM_setValue", "GM.xmlHttpRequest", "unsafeWindow", "window.close", "CAT_notExist"]) {
      expect(isScriptCatOnlyGrant(grant), grant).toBe(false);
    }
  });
});

describe("支持表与运行时注册表的一致性", () => {
  it("注册表里的每个 @grant 都在支持表内——新增 GM API 漏进表会在此转红", () => {
    const missing = GMContextApiNames().filter((name) => !SUPPORTED_GRANTS.has(name));
    expect(missing).toEqual([]);
  });

  it("支持表不含注册表之外的名字——上下文直接提供的能力单独登记，便于审阅", () => {
    const registered = new Set(GMContextApiNames());
    const extra = [...SUPPORTED_GRANTS].filter((name) => !registered.has(name) && !CONTEXT_PROVIDED_GRANTS.has(name));
    expect(extra).toEqual([]);
  });
});

describe("支持表与编辑器 ESLint 合法 header 集合的一致性", () => {
  it("支持表里的指令，编辑器都应认为是合法 header——否则用户会在编辑器里收到「不是合法 header」的误报", () => {
    // no-invalid-headers 按原样比对 header 名，而脚本猫运行时把指令名小写化，故按小写比对
    const validHeaders = new Set(
      [
        ...Object.keys(eslintHeaderCompatMap.unlocalized),
        ...Object.keys(eslintHeaderCompatMap.nonFunctional),
        ...Object.keys(eslintHeaderCompatMap.localized),
      ].map((key) => key.toLowerCase())
    );
    const missing = [...SUPPORTED_METADATA_TAGS].filter(
      (tag) => !SYNTHETIC_METADATA_TAGS.has(tag) && !validHeaders.has(tag)
    );
    expect(missing).toEqual([]);
  });
});

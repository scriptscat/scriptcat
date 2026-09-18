import { describe, it, expect } from "vitest";
import "@App/app/service/content/gm_api/gm_api";
import { GMContextApiNames } from "@App/app/service/content/gm_api/gm_context";
import { compatMap as eslintHeaderCompatMap } from "@Packages/eslint/compat-headers";
import { compatMap as upstreamHeaderCompatMap } from "eslint-plugin-userscripts/dist/data/compat-headers.js";
import {
  CONSUMED_METADATA_TAGS,
  CONTEXT_PROVIDED_GRANTS,
  SCRIPTCAT_ONLY_METADATA_TAGS,
  VALUE_CONSTRAINED_TAGS,
  SUPPORTED_GRANTS,
  SUPPORTED_METADATA_TAGS,
  SYNTHETIC_METADATA_TAGS,
  isSupportedGrant,
  ineffectiveMetadataValues,
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
    for (const grant of [
      "GM_setValue",
      "GM.setValue",
      "GM_takeTurn",
      "GM.takeTurn",
      "CAT_fileStorage",
      "CAT.agent.dom",
      "window.close",
    ]) {
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

describe("元数据取值支持判定", () => {
  it("取值在脚本猫认得的范围内时不报", () => {
    expect(
      ineffectiveMetadataValues({
        "run-at": ["document-start"],
        "run-in": ["incognito-tabs"],
        "inject-into": ["content"],
        "early-start": [""],
        unwrap: ["true"],
      })
    ).toEqual([]);
    for (const runAt of ["document-body", "document-end", "document-idle", "context-menu"]) {
      expect(ineffectiveMetadataValues({ "run-at": [runAt] }), runAt).toEqual([]);
    }
  });

  it("取值不在白名单内一律报出，不需要事先登记——运行时对不认识的取值会静默回退", () => {
    expect(
      ineffectiveMetadataValues({
        "run-at": ["document-weird"],
        "run-in": ["container-id-2"],
        "inject-into": ["auto"],
        unwrap: ["yes"],
      })
    ).toEqual([
      { tag: "run-at", index: 0, value: "document-weird" },
      { tag: "run-in", index: 0, value: "container-id-2" },
      { tag: "inject-into", index: 0, value: "auto" },
      { tag: "unwrap", index: 0, value: "yes" },
    ]);
  });

  it("取值大小写敏感，与运行时的比较方式一致", () => {
    expect(ineffectiveMetadataValues({ "run-at": ["Document-Start"] })).toEqual([
      { tag: "run-at", index: 0, value: "Document-Start" },
    ]);
  });

  it("运行时只读第一个取值的指令，后续取值报为不生效", () => {
    expect(ineffectiveMetadataValues({ "run-in": ["normal-tabs", "incognito-tabs"] })).toEqual([
      { tag: "run-in", index: 1, value: "incognito-tabs" },
    ]);
  });

  it("@early-start 只在 @run-at document-start 下生效", () => {
    expect(ineffectiveMetadataValues({ "early-start": [""] })).toEqual([{ tag: "early-start", index: 0, value: "" }]);
    expect(ineffectiveMetadataValues({ "early-start": [""], "run-at": ["document-start"] })).toEqual([]);
  });

  it("运行时解析不出匹配规则的 @match 报为不生效，能解析的（含兼容 TM 的简写）不报", () => {
    expect(
      ineffectiveMetadataValues({
        match: ["*://a.com/*", "www.youtube.com/*", "*", "hello-world^^", ""],
      })
    ).toEqual([
      { tag: "match", index: 3, value: "hello-world^^" },
      { tag: "match", index: 4, value: "" },
    ]);
  });

  it("不限取值的指令不做取值判定", () => {
    expect(ineffectiveMetadataValues({ include: ["anything"], namespace: ["x"], noframes: ["whatever"] })).toEqual([]);
  });

  it("有取值约束的指令都是脚本猫会消费的指令", () => {
    expect(VALUE_CONSTRAINED_TAGS.filter((tag) => !CONSUMED_METADATA_TAGS.has(tag))).toEqual([]);
  });
});

describe("仅限脚本猫的元数据指令", () => {
  // 只对照会被消费的指令：信息类（如 @definition）在脚本猫里同样不起作用，标「仅限脚本猫」会误导
  it("与 eslint-plugin-userscripts 收录的别家指令对照：脚本猫会消费、别家都没有的，就是脚本猫独有的", () => {
    const upstream = new Set(
      [
        ...Object.keys(upstreamHeaderCompatMap.unlocalized),
        ...Object.keys(upstreamHeaderCompatMap.nonFunctional),
        ...Object.keys(upstreamHeaderCompatMap.localized),
      ].map((key) => key.toLowerCase())
    );
    const expected = [...CONSUMED_METADATA_TAGS].filter(
      (tag) => !upstream.has(tag) && !SYNTHETIC_METADATA_TAGS.has(tag)
    );
    expect([...SCRIPTCAT_ONLY_METADATA_TAGS].sort()).toEqual(expected.sort());
  });

  it("包含 @early-start 与 @background，不包含通用指令", () => {
    expect(SCRIPTCAT_ONLY_METADATA_TAGS.has("early-start")).toBe(true);
    expect(SCRIPTCAT_ONLY_METADATA_TAGS.has("background")).toBe(true);
    expect(SCRIPTCAT_ONLY_METADATA_TAGS.has("match")).toBe(false);
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

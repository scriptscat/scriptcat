import { describe, it, expect } from "vitest";
import { i18nName, i18nDescription } from "./locales";
import type { SCMetadata } from "@App/app/repo/scripts";
import i18n from "i18next";

describe.concurrent("i18nName", () => {
  it("完全匹配语言时返回对应的国际化名称", () => {
    // 模拟当前语言为 zh-cn
    i18n.language = "zh-CN";

    const script = {
      name: "Default Script Name",
      metadata: {
        "name:zh-cn": ["中文脚本名"],
        "name:en-us": ["English Script Name"],
      } as SCMetadata,
    };

    const result = i18nName(script);
    expect(result).toBe("中文脚本名");
  });

  it("前缀匹配语言时返回对应的国际化名称", () => {
    // 模拟当前语言为 zh-tw，但只有 zh 前缀的名称
    i18n.language = "zh-TW";

    const script = {
      name: "Default Script Name",
      metadata: {
        "name:zh": ["中文脚本名"],
        "name:en": ["English Script Name"],
      } as SCMetadata,
    };

    const result = i18nName(script);
    expect(result).toBe("中文脚本名");
  });

  it("没有匹配的国际化名称时返回默认名称", () => {
    i18n.language = "ja-JP";

    const script = {
      name: "Default Script Name",
      metadata: {
        "name:zh-cn": ["中文脚本名"],
        "name:en-us": ["English Script Name"],
      } as SCMetadata,
    };

    const result = i18nName(script);
    expect(result).toBe("Default Script Name");
  });

  it("metadata 为空时返回默认名称", () => {
    i18n.language = "en-US";

    const script = {
      name: "Default Script Name",
      metadata: {} as SCMetadata,
    };

    const result = i18nName(script);
    expect(result).toBe("Default Script Name");
  });
});

describe.concurrent("i18nDescription", () => {
  it("完全匹配语言时返回对应的国际化描述", () => {
    i18n.language = "zh-CN";

    const script = {
      metadata: {
        description: ["Default description"],
        "description:zh-cn": ["中文描述"],
        "description:en-us": ["English description"],
      } as SCMetadata,
    };

    const result = i18nDescription(script);
    expect(result).toBe("中文描述");
  });

  it("前缀匹配语言时返回对应的国际化描述", () => {
    i18n.language = "zh-TW";

    const script = {
      metadata: {
        description: ["Default description"],
        "description:zh": ["中文描述"],
        "description:en": ["English description"],
      } as SCMetadata,
    };

    const result = i18nDescription(script);
    expect(result).toBe("中文描述");
  });

  it("没有匹配的国际化描述时返回默认描述", () => {
    i18n.language = "ja-JP";

    const script = {
      metadata: {
        description: ["Default description"],
        "description:zh-cn": ["中文描述"],
        "description:en-us": ["English description"],
      } as SCMetadata,
    };

    const result = i18nDescription(script);
    expect(result).toBe("Default description");
  });

  it("没有 description 字段时返回 空字串", () => {
    i18n.language = "en-US";

    const script = {
      metadata: {} as SCMetadata,
    };

    const result = i18nDescription(script);
    expect(result).toBe("");
  });

  it("description 字段为空数组时返回 空字串", () => {
    i18n.language = "en-US";

    const script = {
      metadata: {
        description: [],
      } as SCMetadata,
    };

    const result = i18nDescription(script);
    expect(result).toBe("");
  });
});

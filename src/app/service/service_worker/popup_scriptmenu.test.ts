import { describe, it, expect, beforeAll } from "vitest";
import { initLanguage, changeLanguage } from "@App/locales/locales";
import type { Script } from "@App/app/repo/scripts";
import type { ScriptMenu } from "./types";
import { applyScriptDisplayInfo } from "./popup_scriptmenu";

const makeMenu = (over: Partial<ScriptMenu> = {}): ScriptMenu => ({
  uuid: "u1",
  name: "Raw Name",
  storageName: "Raw Name",
  enable: true,
  updatetime: 0,
  hasUserConfig: false,
  runNum: 0,
  runNumByIframe: 0,
  menus: [],
  isEffective: null,
  ...over,
});

// metadata 的 key 在解析时会被统一转小写（见 src/pkg/utils/script.ts），
// 因此本地化名键存为 name:zh-cn 而非 name:zh-CN。
const makeScript = (metadata: Record<string, string[]>, name = "Raw Name"): Script =>
  ({ name, metadata }) as unknown as Script;

describe("applyScriptDisplayInfo Popup 展示信息补充", () => {
  beforeAll(() => initLanguage("zh-CN"));

  it("应按当前语言本地化脚本名（@name:zh-CN）", () => {
    changeLanguage("zh-CN");
    const out = applyScriptDisplayInfo(makeMenu(), makeScript({ "name:zh-cn": ["中文名"] }));
    expect(out.name).toBe("中文名");
  });

  it("仅有语言前缀匹配（@name:zh）时也应本地化", () => {
    changeLanguage("zh-CN");
    const out = applyScriptDisplayInfo(makeMenu(), makeScript({ "name:zh": ["前缀中文名"] }));
    expect(out.name).toBe("前缀中文名");
  });

  it("无对应语言的 @name 时回退到原始脚本名", () => {
    changeLanguage("en-US");
    const out = applyScriptDisplayInfo(makeMenu(), makeScript({ "name:zh-cn": ["中文名"] }, "Raw Name"));
    expect(out.name).toBe("Raw Name");
  });

  it("应附加脚本图标 URL", () => {
    changeLanguage("zh-CN");
    const out = applyScriptDisplayInfo(makeMenu(), makeScript({ icon: ["https://example.com/i.png"] }));
    expect(out.icon).toBe("https://example.com/i.png");
  });

  it("无任何本地化/图标时不应丢失原始字段", () => {
    changeLanguage("zh-CN");
    const menu = makeMenu({ uuid: "abc", enable: false });
    const out = applyScriptDisplayInfo(menu, makeScript({}));
    expect(out.name).toBe("Raw Name");
    expect(out.uuid).toBe("abc");
    expect(out.enable).toBe(false);
    expect(out.icon).toBeUndefined();
  });
});

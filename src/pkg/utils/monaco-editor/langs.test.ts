import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { editorLangs } from "./langs";

// editorLangs 独立于 i18next 语言包，新增 UI 语言时容易被遗漏，这里做完整性守卫。

function deepKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" ? deepKeys(v as Record<string, unknown>, key) : [key];
  });
}

describe("editorLangs 编辑器语言包", () => {
  it("与注册的 UI 语言一一对应", () => {
    const appLocales = fs
      .readdirSync(path.join(process.cwd(), "src/locales"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(Object.keys(editorLangs).sort()).toEqual(appLocales.sort());
  });

  it("各语言条目与 en-US 的键结构一致", () => {
    const template = deepKeys(editorLangs["en-US"]).sort();
    for (const [lang, entry] of Object.entries(editorLangs)) {
      expect(deepKeys(entry).sort(), `语言 ${lang} 的键结构应与 en-US 一致`).toEqual(template);
    }
  });
});

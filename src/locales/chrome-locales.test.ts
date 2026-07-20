import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// chrome.i18n 的语言文件（src/assets/_locales/<dir>/messages.json）独立于 i18next 语言包，
// 新增 UI 语言时容易被遗漏，这里做完整性守卫。

const repoRoot = process.cwd();
const localesDir = path.join(repoRoot, "src/locales");
const chromeLocalesDir = path.join(repoRoot, "src/assets/_locales");

const appLocales = fs
  .readdirSync(localesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const chromeLocales = fs
  .readdirSync(chromeLocalesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

describe("chrome.i18n 语言文件", () => {
  it("每个 UI 语言都有对应的 _locales 目录", () => {
    const missing = appLocales.filter((locale) => {
      const primary = locale.split("-")[0];
      return !chromeLocales.includes(primary) && !chromeLocales.includes(locale.replace("-", "_"));
    });
    expect(missing).toEqual([]);
  });

  it("各 _locales 目录的 messages.json 键与 en 一致", () => {
    const readKeys = (dir: string) =>
      Object.keys(JSON.parse(fs.readFileSync(path.join(chromeLocalesDir, dir, "messages.json"), "utf8"))).sort();
    const template = readKeys("en");
    for (const dir of chromeLocales) {
      expect(readKeys(dir), `_locales/${dir} 的 messages.json 键应与 en 一致`).toEqual(template);
    }
  });
});

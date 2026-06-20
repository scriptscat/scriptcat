import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 防止 i18n key 命名空间写错（如 script 命名空间的 key 漏写 "script:" 前缀，
// 或误用 "popup." 点号代替 "popup:" 冒号），导致 UI 直接显示原始 key 而非译文。
// 该测试静态扫描 src/pages 与 service worker 下所有 t("字面量")/i18n.t("字面量")
// 调用，按 i18next 解析规则在 zh-CN 资源中查找；带 defaultValue 的调用会回退到
// 默认文案，不在拦截范围内。

const repoRoot = process.cwd();
const localeDir = path.join(repoRoot, "src/locales/zh-CN");
const scanDirs = [path.join(repoRoot, "src/pages"), path.join(repoRoot, "src/app/service/service_worker")];

const DEFAULT_NS = "common";
const NS = fs
  .readdirSync(localeDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const resources: Record<string, unknown> = {};
for (const ns of NS) {
  resources[ns] = JSON.parse(fs.readFileSync(path.join(localeDir, `${ns}.json`), "utf8"));
}

function resolveKey(ns: string, keyPath: string): string | undefined {
  let cur: unknown = resources[ns];
  for (const seg of keyPath.split(".")) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" || typeof cur === "number" ? String(cur) : undefined;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

// 匹配 t("xxx")、i18n.t("xxx")、i18next.t("xxx")。
// 裸 t( 用前置 (?<![A-Za-z0-9_$.]) 排除 it(、expect( 及其它 foo.t( 等成员调用；
// i18n./i18next. 前缀显式匹配，覆盖 service worker 里的写法。
const T_CALL = /(?:\bi18n(?:ext)?\.t|(?<![A-Za-z0-9_$.])t)\(\s*"([^"]+)"([^)]*)/g;

function findUnresolved() {
  const violations: string[] = [];
  for (const file of scanDirs.flatMap(listFiles)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      T_CALL.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = T_CALL.exec(line))) {
        const key = m[1];
        const rest = m[2];
        if (key === "" || key.includes("${") || key.includes("{{")) continue; // 动态/插值 key
        const hasDefault = /defaultValue/.test(rest) || /defaultValue/.test(lines[idx + 1] ?? "");
        if (hasDefault) continue; // 有兜底文案，不会显示原始 key
        let ns = DEFAULT_NS;
        let keyPath = key;
        const ci = key.indexOf(":");
        if (ci !== -1) {
          ns = key.slice(0, ci);
          keyPath = key.slice(ci + 1);
        }
        if (!NS.includes(ns)) continue; // 冒号并非命名空间（如 url），跳过
        if (resolveKey(ns, keyPath) === undefined) {
          violations.push(`${path.relative(repoRoot, file)}:${idx + 1}  t("${key}")`);
        }
      }
    });
  }
  return violations;
}

describe("i18n 用法完整性", () => {
  it("src/pages 与 service worker 下所有无 defaultValue 的 t() 调用都应能在 zh-CN 资源中解析（命名空间前缀正确）", () => {
    const violations = findUnresolved();
    expect(violations, `以下 t() 调用无法解析，会直接显示原始 key：\n${violations.join("\n")}`).toEqual([]);
  });
});

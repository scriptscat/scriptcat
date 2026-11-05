import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildStub } from "./stub.mjs";
import process from "node:process";

const STUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "stub.mjs");

const SOURCE = [
  "// ==UserScript==",
  "// @name         Demo",
  "// @namespace    https://example.com/demo",
  "// @match        https://example.com/*",
  "// @grant        GM_getValue",
  "// @require      https://cdn.example.com/lib.js",
  "// ==/UserScript==",
  "",
  "/* ==UserConfig==",
  "general:",
  "  token:",
  "    title: Token",
  " ==/UserConfig== */",
  "",
  'console.log(GM_getValue("general.token"));',
  "",
].join("\n");

const tmpDirs = [];
const tmpDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sc stub-"));
  tmpDirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("buildStub", () => {
  it("保留整个头部和 UserConfig，在头部末尾追加指向源文件的 @require，正文为空", () => {
    const file = "/work/my project/demo.user.js";
    expect(buildStub(SOURCE, file)).toBe(
      [
        "// ==UserScript==",
        "// @name         Demo",
        "// @namespace    https://example.com/demo",
        "// @match        https://example.com/*",
        "// @grant        GM_getValue",
        "// @require      https://cdn.example.com/lib.js",
        `// @require      ${pathToFileURL(file).href}`,
        "// ==/UserScript==",
        "",
        "/* ==UserConfig==",
        "general:",
        "  token:",
        "    title: Token",
        " ==/UserConfig== */",
        "",
      ].join("\n")
    );
  });

  it("没有脚本头时抛错", () => {
    expect(() => buildStub("console.log(1);", "/work/a.user.js")).toThrow(/==UserScript==/);
  });
});

// 这些用例真实 spawn node 子进程（满载时单次可达 1s），不适用 vitest.config.ts 给单元测试定的 340ms 预算；
// 与 scripts/check-i18n.test.mjs 的命令行用例同一做法
describe("stub.mjs 命令行", { timeout: 15_000 }, () => {
  it("相对路径按当前目录解析为绝对 file:// 地址，输出到 stdout", () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, "demo.user.js"), SOURCE);
    const res = spawnSync(process.execPath, [STUB, "demo.user.js"], { cwd: dir, encoding: "utf8" });
    expect(res.status).toBe(0);
    // 子进程的 cwd 是解析过符号链接的路径（macOS 的 /var → /private/var），期望值按同样方式计算
    const expected = pathToFileURL(path.join(realpathSync(dir), "demo.user.js")).href;
    expect(res.stdout).toContain(`// @require      ${expected}\n`);
  });

  it("-o 写入文件", () => {
    const dir = tmpDir();
    const src = path.join(dir, "demo.user.js");
    const out = path.join(dir, "demo.stub.user.js");
    writeFileSync(src, SOURCE);
    const res = spawnSync(process.execPath, [STUB, src, "-o", out], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(buildStub(SOURCE, src));
  });

  it("源文件没有脚本头时退出码为 2", () => {
    const dir = tmpDir();
    const src = path.join(dir, "plain.js");
    writeFileSync(src, "console.log(1);");
    const res = spawnSync(process.execPath, [STUB, src], { encoding: "utf8" });
    expect(res.status).toBe(2);
  });
});

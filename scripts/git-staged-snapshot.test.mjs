import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { materializeStagedSnapshot } from "./git-staged-snapshot.mjs";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

// pre-commit 原先用 `git diff --cached` 只判断"是否要跑检查"，随后检查脚本却读普通工作区文件，
// 所以"暂存坏版本、工作区恢复为好版本"会放行坏提交。这里验证 materializeStagedSnapshot 真的
// 读的是 Git 索引（已 add 的内容），而不是工作区当前内容。

const tmpDirs = [];

function git(cwd, args) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function makeTempRepo() {
  const dir = path.join(os.tmpdir(), `staged-snapshot-test-${Math.random().toString(36).slice(2)}`);
  tmpDirs.push(dir);
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"]);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop(), { recursive: true, force: true });
  }
});

describe("materializeStagedSnapshot", () => {
  it("工作区与暂存区内容不同时应物化暂存区内容", () => {
    const repo = makeTempRepo();
    const source = path.join(repo, "a.json");

    writeFileSync(source, JSON.stringify({ source: "index" }));
    git(repo, ["add", "a.json"]);
    writeFileSync(source, JSON.stringify({ source: "working-tree" }));

    const dest = path.join(repo, "..", `snapshot-${Math.random().toString(36).slice(2)}`);
    tmpDirs.push(dest);
    materializeStagedSnapshot(repo, dest);

    const snapshotContent = JSON.parse(readFileSync(path.join(dest, "a.json"), "utf8"));
    expect(snapshotContent).toEqual({ source: "index" });
  });

  // 与 check-i18n.mjs 同源的入口守卫问题：脚本路径含空格 / 非 ASCII 字符时 CLI 分支不执行，
  // 快照目录留空。pre-commit 里它与 check-i18n 用 `&&` 串联，两者一起静默放行坏提交。
  describe("CLI 入口守卫（脚本路径含空格 / 非 ASCII 字符）", () => {
    // 真实启动 Node 和 Git 子进程，不适用 vitest.config.ts 给进程内单元测试定的 340ms 预算。
    const CLI_TIMEOUT = 15_000;

    it(
      "目录名同时包含空格和非 ASCII 字符时仍应真正物化暂存快照",
      () => {
        const repo = makeTempRepo();
        writeFileSync(path.join(repo, "a.json"), JSON.stringify({ v: 1 }));
        git(repo, ["add", "a.json"]);

        const host = path.join(os.tmpdir(), `snapshot-cli-${Math.random().toString(36).slice(2)}`);
        tmpDirs.push(host);
        const scriptDir = path.join(host, "测试 中文目录");
        mkdirSync(scriptDir, { recursive: true });
        const scriptPath = path.join(scriptDir, "git-staged-snapshot.mjs");
        copyFileSync(path.join(SCRIPTS_DIR, "git-staged-snapshot.mjs"), scriptPath);

        const dest = path.join(host, "dest");
        execFileSync(process.execPath, [scriptPath, repo, dest], { stdio: "pipe" });

        expect(existsSync(path.join(dest, "a.json"))).toBe(true);
      },
      CLI_TIMEOUT
    );
  });
});

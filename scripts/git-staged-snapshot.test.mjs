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
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop(), { recursive: true, force: true });
  }
});

describe("materializeStagedSnapshot", () => {
  it("暂存坏内容、工作区改回好内容时，快照应反映暂存区（坏）内容", () => {
    const repo = makeTempRepo();
    writeFileSync(path.join(repo, "a.json"), JSON.stringify({ good: true }));
    git(repo, ["add", "a.json"]);
    git(repo, ["commit", "-q", "-m", "init"]);

    // 暂存"坏"内容
    writeFileSync(path.join(repo, "a.json"), JSON.stringify({ bad: true }));
    git(repo, ["add", "a.json"]);
    // 工作区恢复为"好"内容（不影响索引）
    writeFileSync(path.join(repo, "a.json"), JSON.stringify({ good: true }));

    const dest = path.join(repo, "..", `snapshot-${Math.random().toString(36).slice(2)}`);
    tmpDirs.push(dest);
    materializeStagedSnapshot(repo, dest);

    const snapshotContent = JSON.parse(readFileSync(path.join(dest, "a.json"), "utf8"));
    expect(snapshotContent).toEqual({ bad: true });
  });

  it("未暂存的工作区改动不应出现在快照中", () => {
    const repo = makeTempRepo();
    writeFileSync(path.join(repo, "a.json"), JSON.stringify({ v: 1 }));
    git(repo, ["add", "a.json"]);
    git(repo, ["commit", "-q", "-m", "init"]);

    // 只改工作区，不 git add
    writeFileSync(path.join(repo, "a.json"), JSON.stringify({ v: 2 }));

    const dest = path.join(repo, "..", `snapshot-${Math.random().toString(36).slice(2)}`);
    tmpDirs.push(dest);
    materializeStagedSnapshot(repo, dest);

    const snapshotContent = JSON.parse(readFileSync(path.join(dest, "a.json"), "utf8"));
    expect(snapshotContent).toEqual({ v: 1 });
  });

  // 与 check-i18n.mjs 同源的入口守卫问题：脚本路径含空格 / 非 ASCII 字符时 CLI 分支不执行，
  // 快照目录留空。pre-commit 里它与 check-i18n 用 `&&` 串联，两者一起静默放行坏提交。
  describe("CLI 入口守卫（脚本路径含空格 / 非 ASCII 字符）", () => {
    // 真实 spawn node 子进程（实测 200ms+），不适用 vitest.config.ts 给单元测试定的 340ms 预算。
    const CLI_TIMEOUT = 15_000;

    for (const dirName of ["with space", "中文目录"]) {
      it(
        `目录名 "${dirName}" 下仍应真正物化暂存快照`,
        () => {
          const repo = makeTempRepo();
          writeFileSync(path.join(repo, "a.json"), JSON.stringify({ v: 1 }));
          git(repo, ["add", "a.json"]);
          git(repo, ["commit", "-q", "-m", "init"]);

          const host = path.join(os.tmpdir(), `snapshot-cli-${Math.random().toString(36).slice(2)}`);
          tmpDirs.push(host);
          const scriptDir = path.join(host, dirName);
          mkdirSync(scriptDir, { recursive: true });
          const scriptPath = path.join(scriptDir, "git-staged-snapshot.mjs");
          copyFileSync(path.join(SCRIPTS_DIR, "git-staged-snapshot.mjs"), scriptPath);

          const dest = path.join(host, "dest");
          execFileSync(process.execPath, [scriptPath, repo, dest], { stdio: "pipe" });

          expect(existsSync(path.join(dest, "a.json"))).toBe(true);
        },
        CLI_TIMEOUT
      );
    }
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { resolveConfigDir, verifyDirPermissions, atomicWriteFile } from "./config";

describe("resolveConfigDir - 按平台解析配置目录（doc 06 §2）", () => {
  it("Windows 平台使用 LOCALAPPDATA 下的 ScriptCat/NativeHost", () => {
    const dir = resolveConfigDir("win32");
    expect(dir).toContain("ScriptCat");
    expect(dir).toContain("NativeHost");
  });

  it("macOS 平台使用 ~/Library/Application Support/ScriptCat/NativeHost", () => {
    const dir = resolveConfigDir("darwin");
    expect(dir).toContain("Library/Application Support/ScriptCat/NativeHost");
  });

  it("Linux 平台使用 XDG_DATA_HOME 或 ~/.local/share 下的 scriptcat/native-host", () => {
    const dir = resolveConfigDir("linux");
    expect(dir).toContain("scriptcat/native-host");
  });
});

describe("verifyDirPermissions / atomicWriteFile - 文件系统安全（doc 04 §8, doc 06 §5）", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")("拒绝 world-writable 目录", async () => {
    await fs.chmod(tmpRoot, 0o777);
    const result = await verifyDirPermissions(tmpRoot);
    expect(result.ok).toBe(false);
  });

  it.skipIf(process.platform === "win32")("接受用户私有目录（0700）", async () => {
    await fs.chmod(tmpRoot, 0o700);
    const result = await verifyDirPermissions(tmpRoot);
    expect(result).toEqual({ ok: true });
  });

  it("不存在的路径返回 PATH_NOT_FOUND", async () => {
    const result = await verifyDirPermissions(path.join(tmpRoot, "does-not-exist"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("PATH_NOT_FOUND");
  });

  it.skipIf(process.platform === "win32")("解析符号链接后再校验权限", async () => {
    const realDir = path.join(tmpRoot, "real");
    await fs.mkdir(realDir);
    await fs.chmod(realDir, 0o777);
    const linkPath = path.join(tmpRoot, "link");
    await fs.symlink(realDir, linkPath);

    const result = await verifyDirPermissions(linkPath);
    expect(result.ok).toBe(false);
  });

  it("atomicWriteFile 写入后可读回相同内容", async () => {
    const target = path.join(tmpRoot, "config.json");
    await atomicWriteFile(target, JSON.stringify({ a: 1 }));
    const content = await fs.readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual({ a: 1 });
  });

  it("atomicWriteFile 不留下临时文件", async () => {
    const target = path.join(tmpRoot, "config.json");
    await atomicWriteFile(target, "hello");
    const entries = await fs.readdir(tmpRoot);
    expect(entries).toEqual(["config.json"]);
  });

  it.skipIf(process.platform === "win32")("atomicWriteFile 写入的文件权限为用户私有（0600）", async () => {
    const target = path.join(tmpRoot, "secret.json");
    await atomicWriteFile(target, "secret");
    const stat = await fs.stat(target);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("atomicWriteFile 覆盖已存在文件时内容整体替换，不产生半写状态", async () => {
    const target = path.join(tmpRoot, "config.json");
    await atomicWriteFile(target, JSON.stringify({ v: 1 }));
    await atomicWriteFile(target, JSON.stringify({ v: 2 }));
    const content = await fs.readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual({ v: 2 });
  });
});

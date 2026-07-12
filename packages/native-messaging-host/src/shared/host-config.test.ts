import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { loadHostConfig, saveHostConfig, hostConfigPath, clientsPath, runtimeDir } from "./host-config";

describe("host-config.ts - 主机配置读写", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-hostconfig-"));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("配置文件不存在时返回空 allowedOrigins", async () => {
    const config = await loadHostConfig(tmpRoot);
    expect(config).toEqual({ allowedOrigins: [] });
  });

  it("save 后 load 读回相同内容", async () => {
    await saveHostConfig(tmpRoot, {
      allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"],
      endpointName: "/run/x.sock",
    });
    const config = await loadHostConfig(tmpRoot);
    expect(config.allowedOrigins).toEqual(["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]);
    expect(config.endpointName).toBe("/run/x.sock");
  });

  it.skipIf(process.platform === "win32")("配置文件权限为 0600", async () => {
    await saveHostConfig(tmpRoot, { allowedOrigins: [] });
    const stat = await fs.stat(hostConfigPath(tmpRoot));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("路径 helper 返回预期的子路径", () => {
    expect(hostConfigPath(tmpRoot)).toBe(path.join(tmpRoot, "config.json"));
    expect(clientsPath(tmpRoot)).toBe(path.join(tmpRoot, "clients.json"));
    expect(runtimeDir(tmpRoot)).toBe(path.join(tmpRoot, "run"));
  });
});

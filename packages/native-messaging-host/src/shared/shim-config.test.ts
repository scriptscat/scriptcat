import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { loadShimCredentials, saveShimCredentials, credentialsPath, resolveShimConfigDir } from "./shim-config";

describe("shim-config.ts - shim 凭据存储", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-shimconfig-"));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("凭据文件不存在时返回 undefined", async () => {
    expect(await loadShimCredentials(tmpRoot)).toBeUndefined();
  });

  it("save 后 load 读回相同内容", async () => {
    await saveShimCredentials(tmpRoot, {
      clientId: "c1",
      token: "raw-token",
      tokenHash: "hash",
      endpointDiscoveryPath: "/config/config.json",
    });
    const creds = await loadShimCredentials(tmpRoot);
    expect(creds?.clientId).toBe("c1");
    expect(creds?.token).toBe("raw-token");
  });

  it.skipIf(process.platform === "win32")("凭据文件权限为 0600", async () => {
    await saveShimCredentials(tmpRoot, {
      clientId: "c1",
      token: "raw-token",
      tokenHash: "hash",
      endpointDiscoveryPath: "/config/config.json",
    });
    const stat = await fs.stat(credentialsPath(tmpRoot));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("resolveShimConfigDir 按平台解析目录", () => {
    expect(resolveShimConfigDir("win32")).toBe(path.join(process.env.APPDATA || os.homedir(), "scriptcat-mcp"));

    const posixConfigDir = path.join(os.homedir(), ".config", "scriptcat-mcp");

    expect(resolveShimConfigDir("darwin")).toBe(posixConfigDir);
    expect(resolveShimConfigDir("linux")).toBe(posixConfigDir);
  });
});

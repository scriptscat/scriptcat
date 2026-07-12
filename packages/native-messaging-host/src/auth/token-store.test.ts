import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { TokenStore, generateToken, hashToken } from "./token-store";

describe("generateToken / hashToken", () => {
  it("generateToken 生成 256 位（64 十六进制字符）随机 token", () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("每次生成的 token 不重复", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateToken()));
    expect(tokens.size).toBe(50);
  });

  it("hashToken 对相同输入产生相同哈希，对不同输入产生不同哈希", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });
});

describe("TokenStore - 客户端令牌存储", () => {
  let tmpRoot: string;
  let filePath: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-tokenstore-"));
    filePath = path.join(tmpRoot, "clients.json");
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("load() 在文件不存在时不抛错，返回空存储", async () => {
    const store = new TokenStore(filePath);
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  // Skipped as root (common in some CI containers): a chmod 0 file is still readable by root,
  // so the permission-denied condition this test exercises can't be reproduced there.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "load() 遇到非 ENOENT 错误（如权限不足）时应重新抛出，而非静默视为空存储",
    async () => {
      await fs.writeFile(filePath, "{}", { mode: 0o644 });
      await fs.chmod(filePath, 0o000);
      const store = new TokenStore(filePath);
      try {
        await expect(store.load()).rejects.toMatchObject({ code: "EACCES" });
      } finally {
        await fs.chmod(filePath, 0o600);
      }
    }
  );

  it("addClient 持久化后可通过新实例 load() 读回", async () => {
    const store = new TokenStore(filePath);
    await store.load();
    const token = generateToken();
    await store.addClient({
      clientId: "c1",
      displayName: "Test",
      tokenHash: hashToken(token),
      scopes: ["scripts:list"],
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    const reloaded = new TokenStore(filePath);
    await reloaded.load();
    expect(reloaded.get("c1")?.displayName).toBe("Test");
    // The raw token itself must never be persisted — only its hash.
    const raw = await fs.readFile(filePath, "utf-8");
    expect(raw).not.toContain(token);
  });

  it("findByTokenHash 找到匹配且未撤销的客户端", async () => {
    const store = new TokenStore(filePath);
    await store.load();
    const token = generateToken();
    const tokenHash = hashToken(token);
    await store.addClient({
      clientId: "c1",
      displayName: "Test",
      tokenHash,
      scopes: ["scripts:list"],
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    expect(store.findByTokenHash(tokenHash)?.clientId).toBe("c1");
    expect(store.findByTokenHash(hashToken(generateToken()))).toBeUndefined();
  });

  it("撤销后的客户端不再被 findByTokenHash 匹配", async () => {
    const store = new TokenStore(filePath);
    await store.load();
    const tokenHash = hashToken(generateToken());
    await store.addClient({
      clientId: "c1",
      displayName: "Test",
      tokenHash,
      scopes: ["scripts:list"],
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    const revoked = await store.revoke("c1");
    expect(revoked).toBe(true);
    expect(store.findByTokenHash(tokenHash)).toBeUndefined();
    expect(store.get("c1")?.revoked).toBe(true);
  });

  it("revoke 对不存在的 clientId 返回 false，不抛错", async () => {
    const store = new TokenStore(filePath);
    await store.load();
    await expect(store.revoke("missing")).resolves.toBe(false);
  });

  it("touchLastUsed 对不存在的 clientId 直接返回，不写入文件", async () => {
    const store = new TokenStore(filePath);
    await store.load();
    await expect(store.touchLastUsed("missing")).resolves.toBeUndefined();
    await expect(fs.stat(filePath)).rejects.toThrow();
  });

  it("updateScopes 对不存在的 clientId 返回 false，不写入文件", async () => {
    const store = new TokenStore(filePath);
    await store.load();
    await expect(store.updateScopes("missing", ["scripts:list"])).resolves.toBe(false);
    await expect(fs.stat(filePath)).rejects.toThrow();
  });

  it("touchLastUsed 更新 lastUsedAt 并持久化", async () => {
    const store = new TokenStore(filePath);
    await store.load();
    await store.addClient({
      clientId: "c1",
      displayName: "Test",
      tokenHash: hashToken(generateToken()),
      scopes: [],
      createdAt: 1000,
      lastUsedAt: 1000,
    });
    await store.touchLastUsed("c1");
    expect(store.get("c1")!.lastUsedAt).toBeGreaterThan(1000);

    const reloaded = new TokenStore(filePath);
    await reloaded.load();
    expect(reloaded.get("c1")!.lastUsedAt).toBeGreaterThan(1000);
  });

  it("updateScopes 更新并持久化客户端 scope", async () => {
    const store = new TokenStore(filePath);
    await store.load();
    await store.addClient({
      clientId: "c1",
      displayName: "Test",
      tokenHash: hashToken(generateToken()),
      scopes: ["scripts:list"],
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    await store.updateScopes("c1", ["scripts:list", "scripts:source:read"]);
    expect(store.get("c1")!.scopes).toEqual(["scripts:list", "scripts:source:read"]);
  });
});

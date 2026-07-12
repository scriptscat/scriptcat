import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Structural / static proofs for doc 04 §2 A1 and doc 08 §7/§9: this package must never open an
// HTTP listener or make outbound network calls — the entire CORS/DNS-rebinding/port-scanning
// attack class doesn't apply because there is nothing on the network to attack. These are
// source-level checks (not runtime spies) so they catch a violation anywhere in the tree, not
// just on paths a runtime test happens to exercise.

async function listProductionSourceFiles(): Promise<string[]> {
  const srcDir = path.resolve(__dirname, "..", "src");
  const out: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        out.push(full);
      }
    }
  };
  await walk(srcDir);
  return out;
}

describe("结构性安全断言：宿主/垫片从不开放 HTTP 监听或发起出站网络请求（doc 04 §2 A1, doc 08 §7/§9）", () => {
  it("生产源码中不存在 http/https 模块导入", async () => {
    const files = await listProductionSourceFiles();
    const offenders: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (
        /from\s+["']node:https?["']|require\(\s*["']https?["']\s*\)|require\(\s*["']node:https?["']\s*\)/.test(content)
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("生产源码中不存在 fetch(...) 出站调用", async () => {
    const files = await listProductionSourceFiles();
    const offenders: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (/\bfetch\s*\(/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("net.createServer 仅出现在 broker/ipc.ts 中，且从不以数字端口调用 .listen()", async () => {
    const files = await listProductionSourceFiles();
    const createServerSites: string[] = [];
    const numericListenSites: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (/net\.createServer\s*\(/.test(content)) {
        createServerSites.push(file);
      }
      // A TCP listener call looks like `.listen(<number>` or `.listen(<numeric literal in a var>)`;
      // our IPC endpoint only ever calls `.listen(target)` / `.listen(pipeName)` with a string.
      const listenCalls = content.match(/\.listen\(\s*[0-9]/g);
      if (listenCalls) {
        numericListenSites.push(file);
      }
    }
    expect(createServerSites).toEqual([path.resolve(__dirname, "broker", "ipc.ts")]);
    expect(numericListenSites).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// host.ts's `main()` runs unconditionally at module load (`main().catch(...)` at the bottom of
// the file) and touches process.stdin/exits the process — importing it in-process would run the
// full host, not just the CLI subcommand under test. It's exercised here as a real subprocess
// against the built dist/host.js instead — this is the automated equivalent of manually running
// `node dist/host.js --doctor`, and the only previously-untested surface of this entrypoint.
const distHostJs = path.resolve(__dirname, "..", "dist", "host.js");

/** Runs a fresh HOME/LOCALAPPDATA/XDG_DATA_HOME per call so runDoctor's config-dir creation
 * never touches the real developer machine's actual ScriptCat config directory. */
async function runHost(args: string[]): Promise<{ stdout: string; stderr: string; status: number }> {
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-host-entrypoint-"));
  try {
    const result = execFileSync(process.execPath, [distHostJs, ...args], {
      env: {
        ...process.env,
        HOME: tmpHome,
        LOCALAPPDATA: tmpHome,
        XDG_DATA_HOME: tmpHome,
      },
      encoding: "utf-8",
      // --print-manifest/--doctor both exit deterministically; a hang here would mean main()
      // fell through to the long-running stdin-listening branch, which is itself a bug.
      timeout: 10_000,
    });
    return { stdout: result, stderr: "", status: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", status: err.status ?? 1 };
  } finally {
    await fs.rm(tmpHome, { recursive: true, force: true });
  }
}

describe.skipIf(!existsSync(distHostJs))("host.ts 入口 CLI 子命令", () => {
  it("--print-manifest 携带合法参数时打印无 BOM 的清单 JSON 并以 0 退出", async () => {
    const validId = "a".repeat(32);
    const { stdout, status } = await runHost([
      "--print-manifest",
      "--extension-id",
      validId,
      "--host-path",
      "/opt/scriptcat/host.js",
    ]);
    expect(status).toBe(0);
    expect(stdout.charCodeAt(0)).not.toBe(0xfeff); // no BOM
    const manifest = JSON.parse(stdout);
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${validId}/`]);
    expect(manifest.path).toBe("/opt/scriptcat/host.js");
  });

  it("--print-manifest 缺少扩展 ID 时以非 0 退出，且不打印任何清单内容", async () => {
    const { stdout, status } = await runHost(["--print-manifest", "--host-path", "/opt/scriptcat/host.js"]);
    expect(status).not.toBe(0);
    expect(stdout).toBe("");
  });

  it("--print-manifest 拒绝无效的扩展 ID（如 fomrtutthjerocmw，其中 r/t/u/w 超出 a-p 范围）", async () => {
    const { stdout, status } = await runHost([
      "--print-manifest",
      "--extension-id",
      "fomrtutthjerocmw",
      "--host-path",
      "/opt/scriptcat/host.js",
    ]);
    expect(status).not.toBe(0);
    expect(stdout).toBe("");
  });

  it("--doctor 在全新（未安装过）的配置目录下运行、打印检查项且以非 0 退出（因缺少已注册的 origin）", async () => {
    const { stderr, status } = await runHost(["--doctor"]);
    expect(stderr).toContain("config dir creatable");
    expect(stderr).toContain("config dir permissions");
    expect(stderr).toContain("allowed origins configured");
    expect(stderr).toContain("node version");
    // A never-installed host has no allowedOrigins yet, so --doctor correctly reports failure.
    expect(status).not.toBe(0);
  });
});

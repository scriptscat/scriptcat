import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// shim.ts's `main()` runs unconditionally at module load, same as host.ts — exercised here as a
// real subprocess against the built dist/shim.js. Only the "no credentials yet" early-exit path
// is practical to cover this way: every other path (--pair, authenticated run) needs a live
// broker socket published by a running host, which is integration-test territory already covered
// at the SessionHandler/BrokerServer/SocketClient level (server.test.ts, session.test.ts).
const distShimJs = path.resolve(__dirname, "..", "dist", "shim.js");

describe.skipIf(!existsSync(distShimJs))("shim.ts 入口 · 未配对时的早退路径（doc 06 §4）", () => {
  it("尚无凭据时打印配对指引并以非 0 退出，且不创建任何配置目录（不会先尝试连接主机）", async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-shim-precheck-"));
    try {
      const result = execFileSync(process.execPath, [distShimJs], {
        env: { ...process.env, HOME: tmpHome, APPDATA: tmpHome },
        encoding: "utf-8",
        timeout: 10_000,
      }) as unknown as string;
      // Should never reach here (exit 1 expected) — execFileSync throws on non-zero exit.
      expect(result).toBe("__unreachable__");
    } catch (e) {
      const err = e as { stderr?: string; status?: number };
      expect(err.status).toBe(1);
      expect(err.stderr).toContain("No credentials found");
      expect(err.stderr).toContain("--pair");
    } finally {
      // scriptcat-mcp/credentials.json would live under tmpHome/.config/scriptcat-mcp — assert
      // the early-exit genuinely happened before any config directory was created.
      const shimConfigDir = path.join(tmpHome, ".config", "scriptcat-mcp");
      await expect(fs.stat(shimConfigDir)).rejects.toThrow();
      await fs.rm(tmpHome, { recursive: true, force: true });
    }
  });
});

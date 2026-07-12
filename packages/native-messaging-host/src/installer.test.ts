import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// install.sh/uninstall.sh (doc 06 §5) previously had zero behavioral test coverage — only
// manifest-gen.ts's pure function was tested, never the scripts themselves. Driven here as real
// subprocesses against a fake HOME, exactly like the reviewer's manual smoke test (doc 09 §3
// step 1) but automated and isolated. install.ps1/uninstall.ps1 aren't covered here — there is no
// PowerShell interpreter in this environment; they're syntax-reviewed by hand and exercised only
// by the Windows leg of the native-host CI matrix building/running this same package.
const packageRoot = path.resolve(__dirname, "..");
const installSh = path.join(packageRoot, "installers", "install.sh");
const uninstallSh = path.join(packageRoot, "installers", "uninstall.sh");
const distDir = path.join(packageRoot, "dist");
const distHostJs = path.join(distDir, "host.js");

const EXTENSION_ID_A = "a".repeat(32);
const EXTENSION_ID_B = "b".repeat(32);

function run(script: string, args: string[], home: string): { stdout: string; stderr: string; status: number } {
  // spawnSync (not execFileSync): execFileSync only exposes stderr via the thrown error on a
  // non-zero exit — a script that exits 0 but writes an informational message to stderr (e.g.
  // uninstall.sh's "nothing to uninstall" no-op) would have that message silently dropped.
  const result = spawnSync(script, args, {
    env: { ...process.env, HOME: home, XDG_DATA_HOME: undefined },
    encoding: "utf-8",
    timeout: 30_000,
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status ?? 1 };
}

function configDir(home: string): string {
  return process.platform === "darwin"
    ? path.join(home, "Library", "Application Support", "ScriptCat", "NativeHost")
    : path.join(home, ".local", "share", "scriptcat", "native-host");
}

function chromeManifestPath(home: string): string {
  return process.platform === "darwin"
    ? path.join(
        home,
        "Library",
        "Application Support",
        "Google",
        "Chrome",
        "NativeMessagingHosts",
        "com.scriptcat.native_host.json"
      )
    : path.join(home, ".config", "google-chrome", "NativeMessagingHosts", "com.scriptcat.native_host.json");
}

describe.skipIf(process.platform === "win32" || !existsSync(distHostJs))(
  "install.sh / uninstall.sh（doc 06 §5, doc 08 §8, doc 09 checklist #14/#15）",
  () => {
    let home: string;

    beforeEach(async () => {
      home = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-installer-"));
    });

    afterEach(async () => {
      await fs.rm(home, { recursive: true, force: true });
    });

    it("拒绝无效的扩展 ID，不创建任何文件", () => {
      const result = run(installSh, ["--extension-id", "not-a-valid-id"], home);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Invalid extension ID");
      expect(existsSync(configDir(home))).toBe(false);
    });

    it("未提供任何 --extension-id 时拒绝执行", () => {
      const result = run(installSh, [], home);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("At least one --extension-id");
    });

    it("拒绝未知的 --browser 参数", () => {
      const result = run(installSh, ["--extension-id", EXTENSION_ID_A, "--browser", "netscape"], home);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Unknown browser");
    });

    it("成功安装后：manifest 写入正确目录、无 BOM、权限 0600，且 host 自身 config.json 也记录了 origin", async () => {
      const result = run(installSh, ["--extension-id", EXTENSION_ID_A], home);
      expect(result.status).toBe(0);

      const manifestPath = chromeManifestPath(home);
      const stat = await fs.stat(manifestPath);
      expect(stat.mode & 0o777).toBe(0o600);

      const raw = await fs.readFile(manifestPath, "utf-8");
      expect(raw.charCodeAt(0)).not.toBe(0xfeff);
      const manifest = JSON.parse(raw);
      expect(manifest.allowed_origins).toEqual([`chrome-extension://${EXTENSION_ID_A}/`]);
      expect(manifest.name).toBe("com.scriptcat.native_host");

      const hostConfig = JSON.parse(await fs.readFile(path.join(configDir(home), "config.json"), "utf-8"));
      expect(hostConfig.allowedOrigins).toContain(`chrome-extension://${EXTENSION_ID_A}/`);
    });

    it("安装目录本身权限为 0700（仅当前用户）", async () => {
      run(installSh, ["--extension-id", EXTENSION_ID_A], home);
      const stat = await fs.stat(configDir(home));
      expect(stat.mode & 0o777).toBe(0o700);
    });

    it("install-metadata.json 记录版本、安装目录与已注册的 manifest 路径", async () => {
      run(installSh, ["--extension-id", EXTENSION_ID_A], home);
      const metadata = JSON.parse(await fs.readFile(path.join(configDir(home), "install-metadata.json"), "utf-8"));
      expect(metadata.manifests).toEqual([chromeManifestPath(home)]);
      expect(metadata.installDir.startsWith(configDir(home))).toBe(true);
      expect(metadata.previous).toBeUndefined();
    });

    it("uninstall.sh 移除已注册的 manifest、安装目录与 metadata 文件，不留残余", async () => {
      run(installSh, ["--extension-id", EXTENSION_ID_A], home);
      const metadata = JSON.parse(await fs.readFile(path.join(configDir(home), "install-metadata.json"), "utf-8"));

      const result = run(uninstallSh, [], home);
      expect(result.status).toBe(0);

      expect(existsSync(chromeManifestPath(home))).toBe(false);
      expect(existsSync(metadata.installDir)).toBe(false);
      expect(existsSync(path.join(configDir(home), "install-metadata.json"))).toBe(false);
    });

    it("在没有安装记录的目录下运行 uninstall.sh 是安全的空操作（退出码 0）", () => {
      const result = run(uninstallSh, [], home);
      expect(result.status).toBe(0);
      expect(result.stderr).toContain("nothing to uninstall");
    });

    it("--rollback 在没有 install-metadata.json 时报错退出", () => {
      const result = run(installSh, ["--rollback"], home);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("nothing to roll back");
    });

    it("首次安装（无历史版本）时 --rollback 报错，因为没有可回退的目标", () => {
      run(installSh, ["--extension-id", EXTENSION_ID_A], home);
      const result = run(installSh, ["--rollback"], home);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("nothing to roll back to");
    });

    it("重新安装同一版本（如重新注册浏览器）不会被当成升级，--rollback 仍报错", () => {
      run(installSh, ["--extension-id", EXTENSION_ID_A], home);
      run(installSh, ["--extension-id", EXTENSION_ID_A, "--browser", "chrome"], home);
      const result = run(installSh, ["--rollback"], home);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("nothing to roll back to");
    });

    it("升级（安装比已记录版本更新的版本）会把旧版本记为 previous；--rollback 据此还原 manifest 并保留新版本目录", async () => {
      // install.sh derives VERSION from this package's own package.json — there's no CLI flag to
      // fake a version, so a real "second install at a different version" can't be driven end to
      // end here. Instead, seed the state a real prior install would have left (a fixture
      // "previous version" dir + its manifest), then let install.sh's real upgrade/rollback code
      // consume it — this still exercises the actual script logic, only the setup is synthetic.
      const dir = configDir(home);
      const fixturePreviousDir = path.join(dir, "0.0.1-fixture");
      // host.js imports its dependency modules (native/, shared/, auth/, ...) by relative path —
      // a lone copy of host.js alone 404s at ERR_MODULE_NOT_FOUND, so the whole dist/ tree (which
      // pnpm build already produced for this test run, per describe.skipIf above) is mirrored in.
      await fs.cp(distDir, fixturePreviousDir, { recursive: true });
      const fixtureLauncher = path.join(fixturePreviousDir, "launch-host.sh");
      await fs.writeFile(
        fixtureLauncher,
        `#!/usr/bin/env bash\nexec node "${path.join(fixturePreviousDir, "host.js")}" "$@"\n`
      );
      await fs.chmod(fixtureLauncher, 0o700);

      await fs.mkdir(path.dirname(chromeManifestPath(home)), { recursive: true });
      const fixtureManifest = {
        name: "com.scriptcat.native_host",
        description: "ScriptCat Native Messaging Host + MCP Bridge",
        path: fixtureLauncher,
        type: "stdio",
        allowed_origins: [`chrome-extension://${EXTENSION_ID_A}/`, `chrome-extension://${EXTENSION_ID_B}/`],
      };
      await fs.writeFile(chromeManifestPath(home), JSON.stringify(fixtureManifest, null, 2) + "\n", { mode: 0o600 });

      await fs.writeFile(
        path.join(dir, "install-metadata.json"),
        JSON.stringify(
          {
            version: "0.0.1-fixture",
            installDir: fixturePreviousDir,
            launcher: fixtureLauncher,
            manifests: [chromeManifestPath(home)],
            installedAt: new Date(0).toISOString(),
          },
          null,
          2
        ) + "\n",
        { mode: 0o600 }
      );

      // The "upgrade": installs the real (different) version over the fixture state above.
      const installResult = run(installSh, ["--extension-id", EXTENSION_ID_A], home);
      expect(installResult.status).toBe(0);

      const upgradedMetadata = JSON.parse(await fs.readFile(path.join(dir, "install-metadata.json"), "utf-8"));
      expect(upgradedMetadata.previous).toMatchObject({
        version: "0.0.1-fixture",
        installDir: fixturePreviousDir,
        launcher: fixtureLauncher,
      });
      expect(upgradedMetadata.version).not.toBe("0.0.1-fixture");
      const newInstallDir: string = upgradedMetadata.installDir;
      expect(existsSync(newInstallDir)).toBe(true);

      // The upgrade overwrote the manifest to point at the new launcher and dropped extension B
      // (this install only requested extension A) — confirm that before rolling back.
      const upgradedManifest = JSON.parse(await fs.readFile(chromeManifestPath(home), "utf-8"));
      expect(upgradedManifest.path).not.toBe(fixtureLauncher);
      expect(upgradedManifest.allowed_origins).toEqual([`chrome-extension://${EXTENSION_ID_A}/`]);

      // The rollback: restores the manifest to point at the fixture launcher again, using the
      // extension IDs recovered from the (about-to-be-overwritten) manifest's allowed_origins —
      // so extension A survives the round trip even though --rollback took no --extension-id.
      const rollbackResult = run(installSh, ["--rollback"], home);
      expect(rollbackResult.status).toBe(0);
      expect(rollbackResult.stdout).toContain("0.0.1-fixture");

      const rolledBackManifest = JSON.parse(await fs.readFile(chromeManifestPath(home), "utf-8"));
      expect(rolledBackManifest.path).toBe(fixtureLauncher);
      expect(rolledBackManifest.allowed_origins).toEqual([`chrome-extension://${EXTENSION_ID_A}/`]);

      const rolledBackMetadata = JSON.parse(await fs.readFile(path.join(dir, "install-metadata.json"), "utf-8"));
      expect(rolledBackMetadata.version).toBe("0.0.1-fixture");
      expect(rolledBackMetadata.installDir).toBe(fixturePreviousDir);
      expect(rolledBackMetadata.previous).toBeUndefined();

      // The newer version's install dir is never deleted by a rollback (doc 06 §5).
      expect(existsSync(newInstallDir)).toBe(true);
    });
  }
);

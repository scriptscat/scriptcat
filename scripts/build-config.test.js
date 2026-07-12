import { describe, it, expect } from "vitest";
import {
  resolveAgentEnabled,
  applyAgentManifest,
  resolveMcpEnabled,
  applyMcpManifest,
  checkMcpPackProfileCompliance,
} from "./build-config.js";

describe("构建配置 - agent 开关", () => {
  describe("resolveAgentEnabled - 打包判断（稳定版屏蔽、beta 开启，SC_DISABLE_AGENT 覆盖）", () => {
    it("稳定版（非 beta）默认屏蔽 agent", () => {
      expect(resolveAgentEnabled({ isBeta: false, disableEnv: undefined })).toBe(false);
    });

    it("beta 版默认开启 agent", () => {
      expect(resolveAgentEnabled({ isBeta: true, disableEnv: undefined })).toBe(true);
    });

    it("SC_DISABLE_AGENT='true' 强制屏蔽，覆盖 beta 默认开启", () => {
      expect(resolveAgentEnabled({ isBeta: true, disableEnv: "true" })).toBe(false);
    });

    it("SC_DISABLE_AGENT='false' 强制开启，覆盖稳定版默认屏蔽", () => {
      expect(resolveAgentEnabled({ isBeta: false, disableEnv: "false" })).toBe(true);
    });

    it("SC_DISABLE_AGENT 为非 'true'/'false' 的值时回退到版本派生", () => {
      expect(resolveAgentEnabled({ isBeta: false, disableEnv: "1" })).toBe(false);
      expect(resolveAgentEnabled({ isBeta: true, disableEnv: "1" })).toBe(true);
    });
  });

  describe("applyAgentManifest", () => {
    const makeManifest = () => ({
      permissions: ["tabs", "debugger", "storage"],
      optional_permissions: ["background", "userScripts"],
    });

    it("启用 agent 时原样返回 manifest 且保留 debugger 权限", () => {
      const manifest = makeManifest();
      const result = applyAgentManifest(manifest, true);
      expect(result).toBe(manifest);
      expect(result.permissions).toContain("debugger");
    });

    it("禁用 agent 时移除 debugger 权限", () => {
      const result = applyAgentManifest(makeManifest(), false);
      expect(result.permissions).not.toContain("debugger");
      expect(result.permissions).toEqual(["tabs", "storage"]);
    });

    it("禁用 agent 时不改动其它权限", () => {
      const result = applyAgentManifest(makeManifest(), false);
      expect(result.optional_permissions).toEqual(["background", "userScripts"]);
    });

    it("禁用 agent 时不修改入参 manifest", () => {
      const manifest = makeManifest();
      applyAgentManifest(manifest, false);
      expect(manifest.permissions).toContain("debugger");
    });
  });
});

describe("构建配置 - MCP 开关", () => {
  describe("resolveMcpEnabled - 打包判断（所有 profile 默认关闭，仅 developer profile 或 SC_ENABLE_MCP 显式开启）", () => {
    it("developer profile 默认开启 MCP", () => {
      expect(resolveMcpEnabled({ profile: "developer", enableEnv: undefined })).toBe(true);
    });

    it("store-stable profile 默认屏蔽 MCP", () => {
      expect(resolveMcpEnabled({ profile: "store-stable", enableEnv: undefined })).toBe(false);
    });

    it("store-beta profile 默认屏蔽 MCP", () => {
      expect(resolveMcpEnabled({ profile: "store-beta", enableEnv: undefined })).toBe(false);
    });

    it("SC_ENABLE_MCP='true' 显式开启，即使 profile 非 developer", () => {
      expect(resolveMcpEnabled({ profile: "store-stable", enableEnv: "true" })).toBe(true);
    });

    it("SC_ENABLE_MCP='false' 显式屏蔽，覆盖 developer profile 默认开启", () => {
      expect(resolveMcpEnabled({ profile: "developer", enableEnv: "false" })).toBe(false);
    });

    it("SC_ENABLE_MCP 为非 'true'/'false' 的值时回退到 profile 派生", () => {
      expect(resolveMcpEnabled({ profile: "store-stable", enableEnv: "1" })).toBe(false);
      expect(resolveMcpEnabled({ profile: "developer", enableEnv: "1" })).toBe(true);
    });
  });

  describe("applyMcpManifest", () => {
    const makeManifest = () => ({
      permissions: ["tabs", "storage", "nativeMessaging"],
      optional_permissions: ["background", "userScripts"],
    });

    it("启用 MCP 时原样返回 manifest 且保留 nativeMessaging 权限", () => {
      const manifest = makeManifest();
      const result = applyMcpManifest(manifest, true);
      expect(result).toBe(manifest);
      expect(result.permissions).toContain("nativeMessaging");
    });

    it("屏蔽 MCP 时移除 nativeMessaging 权限", () => {
      const result = applyMcpManifest(makeManifest(), false);
      expect(result.permissions).not.toContain("nativeMessaging");
      expect(result.permissions).toEqual(["tabs", "storage"]);
    });

    it("屏蔽 MCP 时不改动其它权限", () => {
      const result = applyMcpManifest(makeManifest(), false);
      expect(result.optional_permissions).toEqual(["background", "userScripts"]);
    });

    it("屏蔽 MCP 时不修改入参 manifest", () => {
      const manifest = makeManifest();
      applyMcpManifest(manifest, false);
      expect(manifest.permissions).toContain("nativeMessaging");
    });
  });

  describe("checkMcpPackProfileCompliance - store/developer 强断言（doc 05 §1.3, doc 08 §5）", () => {
    const cleanManifest = { permissions: ["tabs", "storage"] };
    const mcpManifest = { permissions: ["tabs", "storage", "nativeMessaging"] };

    it("store-stable：manifest 无权限、bundle 无 MCP 代码 → 通过", () => {
      const result = checkMcpPackProfileCompliance({
        profile: "store-stable",
        manifest: cleanManifest,
        mcpEnabled: false,
        nativeHostCompiledIn: false,
      });
      expect(result).toEqual({ ok: true });
    });

    it("store-stable：manifest 含 nativeMessaging 权限 → 拒绝", () => {
      const result = checkMcpPackProfileCompliance({
        profile: "store-stable",
        manifest: mcpManifest,
        mcpEnabled: false,
        nativeHostCompiledIn: false,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("nativeMessaging permission");
    });

    it("store-beta：即使 manifest 干净，bundle 中仍编译进了 MCP 代码 → 拒绝", () => {
      const result = checkMcpPackProfileCompliance({
        profile: "store-beta",
        manifest: cleanManifest,
        mcpEnabled: false,
        nativeHostCompiledIn: true,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("compiled into the bundle");
    });

    it("developer + MCP 未开启：即使 manifest 无权限、bundle 无代码，也视为合规（不要求）", () => {
      const result = checkMcpPackProfileCompliance({
        profile: "developer",
        manifest: cleanManifest,
        mcpEnabled: false,
        nativeHostCompiledIn: false,
      });
      expect(result).toEqual({ ok: true });
    });

    it("developer + MCP 开启：manifest 有权限、bundle 有代码 → 通过", () => {
      const result = checkMcpPackProfileCompliance({
        profile: "developer",
        manifest: mcpManifest,
        mcpEnabled: true,
        nativeHostCompiledIn: true,
      });
      expect(result).toEqual({ ok: true });
    });

    it("developer + MCP 开启：manifest 缺少权限 → 拒绝", () => {
      const result = checkMcpPackProfileCompliance({
        profile: "developer",
        manifest: cleanManifest,
        mcpEnabled: true,
        nativeHostCompiledIn: true,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("must contain the nativeMessaging permission");
    });

    it("developer + MCP 开启：bundle 中未编译进 MCP 代码 → 拒绝（可能是回归 bug，如本次修复的 DefinePlugin 缺口）", () => {
      const result = checkMcpPackProfileCompliance({
        profile: "developer",
        manifest: mcpManifest,
        mcpEnabled: true,
        nativeHostCompiledIn: false,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("must have MCP native-host integration code compiled");
    });
  });
});

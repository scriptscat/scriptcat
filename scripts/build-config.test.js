import { describe, it, expect } from "vitest";
import { resolveAgentEnabled, applyAgentManifest } from "./build-config.js";

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

import { describe, it, expect } from "vitest";
import { isAgentEnabled, applyAgentManifest } from "./build-config.js";

describe("构建配置 - agent 开关", () => {
  describe("isAgentEnabled", () => {
    it("开发版本应启用 agent", () => {
      expect(isAgentEnabled({ isDev: true, isBeta: false })).toBe(true);
    });

    it("beta 版本应启用 agent", () => {
      expect(isAgentEnabled({ isDev: false, isBeta: true })).toBe(true);
    });

    it("正式版本应禁用 agent", () => {
      expect(isAgentEnabled({ isDev: false, isBeta: false })).toBe(false);
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

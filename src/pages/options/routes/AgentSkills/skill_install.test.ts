import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

vi.mock("@App/pages/store/features/script", () => ({
  agentClient: {
    prepareSkillInstall: vi.fn(),
    prepareSkillFromUrl: vi.fn(),
  },
}));

import { agentClient } from "@App/pages/store/features/script";
import { arrayBufferToBase64, openSkillInstallPage, installSkillFromZip, installSkillFromUrl } from "./skill_install";

describe("Skill 安装 producer 工具", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("arrayBufferToBase64", () => {
    it("将 ArrayBuffer 按字节编码为 base64 字符串", () => {
      const bytes = new Uint8Array([72, 105]); // "Hi"
      expect(arrayBufferToBase64(bytes.buffer)).toBe(btoa("Hi"));
    });
  });

  describe("openSkillInstallPage", () => {
    it("在新标签打开安装页并附带 skill 参数", () => {
      const open = vi.fn();
      vi.stubGlobal("open", open);
      openSkillInstallPage("uuid-123");
      expect(open).toHaveBeenCalledWith("/src/install.html?skill=uuid-123", "_blank");
    });
  });

  describe("installSkillFromZip", () => {
    it("读取 ZIP 字节→prepareSkillInstall(base64)→打开安装页", async () => {
      const open = vi.fn();
      vi.stubGlobal("open", open);
      (agentClient.prepareSkillInstall as Mock).mockResolvedValue("uuid-zip");

      const bytes = new Uint8Array([1, 2, 3]);
      const file = new File([bytes], "s.zip", { type: "application/zip" });
      // 测试环境未实现 Blob.arrayBuffer(真实浏览器均支持),按标准语义补上,返回真实字节
      file.arrayBuffer = () => Promise.resolve(bytes.buffer);
      await installSkillFromZip(file);

      expect(agentClient.prepareSkillInstall).toHaveBeenCalledWith(btoa(String.fromCharCode(1, 2, 3)));
      expect(open).toHaveBeenCalledWith("/src/install.html?skill=uuid-zip", "_blank");
    });
  });

  describe("installSkillFromUrl", () => {
    it("trim 后调用 prepareSkillFromUrl→打开安装页", async () => {
      const open = vi.fn();
      vi.stubGlobal("open", open);
      (agentClient.prepareSkillFromUrl as Mock).mockResolvedValue("uuid-url");

      await installSkillFromUrl("  https://x.com/s.zip  ");

      expect(agentClient.prepareSkillFromUrl).toHaveBeenCalledWith("https://x.com/s.zip");
      expect(open).toHaveBeenCalledWith("/src/install.html?skill=uuid-url", "_blank");
    });
  });
});

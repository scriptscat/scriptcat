import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@App/pages/store/features/script", () => ({
  scriptClient: { importByUrl: vi.fn() },
  agentClient: {
    prepareSkillInstall: vi.fn(),
    prepareSkillFromUrl: vi.fn(),
  },
}));

vi.mock("@App/pkg/utils/filehandle-db", () => ({
  saveHandle: vi.fn(),
}));

vi.mock("@App/pkg/utils/utils", () => ({
  makeBlobURL: vi.fn(),
  openInCurrentTab: vi.fn(),
}));

vi.mock("@App/pkg/utils/script", () => ({
  parseMetadata: vi.fn(),
}));

vi.mock("@App/pkg/utils/skill_script", () => ({
  parseSkillScriptMetadata: vi.fn(),
}));

vi.mock("@App/pkg/utils/uuid", () => ({
  uuidv4: vi.fn(() => "fid-1"),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@App/locales/locales", () => ({
  t: vi.fn((k: string) => k),
}));

import { handleImportFiles, handleImportUrls } from "./importHandler";
import { scriptClient, agentClient } from "@App/pages/store/features/script";
import { saveHandle } from "@App/pkg/utils/filehandle-db";
import { makeBlobURL, openInCurrentTab } from "@App/pkg/utils/utils";
import { parseMetadata } from "@App/pkg/utils/script";
import { parseSkillScriptMetadata } from "@App/pkg/utils/skill_script";
import { toast } from "sonner";

function fileOf(name: string, content: string): File {
  const file = new File([content], name, { type: "text/javascript" });
  // Mock the text() method on the File instance
  (file as any).text = vi.fn().mockResolvedValue(content);
  (file as any).arrayBuffer = vi.fn().mockResolvedValue(new TextEncoder().encode(content));
  return file;
}

describe("importHandler 文件分流", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(parseMetadata).mockReturnValue(null);
    vi.mocked(parseSkillScriptMetadata).mockReturnValue(null);
    vi.mocked(makeBlobURL).mockReturnValue("blob:fake");
    vi.mocked(openInCurrentTab).mockResolvedValue({ id: 1 } as any);
    vi.mocked(saveHandle).mockResolvedValue(undefined);
    vi.mocked(scriptClient.importByUrl).mockResolvedValue({ success: true, msg: "" });
    vi.mocked(agentClient.prepareSkillInstall).mockResolvedValue("skill-1");
    vi.mocked(agentClient.prepareSkillFromUrl).mockResolvedValue("skill-1");
  });

  it("带 handle 的用户脚本应存 handle 并打开 ?file= 安装页", async () => {
    const handle = { getFile: async () => fileOf("a.user.js", "// ==UserScript==") } as any;
    vi.mocked(parseMetadata).mockReturnValue({} as any);

    const stat = await handleImportFiles([{ file: await handle.getFile(), handle }]);

    expect(vi.mocked(saveHandle)).toHaveBeenCalledWith("fid-1", handle);
    expect(vi.mocked(openInCurrentTab)).toHaveBeenCalledWith("/src/install.html?file=fid-1");
    expect(stat.success).toBe(1);
  });

  it("zip 应走 prepareSkillInstall 并打开 ?skill= 安装页", async () => {
    vi.mocked(agentClient.prepareSkillInstall).mockResolvedValue("skill-9");

    const stat = await handleImportFiles([{ file: fileOf("x.zip", "PKzip"), handle: null }]);

    expect(vi.mocked(agentClient.prepareSkillInstall)).toHaveBeenCalled();
    expect(vi.mocked(openInCurrentTab)).toHaveBeenCalledWith("/src/install.html?skill=skill-9");
    expect(stat.success).toBe(1);
  });

  it("无 handle 的脚本应走 importByUrl(blob)", async () => {
    vi.mocked(parseMetadata).mockReturnValue({} as any);

    await handleImportFiles([{ file: fileOf("b.user.js", "// ==UserScript=="), handle: null }]);

    expect(vi.mocked(scriptClient.importByUrl)).toHaveBeenCalledWith("blob:fake");
  });

  it("既非脚本也非 SkillScript 应计入失败", async () => {
    vi.mocked(parseMetadata).mockReturnValue(null);
    vi.mocked(parseSkillScriptMetadata).mockReturnValue(null);

    const stat = await handleImportFiles([{ file: fileOf("c.js", "garbage"), handle: null }]);

    expect(stat.fail).toBe(1);
    expect(stat.success).toBe(0);
  });

  it("单文件成功不弹 toast,多文件成功弹汇总", async () => {
    vi.mocked(parseMetadata).mockReturnValue({} as any);

    await handleImportFiles([{ file: fileOf("a.user.js", "// ==UserScript=="), handle: null }]);
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();

    vi.clearAllMocks();
    vi.mocked(parseMetadata).mockReturnValue({} as any);
    vi.mocked(parseSkillScriptMetadata).mockReturnValue(null);
    vi.mocked(makeBlobURL).mockReturnValue("blob:fake");
    vi.mocked(scriptClient.importByUrl).mockResolvedValue({ success: true, msg: "" });

    await handleImportFiles([
      { file: fileOf("a.user.js", "// ==UserScript=="), handle: null },
      { file: fileOf("b.user.js", "// ==UserScript=="), handle: null },
    ]);
    expect(vi.mocked(toast.success)).toHaveBeenCalled();
  });
});

describe("importHandler 链接分流", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scriptClient.importByUrl).mockResolvedValue({ success: true, msg: "" });
    vi.mocked(agentClient.prepareSkillFromUrl).mockResolvedValue("skill-1");
    vi.mocked(openInCurrentTab).mockResolvedValue({ id: 1 } as any);
  });

  it("zip 链接走 prepareSkillFromUrl,其余走 importByUrl", async () => {
    vi.mocked(agentClient.prepareSkillFromUrl).mockResolvedValue("skill-7");

    await handleImportUrls(["https://e.com/s.user.js", "https://e.com/k.zip"]);

    expect(vi.mocked(scriptClient.importByUrl)).toHaveBeenCalledWith("https://e.com/s.user.js");
    expect(vi.mocked(agentClient.prepareSkillFromUrl)).toHaveBeenCalledWith("https://e.com/k.zip");
  });
});

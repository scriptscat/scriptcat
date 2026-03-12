import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseSkillMd, parseSkillZip } from "./skill";
import { parseCATToolMetadata } from "./cattool";

// 辅助函数：创建测试用 ZIP ArrayBuffer
async function createTestZip(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("parseSkillMd", () => {
  it("应正确解析完整的 SKILL.md", () => {
    const content = `---
name: web-search
description: 网络搜索能力
---

# Web Search Skill

你可以使用搜索工具来查找信息。`;

    const result = parseSkillMd(content);
    expect(result).not.toBeNull();
    expect(result!.metadata.name).toBe("web-search");
    expect(result!.metadata.description).toBe("网络搜索能力");
    expect(result!.prompt).toBe("# Web Search Skill\n\n你可以使用搜索工具来查找信息。");
  });

  it("没有 frontmatter 时返回 null", () => {
    const content = "# Just a markdown file\n\nNo frontmatter here.";
    expect(parseSkillMd(content)).toBeNull();
  });

  it("缺少 name 时返回 null", () => {
    const content = `---
description: 没有名字
---

Some prompt content.`;
    expect(parseSkillMd(content)).toBeNull();
  });

  it("应正确处理带引号的值", () => {
    const content = `---
name: "quoted-name"
description: 'single quoted'
---

Prompt text.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.name).toBe("quoted-name");
    expect(result.metadata.description).toBe("single quoted");
  });

  it("body 为空时 prompt 应为空字符串", () => {
    const content = `---
name: empty-body
description: test
---
`;

    const result = parseSkillMd(content)!;
    expect(result.prompt).toBe("");
  });

  it("应忽略未知的 frontmatter 字段", () => {
    const content = `---
name: test-skill
description: test
version: 1.0.0
author: someone
---

Prompt content here.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.name).toBe("test-skill");
    expect(result.metadata.description).toBe("test");
  });

  it("仅有 name 时应返回有效结果", () => {
    const content = `---
name: minimal
---

Minimal prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.name).toBe("minimal");
    expect(result.metadata.description).toBe("");
    expect(result.prompt).toBe("Minimal prompt.");
  });

  it("应正确处理多行 prompt 内容", () => {
    const content = `---
name: multi-line
description: test
---

# Title

Paragraph 1.

## Subtitle

- item 1
- item 2

\`\`\`js
console.log("hello");
\`\`\``;

    const result = parseSkillMd(content)!;
    expect(result.prompt).toContain("# Title");
    expect(result.prompt).toContain("- item 1");
    expect(result.prompt).toContain('console.log("hello");');
  });
});

describe("parseSkillZip", () => {
  const skillMdContent = `---
name: test-skill
description: A test skill
---

Test prompt content.`;

  it("应正确解析包含 SKILL.md + tools + references 的 ZIP", async () => {
    const zipData = await createTestZip({
      "SKILL.md": skillMdContent,
      "tools/extract.js": "// tool code\nconsole.log('extract');",
      "tools/parse.js": "// parse tool",
      "references/api_docs.md": "# API Docs\nSome docs.",
      "references/data.txt": "sample data",
    });

    const result = await parseSkillZip(zipData);
    expect(result.skillMd).toBe(skillMdContent);
    expect(result.scripts).toHaveLength(2);
    expect(result.scripts.map((s) => s.name).sort()).toEqual(["extract.js", "parse.js"]);
    expect(result.scripts.find((s) => s.name === "extract.js")!.code).toContain("console.log('extract')");
    expect(result.references).toHaveLength(2);
    expect(result.references.map((r) => r.name).sort()).toEqual(["api_docs.md", "data.txt"]);
    expect(result.references.find((r) => r.name === "api_docs.md")!.content).toContain("# API Docs");
  });

  it("应支持嵌套一层目录结构", async () => {
    const zipData = await createTestZip({
      "my-skill/SKILL.md": skillMdContent,
      "my-skill/tools/helper.js": "// helper",
      "my-skill/references/readme.md": "readme content",
    });

    const result = await parseSkillZip(zipData);
    expect(result.skillMd).toBe(skillMdContent);
    expect(result.scripts).toHaveLength(1);
    expect(result.scripts[0].name).toBe("helper.js");
    expect(result.references).toHaveLength(1);
    expect(result.references[0].name).toBe("readme.md");
  });

  it("缺少 SKILL.md 时应抛错", async () => {
    const zipData = await createTestZip({
      "tools/some.js": "// code",
      "references/doc.md": "doc",
    });

    await expect(parseSkillZip(zipData)).rejects.toThrow("SKILL.md");
  });

  it("tools 和 references 目录为空时应返回空数组", async () => {
    const zipData = await createTestZip({
      "SKILL.md": skillMdContent,
    });

    const result = await parseSkillZip(zipData);
    expect(result.skillMd).toBe(skillMdContent);
    expect(result.scripts).toEqual([]);
    expect(result.references).toEqual([]);
  });

  it("应忽略非 .js 的 tools 文件", async () => {
    const zipData = await createTestZip({
      "SKILL.md": skillMdContent,
      "tools/valid.js": "// valid",
      "tools/readme.md": "not a tool",
      "tools/config.json": "{}",
    });

    const result = await parseSkillZip(zipData);
    expect(result.scripts).toHaveLength(1);
    expect(result.scripts[0].name).toBe("valid.js");
  });

  it("应忽略子目录中的文件", async () => {
    const zipData = await createTestZip({
      "SKILL.md": skillMdContent,
      "tools/nested/deep.js": "// nested",
      "references/sub/file.md": "nested ref",
    });

    const result = await parseSkillZip(zipData);
    expect(result.scripts).toEqual([]);
    expect(result.references).toEqual([]);
  });
});

// ---- ZIP → parseSkillMd → installSkill 集成测试 ----

describe("parseSkillZip 端到端集成", () => {
  const VALID_CATTOOL_CODE = `// ==CATTool==
// @name taobao_extract
// @description 提取淘宝页面数据
// @param pageType string[search_results,product_detail] 页面类型
// @param tabId number 标签页 ID
// ==/CATTool==
const pageType = args.pageType || "auto";
return { pageType };`;

  it("ZIP 解析结果可直接传给 parseSkillMd 验证", async () => {
    const skillMd = `---
name: taobao-helper
description: 淘宝购物助手
---

你是一个淘宝购物助手，可以帮用户提取商品信息。`;

    const zipData = await createTestZip({
      "SKILL.md": skillMd,
      "tools/taobao_extract.js": VALID_CATTOOL_CODE,
      "references/api_docs.md": "# 淘宝 API 文档\n提取接口说明",
    });

    const zipResult = await parseSkillZip(zipData);

    // 验证 skillMd 可被 parseSkillMd 正确解析
    const parsed = parseSkillMd(zipResult.skillMd);
    expect(parsed).not.toBeNull();
    expect(parsed!.metadata.name).toBe("taobao-helper");
    expect(parsed!.metadata.description).toBe("淘宝购物助手");
    expect(parsed!.prompt).toContain("淘宝购物助手");
  });

  it("ZIP 中的 CATTool 脚本可被 parseCATToolMetadata 正确解析", async () => {
    const zipData = await createTestZip({
      "SKILL.md": `---\nname: tool-skill\ndescription: test\n---\nPrompt.`,
      "tools/taobao_extract.js": VALID_CATTOOL_CODE,
    });

    const zipResult = await parseSkillZip(zipData);

    // 验证脚本可被 CATTool 解析器识别
    expect(zipResult.scripts).toHaveLength(1);
    const toolMeta = parseCATToolMetadata(zipResult.scripts[0].code);
    expect(toolMeta).not.toBeNull();
    expect(toolMeta!.name).toBe("taobao_extract");
    expect(toolMeta!.description).toBe("提取淘宝页面数据");
    expect(toolMeta!.params).toHaveLength(2);
    expect(toolMeta!.params[0].name).toBe("pageType");
    expect(toolMeta!.params[1].name).toBe("tabId");
  });

  it("ZIP 解析输出结构与 installSkill 参数签名一致", async () => {
    const zipData = await createTestZip({
      "SKILL.md": `---\nname: sig-test\ndescription: Signature test\n---\nPrompt.`,
      "tools/helper.js": VALID_CATTOOL_CODE,
      "references/doc.md": "Doc content",
    });

    const result = await parseSkillZip(zipData);

    // 验证结构：skillMd 是 string，scripts 是 {name, code}[]，references 是 {name, content}[]
    expect(typeof result.skillMd).toBe("string");
    expect(Array.isArray(result.scripts)).toBe(true);
    expect(Array.isArray(result.references)).toBe(true);

    for (const s of result.scripts) {
      expect(typeof s.name).toBe("string");
      expect(typeof s.code).toBe("string");
      expect(s.name).toBeTruthy();
      expect(s.code).toBeTruthy();
    }

    for (const r of result.references) {
      expect(typeof r.name).toBe("string");
      expect(typeof r.content).toBe("string");
      expect(r.name).toBeTruthy();
      expect(r.content).toBeTruthy();
    }
  });

  it("嵌套目录 ZIP 的完整流程：解析 → 验证 SKILL.md → 验证 CATTool", async () => {
    const zipData = await createTestZip({
      "taobao-skill/SKILL.md": `---\nname: nested-skill\ndescription: 嵌套目录测试\n---\n嵌套 Skill 提示词。`,
      "taobao-skill/tools/extract.js": VALID_CATTOOL_CODE,
      "taobao-skill/references/guide.txt": "使用指南内容",
    });

    const zipResult = await parseSkillZip(zipData);

    // Step 1: SKILL.md 正确
    const parsed = parseSkillMd(zipResult.skillMd);
    expect(parsed).not.toBeNull();
    expect(parsed!.metadata.name).toBe("nested-skill");

    // Step 2: CATTool 正确
    expect(zipResult.scripts).toHaveLength(1);
    const toolMeta = parseCATToolMetadata(zipResult.scripts[0].code);
    expect(toolMeta).not.toBeNull();
    expect(toolMeta!.name).toBe("taobao_extract");

    // Step 3: references 正确
    expect(zipResult.references).toHaveLength(1);
    expect(zipResult.references[0].name).toBe("guide.txt");
    expect(zipResult.references[0].content).toBe("使用指南内容");
  });
});

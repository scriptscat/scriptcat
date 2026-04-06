import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseSkillMd, parseSkillZip } from "./skill";
import { parseSkillScriptMetadata } from "./skill_script";

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

  // ---- version / scripts / references 字段解析测试 ----

  it("应正确解析 version 字段", () => {
    const content = `---
name: versioned-skill
description: test
version: 1.2.3
---

Prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.name).toBe("versioned-skill");
    expect(result.metadata.version).toBe("1.2.3");
  });

  it("无 version 时 metadata.version 应为 undefined", () => {
    const content = `---
name: no-version
description: test
---

Prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.version).toBeUndefined();
  });

  it("应正确解析 scripts 文件名列表", () => {
    const content = `---
name: with-scripts
description: test
scripts:
  - compare.js
  - helper.js
---

Prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.scripts).toEqual(["compare.js", "helper.js"]);
  });

  it("应正确解析 references 文件名列表", () => {
    const content = `---
name: with-refs
description: test
references:
  - api_docs.md
  - examples.md
---

Prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.references).toEqual(["api_docs.md", "examples.md"]);
  });

  it("scripts/references 为空数组时应为 undefined", () => {
    const content = `---
name: empty-arrays
description: test
scripts: []
references: []
---

Prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.scripts).toBeUndefined();
    expect(result.metadata.references).toBeUndefined();
  });

  it("应正确解析完整的 SKILL.cat.md（含 version + scripts + references + config）", () => {
    const content = `---
name: price-compare
description: 多平台比价
version: 2.0.0
scripts:
  - compare.js
references:
  - api_docs.md
config:
  api_key:
    title: API Key
    type: text
    secret: true
---

# Price Compare

比价工具使用说明。`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.name).toBe("price-compare");
    expect(result.metadata.version).toBe("2.0.0");
    expect(result.metadata.scripts).toEqual(["compare.js"]);
    expect(result.metadata.references).toEqual(["api_docs.md"]);
    expect(result.metadata.config).toBeDefined();
    expect(result.metadata.config!.api_key.secret).toBe(true);
    expect(result.prompt).toContain("# Price Compare");
  });

  it("scripts 中过滤非字符串值", () => {
    const content = `---
name: filter-test
description: test
scripts:
  - valid.js
  - 123
  - true
---

Prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.scripts).toEqual(["valid.js"]);
  });

  // ---- config 字段解析测试 ----

  it("应正确解析含 config 的 SKILL.md", () => {
    const content = `---
name: weather-query
description: 查询天气信息
config:
  WEATHER_API_KEY:
    title: "OpenWeatherMap API Key"
    type: text
    secret: true
    required: true
  DEFAULT_CITY:
    title: "默认城市"
    type: text
    default: "Beijing"
---

Use weather API to query.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.name).toBe("weather-query");
    expect(result.metadata.config).toBeDefined();
    const config = result.metadata.config!;
    expect(Object.keys(config)).toHaveLength(2);

    expect(config.WEATHER_API_KEY.title).toBe("OpenWeatherMap API Key");
    expect(config.WEATHER_API_KEY.type).toBe("text");
    expect(config.WEATHER_API_KEY.secret).toBe(true);
    expect(config.WEATHER_API_KEY.required).toBe(true);

    expect(config.DEFAULT_CITY.title).toBe("默认城市");
    expect(config.DEFAULT_CITY.type).toBe("text");
    expect(config.DEFAULT_CITY.default).toBe("Beijing");
  });

  it("config 中 type 缺失时默认为 text", () => {
    const content = `---
name: test
config:
  API_KEY:
    title: "API Key"
---

Prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.config!.API_KEY.type).toBe("text");
  });

  it("应解析 select 类型的 values 字段", () => {
    const content = `---
name: test
config:
  REGION:
    title: "Region"
    type: select
    values:
      - us-east-1
      - eu-west-1
      - ap-northeast-1
    default: us-east-1
---

Prompt.`;

    const result = parseSkillMd(content)!;
    const field = result.metadata.config!.REGION;
    expect(field.type).toBe("select");
    expect(field.values).toEqual(["us-east-1", "eu-west-1", "ap-northeast-1"]);
    expect(field.default).toBe("us-east-1");
  });

  it("应解析 switch 和 number 类型", () => {
    const content = `---
name: test
config:
  ENABLED:
    title: "Enable feature"
    type: switch
    default: true
  MAX_RESULTS:
    title: "Max results"
    type: number
    default: 10
---

Prompt.`;

    const result = parseSkillMd(content)!;
    const config = result.metadata.config!;
    expect(config.ENABLED.type).toBe("switch");
    expect(config.ENABLED.default).toBe(true);
    expect(config.MAX_RESULTS.type).toBe("number");
    expect(config.MAX_RESULTS.default).toBe(10);
  });

  it("无 config 时 metadata.config 应为 undefined", () => {
    const content = `---
name: no-config
description: test
---

Prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.config).toBeUndefined();
  });

  it("空 config 对象时为 undefined", () => {
    const content = `---
name: empty-config
config: {}
---

Prompt.`;

    const result = parseSkillMd(content)!;
    expect(result.metadata.config).toBeUndefined();
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
      "scripts/extract.js": "// tool code\nconsole.log('extract');",
      "scripts/parse.js": "// parse tool",
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
      "my-skill/scripts/helper.js": "// helper",
      "my-skill/references/readme.md": "readme content",
    });

    const result = await parseSkillZip(zipData);
    expect(result.skillMd).toBe(skillMdContent);
    expect(result.scripts).toHaveLength(1);
    expect(result.scripts[0].name).toBe("helper.js");
    expect(result.references).toHaveLength(1);
    expect(result.references[0].name).toBe("readme.md");
  });

  it("应支持 SKILL.cat.md 文件名", async () => {
    const zipData = await createTestZip({
      "SKILL.cat.md": skillMdContent,
      "scripts/tool.js": "// tool",
      "references/doc.md": "doc",
    });

    const result = await parseSkillZip(zipData);
    expect(result.skillMd).toBe(skillMdContent);
    expect(result.scripts).toHaveLength(1);
    expect(result.references).toHaveLength(1);
  });

  it("同时存在 SKILL.cat.md 和 SKILL.md 时优先 SKILL.cat.md", async () => {
    const catContent = `---\nname: cat-version\ndescription: from cat.md\n---\nCat prompt.`;
    const oldContent = `---\nname: old-version\ndescription: from old md\n---\nOld prompt.`;
    const zipData = await createTestZip({
      "SKILL.cat.md": catContent,
      "SKILL.md": oldContent,
    });

    const result = await parseSkillZip(zipData);
    expect(result.skillMd).toBe(catContent);
  });

  it("嵌套目录中的 SKILL.cat.md 也应被识别", async () => {
    const zipData = await createTestZip({
      "my-skill/SKILL.cat.md": skillMdContent,
      "my-skill/scripts/helper.js": "// helper",
    });

    const result = await parseSkillZip(zipData);
    expect(result.skillMd).toBe(skillMdContent);
    expect(result.scripts).toHaveLength(1);
  });

  it("缺少 SKILL.cat.md 和 SKILL.md 时应抛错", async () => {
    const zipData = await createTestZip({
      "scripts/some.js": "// code",
      "references/doc.md": "doc",
    });

    await expect(parseSkillZip(zipData)).rejects.toThrow("SKILL.cat.md");
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
      "scripts/valid.js": "// valid",
      "scripts/readme.md": "not a tool",
      "scripts/config.json": "{}",
    });

    const result = await parseSkillZip(zipData);
    expect(result.scripts).toHaveLength(1);
    expect(result.scripts[0].name).toBe("valid.js");
  });

  it("应忽略子目录中的文件", async () => {
    const zipData = await createTestZip({
      "SKILL.md": skillMdContent,
      "scripts/nested/deep.js": "// nested",
      "references/sub/file.md": "nested ref",
    });

    const result = await parseSkillZip(zipData);
    expect(result.scripts).toEqual([]);
    expect(result.references).toEqual([]);
  });
});

// ---- ZIP → parseSkillMd → installSkill 集成测试 ----

describe("parseSkillZip 端到端集成", () => {
  const VALID_SKILLSCRIPT_CODE = `// ==SkillScript==
// @name taobao_extract
// @description 提取淘宝页面数据
// @param pageType string[search_results,product_detail] 页面类型
// @param tabId number 标签页 ID
// ==/SkillScript==
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
      "scripts/taobao_extract.js": VALID_SKILLSCRIPT_CODE,
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

  it("ZIP 中的 Skill Script 脚本可被 parseSkillScriptMetadata 正确解析", async () => {
    const zipData = await createTestZip({
      "SKILL.md": `---\nname: tool-skill\ndescription: test\n---\nPrompt.`,
      "scripts/taobao_extract.js": VALID_SKILLSCRIPT_CODE,
    });

    const zipResult = await parseSkillZip(zipData);

    // 验证脚本可被 SkillScript 解析器识别
    expect(zipResult.scripts).toHaveLength(1);
    const toolMeta = parseSkillScriptMetadata(zipResult.scripts[0].code);
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
      "scripts/helper.js": VALID_SKILLSCRIPT_CODE,
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

  it("嵌套目录 ZIP 的完整流程：解析 → 验证 SKILL.md → 验证 SkillScript", async () => {
    const zipData = await createTestZip({
      "taobao-skill/SKILL.md": `---\nname: nested-skill\ndescription: 嵌套目录测试\n---\n嵌套 Skill 提示词。`,
      "taobao-skill/scripts/extract.js": VALID_SKILLSCRIPT_CODE,
      "taobao-skill/references/guide.txt": "使用指南内容",
    });

    const zipResult = await parseSkillZip(zipData);

    // Step 1: SKILL.md 正确
    const parsed = parseSkillMd(zipResult.skillMd);
    expect(parsed).not.toBeNull();
    expect(parsed!.metadata.name).toBe("nested-skill");

    // Step 2: SkillScript 正确
    expect(zipResult.scripts).toHaveLength(1);
    const toolMeta = parseSkillScriptMetadata(zipResult.scripts[0].code);
    expect(toolMeta).not.toBeNull();
    expect(toolMeta!.name).toBe("taobao_extract");

    // Step 3: references 正确
    expect(zipResult.references).toHaveLength(1);
    expect(zipResult.references[0].name).toBe("guide.txt");
    expect(zipResult.references[0].content).toBe("使用指南内容");
  });
});

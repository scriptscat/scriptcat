import { describe, expect, it } from "vitest";
import { parseSkillMd } from "./skill";

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

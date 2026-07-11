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

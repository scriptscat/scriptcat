import { describe, expect, it } from "vitest";
import { extractSummary, buildCompactUserPrompt, COMPACT_SYSTEM_PROMPT } from "./compact_prompt";

describe("extractSummary", () => {
  it("extracts content from <summary> tags", () => {
    const response = `<summary>
1. **Task Overview**: Build a feature
2. **Current State**: Used React
</summary>`;
    const result = extractSummary(response);
    expect(result).toBe("1. **Task Overview**: Build a feature\n2. **Current State**: Used React");
  });

  it("returns full content when no <summary> tag found", () => {
    const response = "Just a plain summary without tags";
    expect(extractSummary(response)).toBe("Just a plain summary without tags");
  });

  it("handles empty <summary> tags", () => {
    expect(extractSummary("<summary></summary>")).toBe("");
  });

  it("handles multiline content inside <summary>", () => {
    const response = `<summary>
Line 1
Line 2
Line 3
</summary>`;
    expect(extractSummary(response)).toBe("Line 1\nLine 2\nLine 3");
  });
});

describe("buildCompactUserPrompt", () => {
  it("builds prompt without custom instruction", () => {
    const prompt = buildCompactUserPrompt();
    expect(prompt).toContain("continuation summary");
    expect(prompt).toContain("<summary>");
    expect(prompt).toContain("<analysis>");
    expect(prompt).not.toContain("Additional summarization instructions");
  });

  it("包含所有 8 个摘要段落", () => {
    const prompt = buildCompactUserPrompt();
    expect(prompt).toContain("**Task Overview**");
    expect(prompt).toContain("**Current State**");
    expect(prompt).toContain("**User Messages**");
    expect(prompt).toContain("**Errors and Fixes**");
    expect(prompt).toContain("**Important Discoveries**");
    expect(prompt).toContain("**Current Work**");
    expect(prompt).toContain("**Next Steps**");
    expect(prompt).toContain("**Context to Preserve**");
  });

  it("appends custom instruction when provided", () => {
    const prompt = buildCompactUserPrompt("只保留代码相关内容");
    expect(prompt).toContain("Additional summarization instructions from the user: 只保留代码相关内容");
  });
});

describe("COMPACT_SYSTEM_PROMPT", () => {
  it("is defined and non-empty", () => {
    expect(COMPACT_SYSTEM_PROMPT).toBeTruthy();
    expect(COMPACT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});

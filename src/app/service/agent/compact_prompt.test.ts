import { describe, expect, it } from "vitest";
import { extractSummary, buildCompactUserPrompt, COMPACT_SYSTEM_PROMPT } from "./compact_prompt";

describe("extractSummary", () => {
  it("extracts content from <summary> tags", () => {
    const response = `<analysis>Some analysis here</analysis>

<summary>
1. **Primary Request**: Build a feature
2. **Key Decisions**: Used React
</summary>`;
    const result = extractSummary(response);
    expect(result).toBe("1. **Primary Request**: Build a feature\n2. **Key Decisions**: Used React");
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
    expect(prompt).toContain("Create a detailed summary");
    expect(prompt).toContain("<summary>");
    expect(prompt).not.toContain("Additional summarization instructions");
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

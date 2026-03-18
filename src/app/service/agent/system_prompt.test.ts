import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "./system_prompt";

describe("buildSystemPrompt", () => {
  it("无 userSystem、无 skillSuffix 时只返回内置提示词", () => {
    const result = buildSystemPrompt({});
    expect(result).toContain("You are ScriptCat Agent");
    expect(result).toContain("## Core Principles");
    // 末尾不应有多余的空行
    expect(result.endsWith("\n\n")).toBe(false);
  });

  it("有 userSystem 时拼接在内置提示词之后", () => {
    const result = buildSystemPrompt({ userSystem: "You are a helpful bot." });
    expect(result).toContain("You are ScriptCat Agent");
    expect(result).toContain("You are a helpful bot.");
    // userSystem 应在内置提示词之后
    const builtinEnd = result.indexOf("debugger permission.");
    const userStart = result.indexOf("You are a helpful bot.");
    expect(userStart).toBeGreaterThan(builtinEnd);
  });

  it("有 skillSuffix 时拼接在末尾", () => {
    const result = buildSystemPrompt({
      skillSuffix: "\n# Available Skills\n- browser_automation",
    });
    expect(result).toContain("You are ScriptCat Agent");
    expect(result).toContain("# Available Skills");
  });

  it("都有时按顺序拼接：内置 + userSystem + skillSuffix", () => {
    const result = buildSystemPrompt({
      userSystem: "Custom instructions here.",
      skillSuffix: "\n# Skills\n- test_skill",
    });

    const builtinPos = result.indexOf("You are ScriptCat Agent");
    const userPos = result.indexOf("Custom instructions here.");
    const skillPos = result.indexOf("# Skills");

    expect(builtinPos).toBeLessThan(userPos);
    expect(userPos).toBeLessThan(skillPos);
  });

  it("userSystem 为空字符串时不额外追加", () => {
    const result = buildSystemPrompt({ userSystem: "" });
    // 不应出现连续三个换行（即空段落）
    expect(result).not.toContain("\n\n\n");
  });
});

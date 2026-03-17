import { expect } from "@playwright/test";
import { test, makeTextSSE, makeToolCallSSE } from "./agent-fixtures";
import { runInlineTestScript } from "./utils";

const TARGET_URL = "https://content-security-policy.com/";

const SKILL_MD = `---
name: greeting-skill
description: A skill for greeting people
---
You are a greeting assistant. Use execute_skill_script to run the say_hello script.
`;

const SAY_HELLO_CODE = `
// ==SkillScript==
// @name         say_hello
// @description  Say hello to someone
// @param        name string [required] Person's name
// ==/SkillScript==

return "Hello, " + args.name + "! Welcome!";
`.trim();

test.describe("Agent Skill System", () => {
  test.setTimeout(300_000);

  test("Skill install + load_skill + execute_skill_script invocation", async ({
    context,
    extensionId,
    mockLLMResponse,
  }) => {
    let callCount = 0;
    mockLLMResponse(({ tools: _tools }) => {
      callCount++;
      if (callCount === 1) {
        // First call: LLM decides to load the skill
        return makeToolCallSSE([
          {
            id: "call_load",
            name: "load_skill",
            arguments: JSON.stringify({ skill_name: "greeting-skill" }),
          },
        ]);
      }
      if (callCount === 2) {
        // Second call: after skill loaded, LLM calls execute_skill_script
        return makeToolCallSSE([
          {
            id: "call_greet",
            name: "execute_skill_script",
            arguments: JSON.stringify({ skill: "greeting-skill", script: "say_hello", params: { name: "World" } }),
          },
        ]);
      }
      // Third call: final text response
      return makeTextSSE("工具返回了：Hello, World! Welcome!");
    });

    const escapedSkillMd = JSON.stringify(SKILL_MD);
    const escapedToolCode = JSON.stringify(SAY_HELLO_CODE);

    const code = `// ==UserScript==
// @name         Agent Skill Test
// @namespace    https://e2e.test
// @version      1.0.0
// @description  Test Skill install + load_skill + execute_skill_script
// @author       E2E
// @match        ${TARGET_URL}*
// @grant        CAT.agent.skills
// @grant        CAT.agent.conversation
// ==/UserScript==

(async () => {
  let passed = 0;
  let failed = 0;
  function assert(name, condition) {
    if (condition) { passed++; console.log("PASS: " + name); }
    else { failed++; console.log("FAIL: " + name); }
  }

  try {
    const skillMd = ${escapedSkillMd};
    const toolCode = ${escapedToolCode};

    // Install the skill with its script
    const skillRecord = await CAT.agent.skills.install(
      skillMd,
      [{ name: "say_hello.js", code: toolCode }]
    );
    console.log("Skill installed: " + JSON.stringify(skillRecord));
    assert("skill installed", !!skillRecord);
    assert("skill name correct", skillRecord.name === "greeting-skill");
    assert("skill has tool", skillRecord.toolNames && skillRecord.toolNames.includes("say_hello"));

    // Verify skill appears in list
    const skills = await CAT.agent.skills.list();
    assert("skill in list", skills.some(s => s.name === "greeting-skill"));

    // Create conversation with skills enabled
    const conv = await CAT.agent.conversation.create({
      system: "You are a greeting assistant.",
      skills: ["greeting-skill"],
    });
    assert("conversation created", !!conv && !!conv.id);

    // Chat — mock will trigger load_skill → then execute_skill_script → final text
    const reply = await conv.chat("Please greet World");
    console.log("Reply: " + reply.content);
    assert("reply has content", !!reply.content);
    assert("reply mentions greeting", reply.content.includes("Hello") || reply.content.includes("World"));

    // Clean up
    await CAT.agent.skills.remove("greeting-skill");
    const skillsAfter = await CAT.agent.skills.list();
    assert("skill removed", !skillsAfter.some(s => s.name === "greeting-skill"));
  } catch (e) {
    failed++;
    console.log("ERROR: " + e.message + " " + (e.stack || ""));
  }

  console.log("通过: " + passed + ", 失败: " + failed);
})();
`;

    const { passed, failed, logs } = await runInlineTestScript(context, extensionId, code, TARGET_URL, 90_000);

    console.log(`[skill-integration] passed=${passed}, failed=${failed}`);
    if (failed !== 0) console.log("[skill-integration] logs:", logs.join("\n"));
    expect(failed, "Some skill integration tests failed").toBe(0);
    expect(passed, "No test results found").toBeGreaterThan(0);
  });
});

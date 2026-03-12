import { expect } from "@playwright/test";
import { test, makeTextSSE, makeToolCallSSE, runAgentTestScript } from "./agent-fixtures";

const TARGET_URL = "https://content-security-policy.com/";

const HELLO_TOOL_CODE = `
// ==CATTool==
// @name         hello_world
// @description  向指定的人打招呼
// @param        name string [required] 要打招呼的人名
// ==/CATTool==

return "你好，" + args.name + "！";
`.trim();

test.describe("Agent CATTool API", () => {
  test.setTimeout(300_000);

  test("install, list, call, and remove CATTool", async ({ context, extensionId }) => {
    const escapedToolCode = JSON.stringify(HELLO_TOOL_CODE);

    const code = `// ==UserScript==
// @name         CATTool Management Test
// @namespace    https://e2e.test
// @version      1.0.0
// @description  Test CAT.agent.tools install/list/call/remove
// @author       E2E
// @match        ${TARGET_URL}*
// @grant        CAT.agent.tools
// ==/UserScript==

(async () => {
  let passed = 0;
  let failed = 0;
  function assert(name, condition) {
    if (condition) { passed++; console.log("PASS: " + name); }
    else { failed++; console.log("FAIL: " + name); }
  }

  try {
    const toolCode = ${escapedToolCode};

    // Install
    await CAT.agent.tools.install(toolCode);
    console.log("Tool installed");

    // List
    const tools = await CAT.agent.tools.list();
    assert("tool appears in list", tools.some(t => t.name === "hello_world"));
    assert("tool has description", tools.some(t => t.description === "向指定的人打招呼"));

    // Call directly
    const result = await CAT.agent.tools.call("hello_world", { name: "测试" });
    console.log("Call result: " + JSON.stringify(result));
    assert("call returns greeting", typeof result === "string" && result.includes("你好") && result.includes("测试"));

    // Remove
    await CAT.agent.tools.remove("hello_world");
    const toolsAfter = await CAT.agent.tools.list();
    assert("tool removed from list", !toolsAfter.some(t => t.name === "hello_world"));
  } catch (e) {
    failed++;
    console.log("ERROR: " + e.message + " " + e.stack);
  }

  console.log("通过: " + passed + ", 失败: " + failed);
})();
`;

    const { passed, failed, logs } = await runAgentTestScript(context, extensionId, code, TARGET_URL, 60_000);

    console.log(`[cattool-management] passed=${passed}, failed=${failed}`);
    if (failed !== 0) console.log("[cattool-management] logs:", logs.join("\n"));
    expect(failed, "Some CATTool management tests failed").toBe(0);
    expect(passed, "No test results found").toBeGreaterThan(0);
  });

  test("CATTool + conversation integration", async ({ context, extensionId, mockLLMResponse }) => {
    let callCount = 0;
    mockLLMResponse(() => {
      callCount++;
      if (callCount === 1) {
        // LLM decides to call the installed CATTool
        return makeToolCallSSE([
          {
            id: "call_cat_1",
            name: "hello_world",
            arguments: JSON.stringify({ name: "小明" }),
          },
        ]);
      }
      // After tool result, LLM gives final answer
      return makeTextSSE("工具返回了问候：你好，小明！");
    });

    const escapedToolCode = JSON.stringify(HELLO_TOOL_CODE);

    const code = `// ==UserScript==
// @name         CATTool Conversation Test
// @namespace    https://e2e.test
// @version      1.0.0
// @description  Test CATTool invocation through conversation
// @author       E2E
// @match        ${TARGET_URL}*
// @grant        CAT.agent.tools
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
    const toolCode = ${escapedToolCode};

    // Install CATTool first
    await CAT.agent.tools.install(toolCode);
    console.log("CATTool installed");

    // Create conversation — installed CATTools should be auto-registered
    const conv = await CAT.agent.conversation.create({
      system: "你是助手，使用工具来完成任务。",
    });
    assert("conversation created", !!conv && !!conv.id);

    // Chat — mock will trigger hello_world tool call
    const reply = await conv.chat("请向小明打招呼");
    console.log("Reply: " + reply.content);
    assert("reply has content", !!reply.content);
    assert("reply mentions greeting", reply.content.includes("你好") || reply.content.includes("小明"));

    // Clean up
    await CAT.agent.tools.remove("hello_world");
  } catch (e) {
    failed++;
    console.log("ERROR: " + e.message + " " + e.stack);
  }

  console.log("通过: " + passed + ", 失败: " + failed);
})();
`;

    const { passed, failed, logs } = await runAgentTestScript(context, extensionId, code, TARGET_URL, 60_000);

    console.log(`[cattool-conversation] passed=${passed}, failed=${failed}`);
    if (failed !== 0) console.log("[cattool-conversation] logs:", logs.join("\n"));
    expect(failed, "Some CATTool conversation tests failed").toBe(0);
    expect(passed, "No test results found").toBeGreaterThan(0);
  });
});

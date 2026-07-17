import { expect } from "@playwright/test";
import { test, makeTextSSE, makeToolCallSSE } from "./agent-fixtures";
import { runInlineTestScript } from "./utils";

const TARGET_URL = "https://content-security-policy.com/";

test.describe("Agent Conversation API", () => {
  test.setTimeout(300_000);

  test("basic chat — send message and receive text reply", async ({ context, extensionId, mockLLMResponse }) => {
    mockLLMResponse(() => makeTextSSE("1+1等于2。"));

    const code = `// ==UserScript==
// @name         Agent Basic Chat Test
// @namespace    https://e2e.test
// @version      1.0.0
// @description  Test basic CAT.agent.conversation.chat()
// @author       E2E
// @match        ${TARGET_URL}*
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
    const conv = await CAT.agent.conversation.create({
      system: "你是一个助手。",
    });
    assert("conversation created", !!conv && !!conv.id);

    const reply = await conv.chat("1+1等于几？");
    assert("reply has content", !!reply.content);
    assert("reply content correct", reply.content.includes("2"));
    assert("reply has usage", !!reply.usage);
  } catch (e) {
    failed++;
    console.log("ERROR: " + e.message);
  }

  console.log("通过: " + passed + ", 失败: " + failed);
})();
`;

    const { passed, failed, logs } = await runInlineTestScript(context, extensionId, code, TARGET_URL, 60_000);

    console.log(`[agent-basic-chat] passed=${passed}, failed=${failed}`);
    if (failed !== 0) console.log("[agent-basic-chat] logs:", logs.join("\n"));
    expect(failed, "Some basic chat tests failed").toBe(0);
    expect(passed, "No test results found").toBeGreaterThan(0);
  });

  test("tool calling — script-defined tools are invoked", async ({ context, extensionId, mockLLMResponse }) => {
    let callCount = 0;
    mockLLMResponse(() => {
      callCount++;
      // First call: LLM decides to call the tool
      if (callCount === 1) {
        return makeToolCallSSE([
          {
            id: "call_1",
            name: "get_weather",
            arguments: JSON.stringify({ city: "北京" }),
          },
        ]);
      }
      // Second call: after tool result, LLM gives final answer
      return makeTextSSE("北京今天22度，多云。");
    });

    const code = `// ==UserScript==
// @name         Agent Tool Calling Test
// @namespace    https://e2e.test
// @version      1.0.0
// @description  Test tool calling via CAT.agent.conversation
// @author       E2E
// @match        ${TARGET_URL}*
// @grant        CAT.agent.conversation
// ==/UserScript==

(async () => {
  let passed = 0;
  let failed = 0;
  let toolCalled = false;
  let toolArgs = null;

  function assert(name, condition) {
    if (condition) { passed++; console.log("PASS: " + name); }
    else { failed++; console.log("FAIL: " + name); }
  }

  try {
    const conv = await CAT.agent.conversation.create({
      system: "你是天气助手。",
      tools: [
        {
          name: "get_weather",
          description: "获取天气",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "城市" },
            },
            required: ["city"],
          },
          handler: async (args) => {
            toolCalled = true;
            toolArgs = args;
            return { city: args.city, temperature: 22, condition: "多云" };
          },
        },
      ],
    });

    const reply = await conv.chat("北京天气怎么样？");
    assert("tool was called", toolCalled);
    assert("tool received city arg", toolArgs && toolArgs.city === "北京");
    assert("final reply has content", !!reply.content);
    assert("final reply mentions weather", reply.content.includes("22") || reply.content.includes("多云"));
  } catch (e) {
    failed++;
    console.log("ERROR: " + e.message);
  }

  console.log("通过: " + passed + ", 失败: " + failed);
})();
`;

    const { passed, failed, logs } = await runInlineTestScript(context, extensionId, code, TARGET_URL, 60_000);

    console.log(`[agent-tool-calling] passed=${passed}, failed=${failed}`);
    if (failed !== 0) console.log("[agent-tool-calling] logs:", logs.join("\n"));
    expect(failed, "Some tool calling tests failed").toBe(0);
    expect(passed, "No test results found").toBeGreaterThan(0);
  });

  test("multi-turn conversation — context is preserved", async ({ context, extensionId, mockLLMResponse }) => {
    let requestCount = 0;
    let lastMessages: any[] = [];

    mockLLMResponse(({ messages }) => {
      requestCount++;
      lastMessages = messages;
      if (requestCount === 1) {
        return makeTextSSE("斐波那契数列是一个数列，每个数是前两个数之和。");
      }
      return makeTextSSE("前5个数是：1, 1, 2, 3, 5。");
    });

    const code = `// ==UserScript==
// @name         Agent Multi-turn Test
// @namespace    https://e2e.test
// @version      1.0.0
// @description  Test multi-turn conversation context preservation
// @author       E2E
// @match        ${TARGET_URL}*
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
    const conv = await CAT.agent.conversation.create({
      system: "你是数学老师。",
    });

    const reply1 = await conv.chat("什么是斐波那契数列？");
    assert("first reply has content", !!reply1.content);

    const reply2 = await conv.chat("前5个数是什么？");
    assert("second reply has content", !!reply2.content);
    assert("second reply has fibonacci numbers", reply2.content.includes("1") && reply2.content.includes("5"));
  } catch (e) {
    failed++;
    console.log("ERROR: " + e.message);
  }

  console.log("通过: " + passed + ", 失败: " + failed);
})();
`;

    const { passed, failed, logs } = await runInlineTestScript(context, extensionId, code, TARGET_URL, 60_000);

    console.log(`[agent-multi-turn] passed=${passed}, failed=${failed}`);
    if (failed !== 0) console.log("[agent-multi-turn] logs:", logs.join("\n"));
    expect(failed, "Some multi-turn tests failed").toBe(0);
    expect(passed, "No test results found").toBeGreaterThan(0);
    // Verify the mock received multiple requests (context was sent)
    expect(requestCount, "Should have made 2 LLM requests").toBe(2);
    // The second request should contain history messages
    expect(lastMessages.length, "Second request should include conversation history").toBeGreaterThan(2);
  });
});

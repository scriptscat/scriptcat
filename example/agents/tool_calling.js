// ==UserScript==
// @name         Agent Tool Calling
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  Tool Calling 示例：让 LLM 调用自定义工具获取外部数据，实现天气查询、网页搜索等功能
// @author       ScriptCat
// @background
// @grant        CAT.agent.conversation
// @grant        GM_log
// @grant        GM_xmlhttpRequest
// ==/UserScript==

// 示例 1: 单工具 - 天气查询（在 create 时注册工具）
async function weatherAssistant() {
  const conv = await CAT.agent.conversation.create({
    system: "你是一个天气助手，当用户询问天气时使用 get_weather 工具获取信息。",
    tools: [
      {
        name: "get_weather",
        description: "获取指定城市的当前天气信息",
        parameters: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "城市名称，如'北京'、'上海'",
            },
          },
          required: ["city"],
        },
        // LLM 决定调用此工具时，handler 会被自动执行
        handler: async (args) => {
          GM_log("get_weather 被调用, 参数: " + JSON.stringify(args));
          // 这里可以调用真实的天气 API（用 GM_xmlhttpRequest）
          // 这里返回模拟数据
          return {
            city: args.city,
            temperature: 22,
            condition: "多云",
            humidity: 45,
          };
        },
      },
    ],
  });

  // 工具已在 create 时注册，chat 时无需再传
  const reply = await conv.chat("北京今天天气怎么样？");

  // LLM 会根据工具返回的结果生成自然语言回复
  GM_log("最终回复: " + reply.content);

  // 可以查看 tool 调用记录
  if (reply.toolCalls) {
    for (const tc of reply.toolCalls) {
      GM_log(`工具调用: ${tc.name}(${tc.arguments}) => ${tc.result}`);
    }
  }
}

// 示例 2: 多工具协作 - 计算器助手（在 create 时注册工具）
async function calculatorAssistant() {
  const conv = await CAT.agent.conversation.create({
    system: "你是一个计算助手。使用提供的工具来完成数学运算，不要自己心算。",
    maxIterations: 10, // 最大工具调用循环次数
    tools: [
      {
        name: "add",
        description: "计算两个数的和",
        parameters: {
          type: "object",
          properties: {
            a: { type: "number", description: "第一个数" },
            b: { type: "number", description: "第二个数" },
          },
          required: ["a", "b"],
        },
        handler: async (args) => {
          const result = args.a + args.b;
          GM_log(`add(${args.a}, ${args.b}) = ${result}`);
          return result;
        },
      },
      {
        name: "multiply",
        description: "计算两个数的乘积",
        parameters: {
          type: "object",
          properties: {
            a: { type: "number", description: "第一个数" },
            b: { type: "number", description: "第二个数" },
          },
          required: ["a", "b"],
        },
        handler: async (args) => {
          const result = args.a * args.b;
          GM_log(`multiply(${args.a}, ${args.b}) = ${result}`);
          return result;
        },
      },
    ],
  });

  // 工具已在 create 时注册，多次 chat 都能使用
  const reply = await conv.chat("计算 (3 + 5) * 7 的结果");
  GM_log("计算结果回复: " + reply.content);
}

// 示例 3: 流式 + Tool Calling
async function streamWithTools() {
  const conv = await CAT.agent.conversation.create({
    system: "你是一个翻译助手，使用 translate 工具来翻译文本。",
  });

  const stream = await conv.chatStream("把'你好世界'翻译成英语、法语和日语", {
    tools: [
      {
        name: "translate",
        description: "将文本翻译为目标语言",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "要翻译的文本" },
            targetLang: { type: "string", description: "目标语言，如 'English', 'French'" },
          },
          required: ["text", "targetLang"],
        },
        handler: async (args) => {
          GM_log(`translate("${args.text}" -> ${args.targetLang})`);
          // 模拟翻译结果
          const translations = {
            English: "Hello World",
            French: "Bonjour le monde",
            Japanese: "こんにちは世界",
          };
          return translations[args.targetLang] || `[翻译: ${args.text} -> ${args.targetLang}]`;
        },
      },
    ],
  });

  let content = "";
  for await (const chunk of stream) {
    if (chunk.type === "content_delta") {
      content += chunk.content;
    } else if (chunk.type === "tool_call") {
      GM_log("[工具调用] " + chunk.toolCall.name);
    } else if (chunk.type === "done") {
      GM_log("翻译完成: " + content);
    }
  }
}

return weatherAssistant();
// return calculatorAssistant();
// return streamWithTools();

# CAT.agent.conversation 示例

通过 `@grant CAT.agent.conversation` 在用户脚本中与 LLM 进行对话交互。

## 前置要求

1. 安装 ScriptCat 浏览器扩展
2. 在 ScriptCat 设置中配置 AI 模型的 API Key（支持 OpenAI 兼容格式和 Anthropic）
3. 脚本中声明 `@grant CAT.agent.conversation`

## 示例说明

| 文件                    | 说明                                     | 关键 API                            |
| ----------------------- | ---------------------------------------- | ----------------------------------- |
| `basic_chat.js`         | 创建对话、发送消息、查看 Token 用量      | `create()`, `chat()`                |
| `multi_turn.js`         | 多轮对话自动携带上下文；通过固定 ID 恢复 | `chat()`, `get()`, `getMessages()`  |
| `streaming.js`          | 流式接收生成内容，支持思考过程和工具调用 | `chatStream()`, `for await...of`    |
| `tool_calling.js`       | 注册自定义工具，LLM 自动调用并返回结果   | `tools` 参数, `handler`             |
| `webpage_summarizer.js` | 实用案例：提取页面内容 + Agent 总结      | 页面脚本 + `GM_registerMenuCommand` |

## 快速开始

```javascript
// ==UserScript==
// @grant CAT.agent.conversation
// ==/UserScript==

const conv = await CAT.agent.conversation.create({
  system: "你是一个助手",
});
const reply = await conv.chat("你好");
console.log(reply.content);
```

## API 概览

### 创建和获取对话

- **`CAT.agent.conversation.create(options)`** — 创建新对话
  - `system`: 系统提示词
  - `model`: 模型 ID（可选）
  - `tools`: 工具定义数组（可选）
  - `maxIterations`: 工具调用最大循环次数（可选）
- **`CAT.agent.conversation.get(id)`** — 获取已有对话

### 对话实例方法

- **`conv.chat(message, options?)`** — 发送消息，等待完整回复
- **`conv.chatStream(message, options?)`** — 流式发送消息，返回 AsyncIterable
- **`conv.getMessages()`** — 获取对话历史

### 流式事件类型

| 事件类型         | 说明                         |
| ---------------- | ---------------------------- |
| `content_delta`  | 文本片段，拼接为完整回复     |
| `thinking_delta` | 模型思考过程（部分模型支持） |
| `tool_call`      | 工具调用通知                 |
| `done`           | 流式完成，包含 usage 信息    |
| `error`          | 错误信息                     |

## Tool Calling

支持在 `create()` 或 `chatStream()` 时传入工具定义，LLM 会自动决定何时调用工具：

```javascript
const conv = await CAT.agent.conversation.create({
  tools: [
    {
      name: "get_weather",
      description: "获取城市天气",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名" },
        },
        required: ["city"],
      },
      handler: async (args) => {
        return { city: args.city, temperature: 22 };
      },
    },
  ],
});

const reply = await conv.chat("北京天气怎么样？");
// LLM 自动调用 get_weather，再根据返回结果生成回复
```

详细用法参见 `tool_calling.js`。

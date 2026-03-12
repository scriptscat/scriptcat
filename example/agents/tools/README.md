# CATTool 示例

CATTool 是 ScriptCat Agent 的工具扩展机制。安装后，CATTool 会自动注册为 Agent 内置工具，LLM 在对话中可以自动调用。

## 文件说明

| 文件                | 说明                                                               |
| ------------------- | ------------------------------------------------------------------ |
| `hello_world.js`    | 最简示例 — 无 grant，单参数                                        |
| `text_processor.js` | 纯计算工具 — 多参数、enum 类型、switch 分支                        |
| `json_formatter.js` | JSON 处理 — 路径查询、错误处理                                     |
| `weather_query.js`  | 网络请求 — 使用 `GM_xmlhttpRequest` 调用外部 API                   |
| `use_cattool.js`    | 调用方脚本 — 演示如何通过 `CAT.agent.tools` API 安装和使用 CATTool |

## CATTool 元数据格式

```javascript
// ==CATTool==
// @name         tool_name          （必填）工具名称，LLM 通过此名称调用
// @description  工具描述            （推荐）告诉 LLM 这个工具做什么
// @param        paramName type [required] 参数描述
// @grant        GM_xmlhttpRequest   需要的 GM API 权限
// ==/CATTool==
```

### @param 语法

```
@param  参数名  类型  [required]  描述
```

- **类型**: `string` / `number` / `boolean`
- **enum**: `string[val1,val2,val3]` — 限定可选值
- **[required]**: 标记为必填参数（可选）

### 运行时变量

- `args` — 包含 LLM 传入的所有参数，按 `@param` 定义的类型自动转换
- 通过 `return` 返回结果（对象会被 JSON 序列化后返回给 LLM）

## 安装方式

### 方式 1: 通过安装页面

直接在浏览器中打开 `.js` 文件的 URL（本地或远程），ScriptCat 会识别 `==CATTool==` 头并显示安装界面。

### 方式 2: 通过脚本 API

在 UserScript 中使用 `CAT.agent.tools` API：

```javascript
// @grant CAT.agent.tools
const code = `...CATTool 代码...`;
await CAT.agent.tools.install(code);
```

参考 `use_cattool.js` 获取完整示例。

## 测试方法

1. **安装 CATTool**: 通过安装页面或 `CAT.agent.tools.install()` 安装
2. **在 Agent 聊天中测试**: 打开 ScriptCat 设置页的 Agent Chat，直接对话即可触发工具调用
   - 例如安装 `hello_world` 后，对 Agent 说"向张三打招呼"
   - 例如安装 `weather_query` 后，对 Agent 说"北京今天天气怎么样"
3. **通过脚本调用**: 使用 `CAT.agent.tools.call(name, params)` 直接调用，参考 `use_cattool.js`
4. **查看已安装工具**: `CAT.agent.tools.list()` 返回所有已安装的 CATTool

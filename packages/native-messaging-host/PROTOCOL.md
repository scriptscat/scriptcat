# ScriptCat Native Messaging 协议文档

## 1. 通信架构概览

ScriptCat 的 Native Messaging 系统采用三层通信架构：

```
AI 客户端 ←─ HTTP/SSE ──→ MCP Server (:3333) ←─ EventEmitter ──→ NativeHost ←─ stdio ──→ 浏览器扩展
```

| 层级 | 组件 | 传输方式 | 说明 |
|------|------|----------|------|
| 外部接口 | MCP Server | HTTP + SSE（端口 3333） | 对 AI 客户端暴露 JSON-RPC 2.0 接口 |
| 内部总线 | EventEmitter | 进程内事件 | MCP Server 与 NativeHost 之间的进程内通信 |
| 浏览器通道 | NativeHost ↔ 浏览器扩展 | stdio（4 字节 LE 长度前缀 + JSON） | Chrome Native Messaging 标准协议 |

**数据流向：**

1. AI 客户端通过 HTTP POST 发送 JSON-RPC 请求到 MCP Server
2. MCP Server 将请求转换为 `NativeRequest`，通过 EventEmitter 传递给 NativeHost
3. NativeHost 通过 stdio 将 `NativeRequest` 发送给浏览器扩展
4. 浏览器扩展的 `NativeMessageHandler` 处理请求，调用 `ScriptService` 执行操作
5. 浏览器扩展通过 stdio 返回 `NativeResponse`
6. NativeHost 接收响应，通过 EventEmitter 传回 MCP Server
7. MCP Server 将结果格式化为 JSON-RPC 响应返回给 AI 客户端

---

## 2. Stdio JSON 协议格式

NativeHost 与浏览器扩展之间使用 Chrome Native Messaging 标准的 stdio 协议：

### 编码规则

每条消息由 **4 字节小端序（Little-Endian）无符号整数长度前缀** + **UTF-8 编码的 JSON 正文**组成。

```
┌──────────────────┬──────────────────────────────┐
│  长度前缀 (4字节)  │       JSON 正文 (N 字节)       │
│  UInt32LE        │       UTF-8 encoded           │
└──────────────────┴──────────────────────────────┘
```

### 发送消息（NativeHost → 浏览器）

```typescript
const json = JSON.stringify(request);
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32LE(Buffer.byteLength(json, "utf-8"), 0);
fs.writeSync(1, lenBuf);   // 写入 4 字节长度
fs.writeSync(1, json);      // 写入 JSON 正文
```

### 接收消息（浏览器 → NativeHost）

```typescript
// 1. 读取 4 字节长度前缀
const bytesRead = fs.readSync(0, BUF, 0, 4, null);
const msgLen = BUF.readUInt32LE(0);

// 2. 读取 msgLen 字节的 JSON 正文
const data = Buffer.alloc(msgLen);
// ... 循环读取直到 offset === msgLen

// 3. 解析 JSON
const msg = JSON.parse(data.toString("utf-8"));
```

### 限制

| 项目 | 值 |
|------|----|
| 最大消息大小 | 1 MB（1,048,576 字节） |
| 响应超时时间 | 30,000 毫秒（30 秒） |

超过 1 MB 的消息将被丢弃并输出错误日志。

---

## 3. 通用消息结构

### 请求（NativeRequest）

```typescript
interface NativeRequest {
  id: string;                        // 请求唯一标识符，格式: "m_{timestamp}_{counter}"
  type: NativeMessageType;           // 消息类型
  data: Record<string, unknown>;     // 请求参数
}
```

### 响应（NativeResponse）

```typescript
interface NativeResponse {
  id: string;          // 对应请求的 id
  ok: boolean;         // 是否成功
  data?: unknown;      // 成功时的返回数据
  error?: string;      // 失败时的错误信息
}
```

### 消息类型（NativeMessageType）

```typescript
type NativeMessageType =
  | "list_scripts"
  | "get_script"
  | "install_script"
  | "uninstall_script"
  | "enable_script"
  | "disable_script";
```

---

## 4. 消息类型详细说明

### 4.1 list_scripts

列出所有已安装的用户脚本。

**请求**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 请求 ID |
| type | string | 是 | 固定值 `"list_scripts"` |
| data | object | 是 | 空对象 `{}` |

**请求示例**

```json
{
  "id": "m_1716441600000_1",
  "type": "list_scripts",
  "data": {}
}
```

**响应**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 请求 ID |
| ok | boolean | 固定 `true` |
| data | ScriptSummary[] | 脚本摘要列表 |

**响应示例**

```json
{
  "id": "m_1716441600000_1",
  "ok": true,
  "data": [
    {
      "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "示例脚本",
      "namespace": "https://example.com",
      "version": "1.0.0",
      "author": "developer",
      "type": "normal",
      "status": "enabled",
      "enabled": true,
      "updateUrl": "https://example.com/script.user.js",
      "description": "这是一个示例脚本"
    }
  ]
}
```

---

### 4.2 get_script

获取指定脚本的详细信息及源代码。

**请求**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 请求 ID |
| type | string | 是 | 固定值 `"get_script"` |
| data.uuid | string | 是 | 脚本的 UUID |

**请求示例**

```json
{
  "id": "m_1716441600000_2",
  "type": "get_script",
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**响应**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 请求 ID |
| ok | boolean | 是否成功 |
| data | object | 脚本完整信息，包含 `code`（源代码）等字段 |
| error | string | 失败时的错误信息 |

**响应示例**

```json
{
  "id": "m_1716441600000_2",
  "ok": true,
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "示例脚本",
    "namespace": "https://example.com",
    "code": "// ==UserScript==\n// @name         示例脚本\n// ==/UserScript==\nconsole.log('hello');",
    "metadata": {
      "name": ["示例脚本"],
      "version": ["1.0.0"]
    }
  }
}
```

**错误示例**

```json
{
  "id": "m_1716441600000_2",
  "ok": false,
  "error": "Script not found"
}
```

---

### 4.3 install_script

安装用户脚本，支持通过 URL 或代码安装。

**请求**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 请求 ID |
| type | string | 是 | 固定值 `"install_script"` |
| data.url | string | 否* | 脚本的 URL 地址 |
| data.code | string | 否* | 脚本的 JavaScript 代码 |
| data.existing_uuid | string | 否 | 已有脚本的 UUID，用于代码安装时的更新标识 |

> *`url` 和 `code` 必须提供其中之一，否则将返回错误。

**通过 URL 安装 — 请求示例**

```json
{
  "id": "m_1716441600000_3",
  "type": "install_script",
  "data": {
    "url": "https://example.com/script.user.js"
  }
}
```

**通过代码安装 — 请求示例**

```json
{
  "id": "m_1716441600000_4",
  "type": "install_script",
  "data": {
    "code": "// ==UserScript==\n// @name         新脚本\n// ==/UserScript==\nconsole.log('hello');"
  }
}
```

**响应**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 请求 ID |
| ok | boolean | 是否成功 |
| data.uuid | string | 安装后脚本的 UUID |
| data.name | string | 安装后脚本的名称 |
| data.update | boolean | 是否为更新操作（当前固定 `false`） |
| error | string | 失败时的错误信息 |

**响应示例**

```json
{
  "id": "m_1716441600000_3",
  "ok": true,
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "示例脚本",
    "update": false
  }
}
```

**错误示例**

```json
{
  "id": "m_1716441600000_3",
  "ok": false,
  "error": "Either 'url' or 'code' is required"
}
```

---

### 4.4 uninstall_script

卸载指定的用户脚本。

**请求**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 请求 ID |
| type | string | 是 | 固定值 `"uninstall_script"` |
| data.uuid | string | 是 | 要卸载脚本的 UUID |

**请求示例**

```json
{
  "id": "m_1716441600000_5",
  "type": "uninstall_script",
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**响应**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 请求 ID |
| ok | boolean | 是否成功 |
| data.uuid | string | 被卸载脚本的 UUID |
| data.removed | boolean | 固定 `true`，表示已移除 |
| error | string | 失败时的错误信息 |

**响应示例**

```json
{
  "id": "m_1716441600000_5",
  "ok": true,
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "removed": true
  }
}
```

**错误示例**

```json
{
  "id": "m_1716441600000_5",
  "ok": false,
  "error": "'uuid' is required"
}
```

---

### 4.5 enable_script

启用指定的用户脚本。

**请求**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 请求 ID |
| type | string | 是 | 固定值 `"enable_script"` |
| data.uuid | string | 是 | 要启用脚本的 UUID |

**请求示例**

```json
{
  "id": "m_1716441600000_6",
  "type": "enable_script",
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**响应**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 请求 ID |
| ok | boolean | 是否成功 |
| data.uuid | string | 脚本的 UUID |
| data.enabled | boolean | 固定 `true`，表示已启用 |
| error | string | 失败时的错误信息 |

**响应示例**

```json
{
  "id": "m_1716441600000_6",
  "ok": true,
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "enabled": true
  }
}
```

---

### 4.6 disable_script

禁用指定的用户脚本。

**请求**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 请求 ID |
| type | string | 是 | 固定值 `"disable_script"` |
| data.uuid | string | 是 | 要禁用脚本的 UUID |

**请求示例**

```json
{
  "id": "m_1716441600000_7",
  "type": "disable_script",
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**响应**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 请求 ID |
| ok | boolean | 是否成功 |
| data.uuid | string | 脚本的 UUID |
| data.enabled | boolean | 固定 `false`，表示已禁用 |
| error | string | 失败时的错误信息 |

**响应示例**

```json
{
  "id": "m_1716441600000_7",
  "ok": true,
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "enabled": false
  }
}
```

---

## 5. ScriptSummary 数据结构

`list_scripts` 返回的每个脚本摘要包含以下字段：

```typescript
interface ScriptSummary {
  uuid: string;          // 脚本唯一标识符
  name: string;          // 脚本名称
  namespace: string;     // 脚本命名空间
  version?: string;      // 脚本版本（来自 metadata.version[0]）
  author?: string;       // 脚本作者（来自 metadata.author[0]）
  type: string;          // 脚本类型
  status: string;        // 脚本状态
  enabled: boolean;      // 是否启用（status === 1 时为 true）
  updateUrl?: string;    // 脚本更新地址（checkUpdateUrl）
  description?: string;  // 脚本描述（来自 metadata.description[0]）
}
```

### type 字段取值

| 内部数值 | 字符串值 | 说明 |
|----------|----------|------|
| 1 | `"normal"` | 普通网页脚本 |
| 2 | `"crontab"` | 定时脚本 |
| 3 | `"background"` | 后台脚本 |
| 其他 | `"unknown"` | 未知类型 |

### status 字段取值

| 内部数值 | 字符串值 | 说明 |
|----------|----------|------|
| 1 | `"enabled"` | 已启用 |
| 2 | `"disabled"` | 已禁用 |
| 其他 | `"unknown"` | 未知状态 |

---

## 6. 常见错误码与错误信息

Native Messaging 协议本身不使用数字错误码，而是通过 `ok: false` + `error` 字符串来传递错误。以下是常见的错误信息：

| 错误信息 | 触发场景 | 相关消息类型 |
|----------|----------|-------------|
| `"Either 'url' or 'code' is required"` | 安装脚本时未提供 url 和 code | install_script |
| `"'uuid' is required"` | 操作需要 uuid 但未提供 | uninstall_script, enable_script, disable_script |
| `"Unknown message type: {type}"` | 请求的 type 不在已知类型中 | 任意 |
| `"Timeout waiting for browser response"` | 浏览器在 30 秒内未响应 | 任意（NativeHost 侧） |
| `"Script not found"` | 指定 UUID 的脚本不存在 | get_script, uninstall_script, enable_script, disable_script |

### MCP 层 JSON-RPC 错误码

MCP Server 在 HTTP 接口层使用标准 JSON-RPC 2.0 错误码：

| 错误码 | 说明 |
|--------|------|
| -32603 | 内部错误（服务端异常） |

---

## 7. 连接生命周期

### 7.1 建立连接

1. **NativeHost 启动**：Node.js 进程启动，监听 stdin，等待浏览器连接
2. **浏览器连接**：浏览器扩展通过 `chrome.runtime.connectNative()` 发起连接
3. **连接建立**：`NativeMessageHandler` 监听 `chrome.runtime.onConnectNative` 事件，获取 `Port` 对象
4. **MCP Server 就绪**：HTTP 服务器在 `127.0.0.1:3333` 上开始监听

### 7.2 消息交换

```
NativeHost                                    浏览器扩展
    │                                              │
    │──── NativeRequest (4字节长度 + JSON) ────────→│
    │                                              │ 处理请求
    │←─── NativeResponse (4字节长度 + JSON) ───────│
    │                                              │
    │──── NativeRequest ──────────────────────────→│
    │                                              │ 处理请求
    │←─── NativeResponse ─────────────────────────│
    │                                              │
```

**关键特性：**

- 请求-响应模式：每个请求通过 `id` 字段与响应对应
- NativeHost 使用 `resp_{id}` 事件名匹配响应
- 响应超时时间为 30 秒，超时后 Promise 被 reject
- 消息大小上限为 1 MB

### 7.3 断开连接

1. **浏览器断开**：浏览器关闭或扩展被禁用时，`Port.onDisconnect` 事件触发
2. **NativeHost 检测**：stdin 读取返回 0 字节时，NativeHost 退出进程
3. **清理资源**：`NativeMessageHandler` 将 `port` 置为 `null`，MCP Server 的后续请求将超时

### 7.4 MCP 客户端连接（HTTP + SSE）

1. **SSE 连接**：客户端 GET `/sse` 建立事件流连接
2. **获取端点**：服务端推送 `endpoint` 事件，包含消息提交 URI
3. **发送请求**：客户端 POST `/message` 发送 JSON-RPC 2.0 请求
4. **接收响应**：服务端返回 JSON-RPC 2.0 响应
5. **断开**：客户端关闭 SSE 连接，服务端从 `connectedClients` 中移除

### 7.5 MCP 初始化流程

```
客户端                                        MCP Server
  │                                              │
  │──── POST /message ──────────────────────────→│
  │     { "method": "initialize", ... }          │
  │←─── Response ───────────────────────────────│
  │     { protocolVersion, capabilities, ... }   │
  │                                              │
  │──── POST /message ──────────────────────────→│
  │     { "method": "notifications/initialized"} │
  │←─── 202 Accepted ──────────────────────────│
  │                                              │
  │──── POST /message ──────────────────────────→│
  │     { "method": "tools/list" }               │
  │←─── Response { tools: [...] } ──────────────│
  │                                              │
  │──── POST /message ──────────────────────────→│
  │     { "method": "tools/call", params: {...} }│
  │←─── Response { content: [...] } ────────────│
```

**MCP Server 信息：**

| 项目 | 值 |
|------|----|
| 协议版本 | `2024-11-05` |
| 服务器名称 | `scriptcat` |
| 服务器版本 | `1.0.0` |
| 默认端口 | 3333（可通过 `SCRIPTCAT_MCP_PORT` 环境变量配置） |
| 监听地址 | `127.0.0.1` |

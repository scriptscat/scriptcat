<p align="right">
<a href="./mcp-bridge-guide_zh-CN.md">中文</a> <a href="./mcp-bridge-guide.md">English</a>
</p>

# 使用 ScriptCat MCP 桥接

一份任务导向的实操指南：帮助你把 AI 代理（Claude Desktop、Claude Code，或任何其他
[Model Context Protocol](https://modelcontextprotocol.io/) 客户端）接入你的 ScriptCat 用户脚本，并附上你实际会遇到的各类流程示例。

这是一个**仅存在于 developer 构建**的功能——Chrome 应用商店构建中不包含它。关于*为什么*要这样设计
（威胁模型、scope 设计、TOCTOU 保证），请看
[`packages/native-messaging-host/THREAT-MODEL.md`](../packages/native-messaging-host/THREAT-MODEL.md)
与 [`packages/native-messaging-host/PROTOCOL.md`](../packages/native-messaging-host/PROTOCOL.md)。
本指南是这两份文档的"实际怎么用"配套篇。

## 你能获得什么

连接成功后，AI 代理可以：

- 列出你已安装的用户脚本并读取其元数据（匹配规则、grant、启用状态）——只读操作，一旦你已授予对应
  scope，无需再次批准。
- 读取某个脚本的完整源码——每个客户端对每个脚本的首次读取都需要一次性（或永久，由你选择）批准，
  因为源码中可能包含密钥等敏感信息。
- **请求**安装新脚本、启用/禁用某个脚本，或删除某个脚本——以上每一项都只是一次*请求*。在你审查并点击
  ScriptCat 弹出窗口中的"批准"之前，不会有任何变更发生。新安装的脚本默认处于禁用状态，即使你批准了
  安装请求，除非你在同一个批准界面上主动打开启用开关。

不存在任何从 MCP 请求直接跳过你的批准而修改脚本的代码路径。如果代理请求了具有破坏性的操作，你会在它
发生之前先看到它。

## 1. 前置条件

- PATH 中可用的 Node.js ≥ 20。
- 扩展的**developer 构建**（MCP 桥接在应用商店构建中被完全编译移除——见
  [`docs/develop.md`](./develop.md#build-profiles--mcp-gate)）。
- 如果你想*自己构建并运行安装器*，目前需要 macOS 或 Linux——Windows 安装器（`install.ps1`）已经存在
  且经过代码审查，但尚未在本仓库的 CI 中做过端到端验证（编写时没有可用的 Windows/PowerShell 环境）。
  预期它是可用的，但请把它当作比 POSIX 路径测试覆盖更少的选项对待。

## 2. 构建并加载启用 MCP 的扩展

```bash
pnpm install
SC_ENABLE_MCP=true pnpm run dev
```

将 `dist/ext` 作为已解压的扩展加载（`chrome://extensions` → 开发者模式 → "加载已解压的扩展程序"）。
记下该页面显示的扩展 ID——第 4 步会用到它（形如 `abcdefghijklmnopabcdefghijklmnop`，32 个 a–p 范围内的
小写字母）。

## 3. 构建本机主机

本机主机是一个独立的包，不会被打包进扩展本身：

```bash
cd packages/native-messaging-host
pnpm install
pnpm build
```

这会生成 `dist/host.js`（Chrome 启动的 native messaging 主机）与 `dist/shim.js`（AI 客户端启动的
面向 MCP 的 stdio 服务器），安装后还会附带两个 CLI 入口：`scriptcat-native-host` 与 `scriptcat-mcp`。

## 4. 向 Chrome 注册本机主机

```bash
./installers/install.sh --extension-id <你的扩展-ID>
```

请在 `packages/native-messaging-host` 目录内运行此命令。如果你想为 Chrome 以外的浏览器注册，追加
`--browser edge`、`--browser chromium` 或 `--browser brave`（可重复指定）。此命令会写入 Chrome 所需的
native messaging 清单，把确切的 `node` 可执行文件路径固定进一个自动生成的启动脚本（这样任何人都无法
通过篡改 `PATH` 来劫持它），并写入主机自身的配置目录（macOS 上默认为
`~/Library/Application Support/ScriptCat/NativeHost`，Linux 上默认为
`~/.local/share/scriptcat/native-host`，若设置了 `$XDG_DATA_HOME` 则使用该路径）。

验证是否安装成功：

```bash
node dist/host.js --doctor
```

你应该会看到四项绿色检查，其中包括"allowed origins configured"——只有在 `install.sh` 至少成功用一个
有效的扩展 ID 运行过一次之后，这一项才会变绿。

**后续升级：** 用新构建产物重新运行 `install.sh`；它会安装在旧版本旁边（永不覆盖旧版本），并记录上一个
版本，这样出问题时 `install.sh --rollback` 就能恢复到它。

**卸载：** `./installers/uninstall.sh` 会移除它注册过的所有清单以及已安装的程序文件。

## 5. 在 ScriptCat 中启用桥接

打开扩展的选项页 → **工具** → **MCP 桥接（开发者）**。打开"启用 MCP 桥接"开关——会弹出一个说明你正在
开启什么的警告对话框（代理可以自由列出脚本/读取元数据；其余一切都需要你的批准），确认后才会真正生效。
如果本机主机可达，状态应该会在一两秒内从"连接中…"变为"已连接"。

如果提示"无法连接主机"：回头检查第 4 步——通常是清单里的扩展 ID 和 Chrome 这次加载实际分配的 ID 对不上。
如果提示"主机版本过旧"：说明你运行的 `native-messaging-host` 构建版本低于扩展要求的版本，重新构建它
（第 3 步）。

## 6. 配对你的 MCP 客户端

每个客户端（Claude Desktop、Claude Code、自定义脚本——任何通过 stdio 说 MCP 的东西）在做任何事之前都
需要先配对一次。配对是交互式的，需要 ScriptCat 窗口处于打开状态，这样你才能批准它：

```bash
node dist/shim.js --pair --name "Claude Desktop"
```

这会在你的终端打印一个 8 位字符的验证码，并等待（最长 2 分钟）你批准它。与此同时，ScriptCat 会弹出一个
配对对话框——如果选项页标签已经打开，就在该标签内显示；否则以一个新的弹出窗口显示。**批准前请确认
ScriptCat 中显示的验证码与你终端里的一致**——这正是验证码存在的意义（它防止另一个本地进程抢先冒充你真正
的配对请求）。对话框还会显示一个 scope 勾选列表——裸调用 `--pair` 时，默认会请求并勾选
`scripts:list` 与 `scripts:metadata:read`；如果你想让这个客户端能够*请求*其他能力，勾选对应的框即可
（它仍然只能*请求*写操作——无论授予了什么 scope，每次操作都需要单独批准）。

想在配对时一次性请求更多 scope，而不是之后再逐个客户端在界面里编辑？

```bash
node dist/shim.js --pair --name "Claude Desktop" \
  --scopes scripts:list,scripts:metadata:read,scripts:source:read,scripts:install:request,scripts:toggle:request,scripts:delete:request
```

批准后，凭据会被保存到 `~/.config/scriptcat-mcp/credentials.json`（macOS/Linux）或
`%APPDATA%\scriptcat-mcp`（Windows）——原始令牌只存在于这里以及本机主机的内存会话中；ScriptCat 本身
永远不会看到或存储它，只会存储它的哈希值。

## 7. 在你的 MCP 客户端中注册

对于 Claude Desktop 或 Claude Code，在你的 MCP 服务器配置中添加一项：

```json
{
  "mcpServers": {
    "scriptcat": {
      "command": "node",
      "args": ["/absolute/path/to/packages/native-messaging-host/dist/shim.js"]
    }
  }
}
```

（这个包目前还没有发布到任何 registry，所以请直接指向构建产物 `shim.js`，而不是裸的 `scriptcat-mcp`
命令——除非你已经自己 `npm link` 过它，这样 bin 名称也能用。）重启你的客户端。此时它应该能列出一个
`scriptcat` MCP 服务器，其可用工具受限于你配对时批准的范围。

## 8. 在真正想要变更时才打开写模式

即使已经被授予写 scope，一个已配对客户端的 `request_script_*` 工具在你于"工具"设置卡片中打开
**"允许本次会话的写请求"**之前，都会被拒绝（`WRITE_MODE_DISABLED`）。这个开关刻意**不会**被持久化——
每次浏览器重启都会自动重置，也没有任何办法从 ScriptCat 界面之外把它打开。它存在的意义是：仅"已连接 +
已授权"永远不足以变更任何东西，必须由人主动决定"好，这个会话期间，可以做变更"，写请求才有机会进入批准
阶段。

## 可用工具

| 工具 | 需要你提供什么 | 是否需要写模式？ |
|---|---|---|
| `server_info` | 无——一旦配对完成即可使用 | 否 |
| `list_scripts` | `scripts:list` scope | 否 |
| `get_script_metadata` | `scripts:metadata:read` scope | 否 |
| `get_script_source` | `scripts:source:read` scope **+ 每个脚本一次性的披露批准** | 否 |
| `request_script_install` | `scripts:install:request` scope + 安装批准 | 是 |
| `request_script_toggle` | `scripts:toggle:request` scope + 启停批准 | 是 |
| `request_script_delete` | `scripts:delete:request` scope + 按住确认的删除批准 | 是 |
| `get_operation_status` | 任意写 scope | 否 |
| `list_pending_operations` | 任意写 scope | 否 |
| `cancel_operation` | 任意写 scope | 否 |

## 真实用例

### 用例 1 ——"我现在装了哪些用户脚本，哪些是启用状态？"

纯只读操作，只要配对时拥有 `scripts:list`，配对完成后立即可用：

> **你：** 我现在装了哪些用户脚本？
> **代理：** *调用 `list_scripts`* → 拿到一个 `{ uuid, name, type, enabled, updatedAt,
> hasUpdateUrl, ... }` 数组，不含源码，也不含完整的更新 URL（只有一个是否存在的布尔值）——这些都是
> 元数据级别的字段，不是敏感信息。
> **代理：** "你装了 12 个脚本，其中 9 个已启用。需要看某一个的详情吗？"

整个流程中不会出现任何批准弹窗——这和你自己在扩展里查看脚本列表一样安全。

### 用例 2 ——"找到并修复我的自动登录脚本里的 bug"

这是需要用到源码披露批准的流程：

> **你：** 我的"自动登录"脚本有个 bug——能帮我找到并修复吗？
> **代理：** *调用 `list_scripts`*，找到对应的 uuid，再调用 `get_script_metadata`* 确认是不是同一个，
> 然后调用 `get_script_source`。
> **结果：** *这个客户端*对*这个脚本*第一次调用 `get_script_source` 会返回带 `operationId` 的
> `USER_APPROVAL_REQUIRED`——此时还没有任何内容被发回。ScriptCat 弹出提示：*"`Claude Desktop` 想要读取
> `自动登录` 的源码。源码中可能包含密钥等敏感信息。"*，附三个按钮：**拒绝**、**仅本次允许**、
> **对该客户端始终允许**。
>
> - **仅本次允许** —— 这一次读取会成功；*下一次*对同一脚本调用 `get_script_source` 会再次提示。
> - **对该客户端始终允许** —— 从此以后，*这个客户端*对*这个脚本*的每一次读取都会成功，不再提示
>   （记录在该客户端上、按脚本区分的永久授权——而不是"永远允许该客户端读取任何东西"这种一刀切）。
>
> 假设你选择"仅本次允许"。代理重试 `get_script_source`，拿到代码，找到 bug，然后（假设写模式已打开且
> 你已授予 `scripts:install:request`）用修好的代码调用 `request_script_install`。ScriptCat 的安装页面
> 会打开，带一条横幅：*"由「Claude Desktop」请求"*，附来源 URL/原始代码标签、一个可展开的内容
> SHA-256，以及完整的常规权限/差异审查界面——启用开关默认**关闭**，所以即使你点击了安装，修好的版本
> 也不会运行，直到你显式启用它。

### 用例 3 ——"我调试的时候先把这个搞坏页面的脚本关掉"

> **你：** 先把我的"广告拦截调优"脚本禁用。
> **代理：** *调用 `list_scripts`* 找到 uuid，然后带 `{ uuid, enable: false }` 调用
> `request_script_toggle`。
> **结果：** 如果写模式关闭，调用会立刻以 `WRITE_MODE_DISABLED` 失败，代理应该告诉你去打开会话开关。
> 如果写模式打开，ScriptCat 会打开 `mcp_confirm.html`（一个轻量弹窗，不是完整的安装页面）：脚本名称、
> 请求方客户端、批准/拒绝按钮。你批准后 → `enableScript` 执行 → 代理下一次轮询
> `get_operation_status` 会看到 `status: "approved"`。
>
> 在你批准和实际执行禁用之间，ScriptCat 会重新检查该脚本的代码自请求发起以来是否发生过变化（TOCTOU
> 保护）——如果你同时编辑过它，你会得到 `CONFLICT` 而不是成功，代理需要重新发起一次请求。

### 用例 4 ——"清理我已经不用的脚本"

> **你：** 删除我这几个月没用过的三个脚本：X、Y、Z。
> **代理：** 调用三次 `request_script_delete`，每个 uuid 一次，收集到三个 `operationId`。
> **结果：** 三个独立的 `mcp_confirm.html` 弹窗（或者代理可以轮询 `list_pending_operations` 一次性
> 看到它们都处于 `awaiting_user` 状态），每一个都要求在删除按钮上**按住 1.5 秒**确认——这是刻意设计得
> 比单击更难误触的确认方式，因为删除操作同时会移除脚本存储的数据，且不可撤销。你可以独立拒绝这三个中
> 的任意一个；拒绝其中一个不会影响其他两个。

### 用例 5 —— 用完之后撤销访问权限

> 打开 工具 → MCP 桥接 → 已配对客户端列表会显示每个客户端及其已授予的 scope 与最近使用时间。点击
> "Claude Desktop"上的**撤销** → 确认 → 它的会话会在服务端立即被终止（主机会丢弃这个令牌哈希），
> 该客户端之后的任何调用都会鉴权失败。如果你想一次性彻底关闭整个功能——所有客户端，立刻——
> **"撤销所有客户端并停止桥接"**会同时完成这两件事，并把启用开关也一并关闭。

## 审计发生过的一切

同一个设置卡片里有一个**审计日志**——每一次桥接调用（无论允许还是拒绝）、每一次配对决定、每一次操作
状态流转、每一次撤销，最新的排在最前面，附客户端名称、动作与结果。它永远不会包含令牌或脚本源码——
审计写入器只会拿到动作名称、客户端与结果，从来不会拿到请求/响应的实际内容，所以不存在任何让密钥
泄漏进审计日志的代码路径。**导出 JSON** 会在客户端本地下载同样的数据；**清空**会清除它（不可撤销，
执行前会要求确认）。

## 故障排查

| 现象 | 可能原因 |
|---|---|
| 状态卡在"连接中…"然后变成"无法连接主机" | 本机主机没有为 Chrome 这次加载实际分配的扩展 ID 注册，或者主机进程崩溃了。用正确的 ID 重新运行 `install.sh`；用 `node dist/host.js --doctor` 检查。 |
| "主机版本过旧" | 扩展是针对比你已安装的本机主机所报告版本更新的 `MIN_HOST_VERSION` 构建的。重新构建 `packages/native-messaging-host` 并重新运行 `install.sh`。 |
| `scriptcat-mcp`（不带 `--pair`）立刻退出并提示"No credentials found" | 你还没有配对过，或者你是以配对时不同的操作系统用户身份运行它。再次运行 `--pair`。 |
| 配对超时 | 从 `--pair` 打印验证码那一刻起，你有 2 分钟时间批准；如果 ScriptCat 没有打开，或者 MCP 开关是关闭的，它根本无法显示对话框——先确认桥接处于"已连接"状态。 |
| 写工具总是返回 `WRITE_MODE_DISABLED` | 会话写开关是关闭的（它会在每次浏览器重启时刻意重置）。到 工具 → MCP 桥接 里打开它。 |
| 写工具返回 `INSUFFICIENT_SCOPE` | 该客户端在配对时没有被授予这个 scope。用包含它的 `--scopes` 重新配对，或者从已配对客户端列表里编辑该客户端的 scope。 |
| `get_script_source` 在你批准之后仍然不断返回 `USER_APPROVAL_REQUIRED` | 你很可能选择了"仅本次允许"，而代理正在发起*第二次*读取——这是预期行为；再批准一次，或者如果你预计会有反复读取，选择"对该客户端始终允许"。 |

## 这个桥接刻意不做的事

- 它从不打开任何网络监听端口——整条传输链路是 stdio（代理↔主机）加上一个操作系统本地的 Unix
  socket 或命名管道（主机↔shim）。没有端口可供网页发起攻击。
- 它不信任 AI 客户端自己声称的身份——本机主机在每一次请求时都会从已鉴权的会话重新推导出是哪个客户端
  在调用，扩展也会在执行动作前独立地把该客户端的 scope 与自己的记录重新核对一遍。
- 它无法防御另一个已经以你自己操作系统用户身份运行的进程读取已配对客户端的令牌文件——这是一个已被
  记录、可以接受的残留局限，不是 bug（见文档开头链接的威胁模型文档）。

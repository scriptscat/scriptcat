<p align="right">
<a href="./mcp-bridge-guide_zh-CN.md">中文</a> <a href="./mcp-bridge-guide.md">English</a>
</p>

# 使用 ScriptCat MCP 桥接

一份面向实操、以任务为线索的指南:把 AI 代理(Claude Desktop、Claude Code,或任何
[Model Context Protocol](https://modelcontextprotocol.io/) 客户端)——或你自己的终端——连接到你的
ScriptCat 用户脚本,并附上你实际会遇到的每条流程的示例。

桥接**内置于所有构建,但默认关闭**;你从扩展设置里主动开启。它与一个小巧的本地伴随二进制
[`sctl`](https://github.com/scriptscat/sctl) 通信:`sctl` 在 `127.0.0.1:8643` 上运行一个 WebSocket
守护进程,扩展从 offscreen 文档作为客户端连接过去。不新增任何浏览器权限,也没有 native-messaging
主机或安装器要注册。至于**为何这样设计**(威胁模型、握手、scope 设计、TOCTOU 保证),见 sctl 仓库的
[`THREAT-MODEL.md`](https://github.com/scriptscat/sctl/blob/main/THREAT-MODEL.md) 与
[`PROTOCOL.md`](https://github.com/scriptscat/sctl/blob/main/PROTOCOL.md);本指南是它们「怎么实际用起来」
的配套。

## 你能得到什么

连接后,AI 代理(经 MCP)**或**你(经 `sctl` 命令行)可以:

- 列出已安装的用户脚本并读取元数据(匹配规则、授权、启用状态)——只读,授予 scope 后无需审批。
- 读取脚本完整源码——每个脚本、每个客户端首次读取需一次性(或永久,由你选)审批,因为源码可能包含
  密钥等敏感信息。(`sctl` 命令行对此豁免——命令是你亲手输入的——但 MCP 代理不豁免。)
- **请求**安装新脚本、启用/禁用脚本、删除脚本。每一项都是**请求**:调用会阻塞,在你审阅并于自动弹出的
  ScriptCat 窗口点「批准」之前,什么都不会改变。即使批准,新安装的脚本仍默认禁用,除非你在同一审批页
  勾选启用开关。

从 MCP 或 CLI 请求到脚本变更,没有任何绕过你审批的代码路径(唯一例外是你主动开启的「直接允许」模式,见下)。

## 1. 前置条件

- `sctl` 二进制。它是单个自包含的 Go 二进制——无需 Node、无运行时依赖。从
  [`scriptscat/sctl`](https://github.com/scriptscat/sctl) 仓库构建:

  ```bash
  go build -ldflags "-X github.com/scriptscat/sctl/internal/cli.Version=0.1.0" -o sctl ./cmd/sctl
  ```

  > **版本很关键。** 扩展会拒绝版本低于 `minDaemonVersion`(当前 `0.1.0`)的 daemon,并显示「主机版本
  > 过旧」。普通 `go build` 会打上 `0.0.0-dev`,**低于门槛**——凡是要真正连接的构建,务必用上面的
  > `-ldflags`(或使用 release 二进制)。

- macOS、Linux 或 Windows——`sctl` 仅回环、跨平台;没有任何依赖操作系统的安装步骤。

## 2. 启动 daemon

```bash
sctl serve
```

它在 `127.0.0.1:8643` 上绑定 WebSocket hub(仅回环——拒绝任何非回环地址),并写入一个 `0600` 的
控制令牌文件供本机 `sctl` 前端使用。你也可以跳过这步:`sctl pair`、`sctl mcp` 与各 CLI 动词在 serve
未运行时会自动以 detached 方式拉起它。

## 3. 在 ScriptCat 中启用桥接

打开扩展选项页 → **工具** → **MCP 桥接(开发者)**。打开「启用 MCP 桥接」——弹窗会先说明你正在开启
什么(代理可自由列出/读取元数据;其余都需你批准)。连接地址默认 `ws://127.0.0.1:8643`,未移动 daemon
就保持不变。状态会停在「连接中…」直到你完成配对(下一步)。

## 4. 让扩展与 daemon 配对(一次性)

扩展与 daemon 一次性建立共享长期密钥,使两者都无法被其他本机进程冒充。从 daemon 生成配对码,填入扩展:

```bash
sctl pair
```

它会打印一个 8 字符一次性配对码(有效 2 分钟)。在 ScriptCat 的 MCP 桥接卡片里,把它粘贴到**配对码**
输入框并点**配对**。双方跑一次相互握手,daemon 经加密信道把长期密钥交给扩展,状态转为**已连接**。
重新配对会替换旧密钥(本版本只支持一个扩展实例)。

## 5a. 接入 MCP 客户端(Claude Desktop、Claude Code……)

每个 MCP 代理各配对一次,从而拥有自己可撤销的身份与 scope。由于 `sctl mcp` 的 stdout 被 MCP 协议独占,
配对是一条**独立**的终端命令:

```bash
sctl mcp pair --name "Claude Desktop"
```

它打印一个 8 字符配对码并阻塞。ScriptCat 弹出配对对话框(在已打开的选项页,或以弹窗形式),显示同一个码
和一个 **scope 勾选清单**。**核对码一致**,勾选该客户端可以**请求**的 scope,然后批准。铸造出的令牌缓存
在 `<dataDir>/mcp-clients/Claude Desktop.json`(`0600`);ScriptCat 只存它的哈希。

然后把客户端的 MCP 配置指向服务命令(一个 `--name` 一份身份,可同时跑多份客户端配置):

```json
{
  "mcpServers": {
    "scriptcat": { "command": "sctl", "args": ["mcp", "--name", "Claude Desktop"] }
  }
}
```

重启客户端。它会列出一个 `scriptcat` 服务,只暴露你已批准的 scope 所允许的工具。未配对或已撤销的
`sctl mcp` 提供零工具,并提示模型运行 `sctl mcp pair`。

## 5b. ……或直接用命令行

`sctl` 各动词以内建 `sctl-cli` 身份驱动同一座桥——不配对、全量 scope,但**写操作仍需你在浏览器审批**:

```bash
sctl scripts list                 # 或 --json 输出结构化数据
sctl scripts info <uuid>
sctl scripts source <uuid>        # 源码输出到 stdout(CLI 不弹披露确认)
sctl install ./my-script.user.js  # 或一个 URL;阻塞至你在浏览器批准/拒绝
sctl enable <uuid>
sctl disable <uuid>
sctl rm <uuid>
```

写动词阻塞至你决策;**Ctrl-C** 取消请求(浏览器确认页随之关闭)。退出码:**0** 批准/成功,**1** 你拒绝,
**2** 作废(超时 / Ctrl-C / 断开),**3** 其他错误。

## 6. 需要真正落地变更时,开启写模式

即便授予了写 scope,写请求仍会被拒绝(`WRITE_MODE_DISABLED`),直到你在工具卡片里打开
**「允许本次会话的写请求」**。它**刻意不持久化**——浏览器重启即复位,且无法从 ScriptCat UI 之外开启。
另外,**写审批策略**决定一个被允许的写请求会怎样处理:

- **需人工审批**(默认)——每个写请求都在逐项确认页上阻塞。
- **直接允许**——写请求立即执行,无需逐项确认(琥珀警示标明这是安全降级)。即便如此,新安装仍默认禁用,
  读取源码仍需审批。

## 可用 MCP 工具

| 工具 | 需要你什么 | 写? |
|---|---|---|
| `scripts_list` | `scripts:list` scope | 否 |
| `scripts_metadata_get` | `scripts:metadata:read` scope | 否 |
| `scripts_source_get` | `scripts:source:read` scope **+ 每脚本一次性披露审批** | 否 |
| `scripts_install_request` | `scripts:install:request` scope + 安装审批 | 是 |
| `scripts_toggle_request` | `scripts:toggle:request` scope + 启停审批 | 是 |
| `scripts_delete_request` | `scripts:delete:request` scope + 按住确认的删除审批 | 是 |

写工具是**阻塞的**:调用挂起直到你批准或拒绝(没有操作轮询接口——结果就在这次调用里返回)。等待期间
MCP 服务会发送 progress 通知以免客户端超时;若客户端断开或超时,操作作废、确认页失效。

## 案例

### 案例 1 —— 「我装了哪些用户脚本,哪些是启用的?」

只读,配对并授予 `scripts:list` 后立即可用:

> **你:** 我现在装了哪些用户脚本?
> **代理:** *调用 `scripts_list`* → 得到 `{ uuid, name, type, enabled, updatedAt, hasUpdateUrl, … }`
> 数组——无源码,且只告知是否存在更新 URL(元数据层,非密钥)。
> **代理:** 「你装了 12 个脚本,其中 9 个启用。」

全程不弹审批——与你自己看脚本列表一样安全。(同样的答案用终端:`sctl scripts list`。)

### 案例 2 —— 「找出并修复我自动登录脚本里的 bug」

这是需要披露闸门的流程:

> **你:** 我的「自动登录」脚本有个 bug,能找出来并修好吗?
> **代理:** *调用 `scripts_list`* 找到 uuid,*调用 `scripts_metadata_get`* 确认,再 *调用
> `scripts_source_get`*。
> **结果:** 针对*此脚本、此客户端*的首次 `scripts_source_get` 会阻塞。ScriptCat 弹出:*「`Claude
> Desktop` 想要读取「自动登录」的源码。源码中可能包含密钥等敏感信息。」*,附**拒绝**、**仅本次允许**、
> **对该客户端始终允许**。
>
> - **仅本次允许**——这次读取成功;*下次*读取再次弹窗。
> - **对该客户端始终允许**——此客户端对*此脚本*的今后每次读取都不再弹窗(每脚本的永久授予,不是「允许
>   该客户端读任何东西」)。
>
> 假设你选「仅本次允许」。调用返回源码,代理找出 bug,并(在写模式开启且授予了 `scripts:install:request`
> 时)带上修复后的代码调用 `scripts_install_request`。ScriptCat 安装页打开:*「由 `Claude Desktop`
> 请求」*、来源标签、可展开的内容 SHA-256,以及常规的权限/差异审阅界面——启用开关默认**关**,即便你点了
> 安装,修好的版本在你启用前也不会运行。

### 案例 3 —— 「先把弄坏这个站点的脚本关掉,我要调试」

> **你:** 先禁用我的「广告拦截微调」脚本。
> **代理:** *调用 `scripts_list`* 找 uuid,再 `scripts_toggle_request` 带 `{ uuid, enable: false }`。
> **结果:** 若写模式关,调用立刻以 `WRITE_MODE_DISABLED` 失败。若开,ScriptCat 打开一个轻量确认弹窗
> (脚本名、请求方、批准/拒绝)。你批准 → 执行启停 → 阻塞的调用返回成功。
>
> 在你批准与实际禁用之间,ScriptCat 会复核脚本代码自请求以来未变(TOCTOU 防护)——若你期间改过,会得到
> `CONFLICT`,代理需重新请求。

### 案例 4 —— 「清理我不再用的脚本」

> **你:** 删掉我几个月没用的这三个:X、Y、Z。
> **代理:** 按 uuid 调用 `scripts_delete_request` 三次。
> **结果:** 请求阻塞,确认页**逐个**呈现(并发写排队)。每个删除都需**按住 1.5 秒**——比单击更难误触,
> 因为删除还会移除脚本已存储的值且不可撤销。你可独立拒绝任意一个;拒一个不影响其余。若不慎关掉确认页,
> 请求仍挂起——从设置卡片的**待确认**行重新打开。

### 案例 5 —— 用完后撤销访问

> 工具 → MCP 桥接 → 已配对客户端列表列出每个客户端及其 scope 和最近使用时间。**撤销** → 确认 → daemon
> 立即丢弃令牌,该客户端任何在途或今后的调用都失败。**「撤销所有客户端并停止桥接」**对所有人执行此操作
> 并关闭启用开关。(`sctl-cli` 身份不是已配对客户端——不出现在此处,与桥接同生命周期;停止桥接即停止它。)

## 审计发生了什么

设置卡片有**审计日志**——每次桥接调用(允许或拒绝)、每次配对决策、每次操作状态流转、每次撤销,最新在前,
含客户端名、动作与结果。它从不包含令牌或源码;审计写入方只拿到动作、客户端与结果。**导出 JSON** 在本地
下载;**清空**抹除(有确认,不可撤销)。

## 排障

| 现象 | 可能原因 |
|---|---|
| 状态卡在「连接中…」后转「无法连接主机」 | daemon 没运行或地址不同。启动 `sctl serve`(或跑任意 `sctl` 命令),并核对卡片里的连接地址一致。 |
| 「主机版本过旧」 | daemon 报告的版本低于 `minDaemonVersion`(`0.1.0`)——几乎总是普通 `go build`(`0.0.0-dev`)。用第 1 步的 `-ldflags "…Version=0.1.0"` 重建,或用 release 二进制。 |
| 配对始终完不成 | `sctl pair` 的码有效 2 分钟;桥接须已启用且 daemon 可达,ScriptCat 才能跑握手。点配对前先核对浏览器里的码与终端一致。 |
| `sctl mcp` 无工具 / 模型提示运行 `sctl mcp pair` | 该 `--name` 身份未配对(或已被撤销)。运行 `sctl mcp pair --name "<同一名字>"`。 |
| 写操作总返回 `WRITE_MODE_DISABLED` | 会话写开关关着(每次浏览器重启复位,刻意为之)。在工具 → MCP 桥接里打开。 |
| 写操作返回 `INSUFFICIENT_SCOPE` | 配对时未授予该 scope。带上该 scope 重新配对,或在已配对客户端列表里编辑其 scope。(`sctl-cli` 身份始终全量 scope。) |
| 批准后 `scripts_source_get` 又弹窗 | 你选了「仅本次允许」而代理又读了一次——正常;再批准一次,或选「对该客户端始终允许」。 |
| CLI 写操作退出码 `2` | 请求被作废——你(或客户端)超时、Ctrl-C,或扩展在你决策前断开。 |

## 本桥接刻意做与不做什么

- 它**确实**开了一个回环 WebSocket 监听(`127.0.0.1:8643`)——这是换取零新增浏览器权限、无安装器的代价。
  网页能看到端口开着,但每条连接必须先过双向 HMAC 握手才能收发业务消息;无凭据的 socket 在 5 秒后被断开,
  不泄露任何信息。刻意**不做 Origin 判别**(非浏览器进程可任意伪造 Origin——真正的闸门只有握手)。
- 它不信任客户端的自述——daemon 从已认证会话重新推导是哪个客户端在调用,扩展再独立地用自己的记录复核该
  客户端的 scope 才动作。
- 它挡不住已以你本人操作系统用户身份运行的进程读取已配对令牌或密钥文件(均 `0600`)——这是有记录、被接受
  的残余局限,不是 bug。见 sctl [`THREAT-MODEL.md`](https://github.com/scriptscat/sctl/blob/main/THREAT-MODEL.md)。

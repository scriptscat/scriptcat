<p align="right">
<a href="./README_zh-CN.md">中文</a> <a href="./README.md">English</a>
</p>

# @scriptcat/native-messaging-host

这是一个本地 Node.js 进程，通过 [Model Context Protocol](https://modelcontextprotocol.io/) 把
[ScriptCat](https://github.com/scriptscat/scriptcat) 与 AI 代理连接起来。本包会构建出两个可执行文件：

- **`scriptcat-native-host`**（`src/host.ts`）—— 向 Chrome 注册为一个
  [native messaging host](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)。
  由 Chrome 启动；它负责鉴权，并通过 stdio native messaging 把已配对 MCP 客户端的请求转发给扩展。
- **`scriptcat-mcp`**（`src/shim.ts`）—— 你的 AI 客户端（Claude Desktop、Claude Code，或任何其他
  MCP 客户端）启动的 stdio MCP 服务器。它对外暴露 `list_scripts`、`get_script_source`、
  `request_script_install` 等工具，并通过一个本地 Unix socket 或 Windows 命名管道把它们转发给主机。

本包中不存在任何网络监听端口——所有传输链路都是 stdio 或操作系统本地的 IPC。

只有在你以 `SC_ENABLE_MCP=true` 构建 ScriptCat 时（这是一个仅存在于 developer 构建的功能；
Chrome 应用商店构建中不包含它）才需要用到本包。关于这套设计*为什么*要这样做（威胁模型、scope 设计、
TOCTOU 保证），见本目录下的 [`THREAT-MODEL.md`](./THREAT-MODEL.md) 与 [`PROTOCOL.md`](./PROTOCOL.md)。
带实操示例的分步使用说明见仓库根目录的
[`docs/mcp-bridge-guide_zh-CN.md`](../../docs/mcp-bridge-guide_zh-CN.md)。

## 环境要求

- Node.js ≥ 20。
- 目前若要自己运行安装器脚本，需要 macOS 或 Linux（Windows 版 `install.ps1` 已经存在且经过代码审查，
  但尚未在本仓库的 CI 中做过端到端验证）。

## 安装与构建

这是一个拥有独立 lockfile 的独立包——它不属于根目录 pnpm workspace 的构建图，必须单独安装/构建：

```bash
cd packages/native-messaging-host
pnpm install
pnpm build
```

`pnpm build` 运行 `tsc`，生成 `dist/host.js` 与 `dist/shim.js`。`pnpm dev` 以 `--watch` 模式运行同样的
编译。

## 注册本机主机

```bash
./installers/install.sh --extension-id <你的扩展-ID> [--browser edge|chromium|brave] [--rollback]
```

请在本目录内运行。`--browser` 可重复指定，用于为 Chrome 以外的多个 Chromium 系浏览器注册。
`--rollback` 会恢复上一个已安装的版本（每次升级安装时都会自动记录）。`installers/install.ps1` 是
对应的 Windows 版本；`installers/uninstall.sh` / `installers/uninstall.ps1` 会移除所有清单及已安装的
文件。

检查安装结果：

```bash
node dist/host.js --doctor
```

## CLI 参考

**`scriptcat-native-host`**（`dist/host.js`）：

| 参数 | 作用 |
|---|---|
| `--doctor` | 打印配置目录、权限、允许来源（allowed origins）与 Node 版本的健康检查结果后退出。 |
| `--print-manifest --extension-id <id> --host-path <path>` | 打印为该扩展 ID 会生成的 native-messaging 清单 JSON，但不写入任何文件。供安装器脚本内部使用。 |

不带任何参数运行时，这就是 Chrome 依据自身 native-messaging 清单直接启动的进程——除了
`--doctor`/`--print-manifest` 之外，通常不需要手动调用它。

**`scriptcat-mcp`**（`dist/shim.js`）：

| 参数 | 作用 |
|---|---|
| `--pair --name "<客户端名称>" [--scopes a,b,c]` | 交互式配对：打印一个 8 位验证码，最长等待 2 分钟以等待你在 ScriptCat 界面中批准，成功后保存凭据。 |
| *（不带参数）* | 使用先前保存的凭据启动 stdio MCP 服务器。这就是你的 MCP 客户端配置应该启动的命令。 |

如果不带 `--pair` 参数且没有已保存的凭据，`scriptcat-mcp` 会立即退出并提示"No credentials
found"——请先完成配对。

## 测试

```bash
pnpm test        # vitest run
pnpm test:watch  # vitest --watch
```

## 目录结构

| 路径 | 内容 |
|---|---|
| `src/host.ts`、`src/shim.ts` | 两个可执行文件的入口。 |
| `src/auth/` | 配对、scope、挑战-响应、令牌存储。 |
| `src/broker/` | shim 连接的本地 IPC 服务器，以及限流与配对决定处理。 |
| `src/native/` | Chrome native messaging 的分帧/通道/来源校验。 |
| `src/shim/` | 面向 MCP 的 stdio 服务器：工具 schema、resource、socket 客户端。 |
| `src/shared/` | 本包内共用的协议类型、配置、日志、限制常量。 |
| `src/installers/lib/` | `installers/install.sh` / `install.ps1` 使用的清单生成逻辑。 |
| `installers/` | 面向终端用户的安装/卸载/回滚 shell 与 PowerShell 脚本。 |
| `PROTOCOL.md` | 规范性的三层协议说明（浏览器↔主机、shim↔主机、MCP 工具目录）。 |
| `THREAT-MODEL.md` | 资产、攻击者、入口点，及针对每一项的缓解措施。 |

## 许可证

GPLv3 —— 与 ScriptCat 仓库其余部分一致。见 [`LICENSE`](./LICENSE)（或
[根目录 `LICENSE`](../../LICENSE) 获取完整文本）。

# ScriptCat 贡献指南

我们非常感谢你为 ScriptCat 做出贡献！本指南旨在帮助你以更规范的方式向 ScriptCat
提交贡献，因此请务必认真阅读。

## 提交 Issue

在提交 Issue 前，我们建议你先查看
[已有的 Issues](https://github.com/scriptscat/scriptcat/issues)，以避免重复提交。

### 报告问题、故障与漏洞

ScriptCat 是一个不断发展的项目。如果你在使用过程中发现问题，并且确信这些问题是由
ScriptCat 引起的，欢迎提交 Issue。在提交时，请附带详细的复现步骤和运行环境信息。

### 提出新功能

我们欢迎你在 Issue
中提出新的功能建议。为了让我们更好地理解你的需求，建议你尽可能详细地描述这个功能，并提供你认为可能的解决方案。

## Pull Request

ScriptCat 使用 [pnpm](https://pnpm.io/) 来管理项目依赖。如果你已经安装了
npm，以下的命令可以帮助你快速配置开发环境：

```bash
# 安装 node.js 依赖
pnpm install
```

我们推荐使用[代理](https://pnpm.io/npmrc#https-proxy)来解决 pnpm 的网络问题，而不是使用镜像。

```bash
# 设置代理(linux/mac)
export HTTPS_PROXY=http://127.0.0.1:1080
# 设置代理(windows)
set HTTPS_PROXY=http://127.0.0.1:1080
```

### Commit 规范

我们希望每一个 commit 都能清晰地描述其目的，每个 commit
应尽可能只包含一个修改。我们的 commit message 格式遵循
[gitmoji](https://gitmoji.dev/) 规范。例如：

```bash
git commit -m "✨ add login feature"
```

这个示例表示添加了新的功能：登录功能。

### 工作流概述

`main` 分支是 ScriptCat 的主分支。为了保持代码的完整性，请不要直接修改 `main`
分支。你应该创建一个新的分支，并在这个分支上进行修改，然后发起一个目标分支为
`main` 的 Pull Request。Pull Request
的标题请尽量使用中文，以便于自动生成更新日志。

如果你不是 ScriptCat 团队的成员，你可以先 fork 本仓库，然后向本仓库的 `main`
分支发起 Pull Request。在创建 commit 时，请按照上述 commit message
规范进行。我们将在 code review 完成后将你的贡献合并到主分支。

## 撰写文档

ScriptCat
的文档在另外的仓库中：[scriptcat.org](https://docs.scriptcat.org)，使用
[docusaurus](https://docusaurus.io/)进行撰写，这有一些
[Markdown](https://docusaurus.io/zh-CN/docs/markdown-features)
特性可以帮助你。如果你需要在本地预览修改后的文档，可以使用以下命令安装文档依赖并启动
dev server：

```bash
npm install
npm start
```

### 帮助我们翻译

[Crowdin](https://crowdin.com/project/scriptcat) 是一个在线的多语言翻译平台。如果您有兴趣帮助我们翻译 ScriptCat 的相关内容，您可以在 Crowdin 上找到 ScriptCat 项目，并开始进行翻译工作。

- `src/locales`为[扩展](https://github.com/scriptscat/scriptcat)翻译文件目录
- `public/locales`为[脚本站](https://github.com/scriptscat/scriptlist-frontend)的翻译文件目录

#### 扩展开启所见即所得模式

扩展开启所见即所得模式需要使用`npm run i18n`模式进行构建，然后通过控制台设置伪语言`localStorage['language']='ach-UG';`，然后刷新页面。

#### 脚本站开启所见即所得模式

脚本站访问：[https://scriptcat.org/ach-UG](https://scriptcat.org/ach-UG) 即可开启所见即所得模式

## 参与开发

ScriptCat 使用 ESLint 来规范代码风格，使用 Jest
来进行单元测试。你可以使用以下命令来运行：

```bash
npm test
npm run lint
```

ScriptCat 的页面开发使用了以下技术：

- [React](https://reactjs.org/)
- UI 框架 [arco](https://arco.design)
- CSS 框架 [unocss](https://unocss.dev/interactive/)
- RsPack 打包工具 [rspack](https://rspack.dev/)

如果你想在本地运行 ScriptCat，可以使用以下命令：

```bash
npm run dev
```

如果你想打包扩展，可以使用以下命令：

```bash
npm run pack
```

在打包前，请确保在`dist`目录下生成了`scriptcat.pem`文件。

## 注意问题

- `npm run dev`之后需要把`dist/ext`目录里面内容在浏览器扩展里面导入加载，然后开始改代码保存即可，浏览器是实时更新的，但是涉及到`manifest.json`、`service_worker`、`offscreen`、`sandbox`的改动需要重新导入加载。

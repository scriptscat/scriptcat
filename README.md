<p align="right">
<a href="./README.md">中文</a>  <a href="./README_EN.md">English</a> <a href="./README_RU.md">Русский</a>
</p>

<h1 align="center">
<img src="./src/assets/logo.png"/><br/>
ScriptCat
</h1>

<p align="center">脚本猫，一个可以执行用户脚本的浏览器扩展，万物皆可脚本化，让你的浏览器可以做更多的事情！</p>

<p align="center">
<a href="https://docs.scriptcat.org/">文档</a> ·
<a href="https://bbs.tampermonkey.net.cn/">社区</a> ·
<a href="https://scriptcat.org/search">脚本站</a>
</p>

![GitHub stars](https://img.shields.io/github/stars/scriptscat/scriptcat.svg)
[![Build Status](https://github.com/scriptscat/scriptcat/actions/workflows/build.yaml/badge.svg?branch=main)](https://github.com/scriptscat/scriptcat)
[![codecov](https://codecov.io/gh/scriptscat/scriptcat/branch/main/graph/badge.svg?token=G1A6ZGDQTY)](https://codecov.io/gh/scriptscat/scriptcat)
![GitHub tag (latest SemVer)](https://img.shields.io/github/tag/scriptscat/scriptcat.svg?label=version)
[![Chrome](https://img.shields.io/badge/chrome-success-brightgreen?logo=google%20chrome)](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
[![Edge](https://img.shields.io/badge/edge-success-brightgreen?logo=microsoft%20edge)](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)
[![FireFox](https://img.shields.io/badge/firefox-success-brightgreen?logo=firefox)](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat/)
![GitHub All Releases](https://img.shields.io/github/downloads/scriptscat/scriptcat/total)

## 关于

ScriptCat（脚本猫）是一个功能强大的用户脚本管理器，基于油猴的设计理念，完全兼容油猴脚本。它不仅支持传统的用户脚本，还创新性地实现了后台脚本运行框架，提供丰富的API扩展，让脚本能够完成更多强大的功能。内置优秀的代码编辑器，支持智能补全和语法检查，让脚本开发更加高效流畅。

**如果觉得好用，请给我们一个 Star ⭐ 这是对我们最大的支持！**

## ✨ 核心特性

### 🔄 云端同步

- **脚本云同步**：跨设备同步脚本，更换浏览器或重装系统后轻松恢复
- **脚本订阅**：创建和管理脚本合集，支持团队协作和脚本组合使用

### 🔧 强大功能

- **完全兼容油猴**：无缝迁移现有油猴脚本，零学习成本
- **后台脚本**：独创后台运行机制，让脚本持续运行不受页面限制
- **定时脚本**：支持定时执行任务，实现自动签到、定时提醒等功能
- **丰富 API**：相比油猴提供更多强大 API，解锁更多可能性

### 🛡️ 安全可靠

- **沙盒机制**：脚本运行在隔离环境中，防止恶意代码影响脚本
- **权限管理**：脚本需明确申请所需权限，敏感操作需要额外确认

### 💻 开发体验

- **智能编辑器**：内置代码编辑器支持语法高亮、智能补全和 ESLint
- **调试工具**：完善的调试功能，快速定位和解决问题
- **美观界面**：现代化 UI 设计，操作简洁直观

> 🚀 更多功能持续开发中...

## 🚀 快速开始

### 📦 安装扩展

#### 扩展商店（推荐）

| 浏览器 | 商店链接 | 状态 |
|--------|----------|------|
| Chrome | [正式版本](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf) [Beta版本](https://chromewebstore.google.com/detail/%E8%84%9A%E6%9C%AC%E7%8C%AB-beta/jaehimmlecjmebpekkipmpmbpfhdacom?authuser=0&hl=zh-CN) | ✅ 可用 |
| Edge | [正式版本](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh) [Beta版本](https://microsoftedge.microsoft.com/addons/detail/scriptcat-beta/nimmbghgpcjmeniofmpdfkofcedcjpfi) | ✅ 可用 |
| Firefox | [正式版本](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat/) [Beta版本](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat-pre/) | ✅ MV2 |
| GitHub Releases | [GitHub Releases](https://github.com/scriptscat/scriptcat/releases) | ✅ 可用 |
| GitHub Actions | [GitHub Actions](https://github.com/scriptscat/scriptcat/actions/workflows/build.yaml) | 每次提交触发 |

#### 手动安装

如果无法访问扩展商店，可以在 [GitHub Releases](https://github.com/scriptscat/scriptcat/releases) 下载最新版本的 ZIP 包进行手动安装。

### 📝 使用指南

#### 安装脚本

1. **从脚本市场获取**：访问 [ScriptCat 脚本站](https://scriptcat.org/search) 或其他用户脚本市场
2. **后台脚本专区**：体验独有的 [后台脚本](https://scriptcat.org/zh-CN/search?script_type=3)
3. **兼容性**：支持绝大部分油猴脚本，可直接安装使用，如果遇到不兼容的脚本，欢迎通过 [issue](https://github.com/scriptscat/scriptcat/issues) 反馈给我们。

#### 开发脚本

查看我们的 [开发文档](https://docs.scriptcat.org/docs/dev/)与[开发指南](https://learn.scriptcat.org/) 学习如何编写脚本。文档涵盖了从基础到高级的所有内容，让你在编写脚本时得心应手。

如果发现文档有错误或希望贡献内容，可以点击文档页面的"编辑此页"进行修改。

---

## 🤝 参与贡献

我们欢迎所有形式的贡献！请查看 [贡献指南](./CONTRIBUTING.md) 了解如何开始。

### 💬 社区交流

加入我们的社区，与其他用户和开发者交流：

- [Telegram](https://t.me/scriptscat)
- [Discord](https://discord.gg/JF76nHCCM7)
- [油猴中文网](https://bbs.tampermonkey.net.cn/)

### 🙏 鸣谢

感谢以下开发者对 ScriptCat 作出的贡献，有你们 ScriptCat 才能变得更好！

[![Contributors](https://contrib.rocks/image?repo=scriptscat/scriptcat&max=1000)](https://github.com/scriptscat/scriptcat/graphs/contributors)

---

## 📄 开源许可

本项目基于 [GPLv3](./LICENSE) 协议开源，请遵守相关协议条款。

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat?ref=badge_large)

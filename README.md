<p align="right">
<a href="./README_zh-CN.md">中文</a> <a href="./README.md">English</a> <a href="./README_zh-TW.md">繁體中文</a> <a href="./README_ja.md">日本語</a> <a href="./README_RU.md">Русский</a>
</p>

<h1 align="center">
<img src="./src/assets/logo.png"/><br/>
ScriptCat
</h1>

<p align="center">ScriptCat, a browser extension that can execute user scripts, everything can be scripted, allowing your browser to do more things!</p>

<p align="center">
<a href="https://docs.scriptcat.org/">Documentation</a> ·
<a href="https://discord.gg/JF76nHCCM7">Discord</a> ·
<a href="https://scriptcat.org/en/search">ScriptCat Scripts</a>
</p>

![GitHub stars](https://img.shields.io/github/stars/scriptscat/scriptcat.svg)
[![Build Status](https://github.com/scriptscat/scriptcat/actions/workflows/build.yaml/badge.svg?branch=main)](https://github.com/scriptscat/scriptcat)
[![codecov](https://codecov.io/gh/scriptscat/scriptcat/branch/main/graph/badge.svg?token=G1A6ZGDQTY)](https://codecov.io/gh/scriptscat/scriptcat)
![GitHub tag (latest SemVer)](https://img.shields.io/github/tag/scriptscat/scriptcat.svg?label=version)
[![Chrome](https://img.shields.io/badge/chrome-success-brightgreen?logo=google%20chrome)](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
[![Edge](https://img.shields.io/badge/edge-success-brightgreen?logo=microsoft%20edge)](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)
[![FireFox](https://img.shields.io/badge/firefox-success-brightgreen?logo=firefox)](https://addons.mozilla.org/en/firefox/addon/scriptcat/)
[![Crowdin](https://badges.crowdin.net/scriptcat/localized.svg)](https://crowdin.com/project/scriptcat)

## About ScriptCat

ScriptCat is a powerful userscript manager based on Tampermonkey's design philosophy, fully compatible with Tampermonkey
scripts. It not only supports traditional userscripts but also innovatively implements a background script execution
framework with rich API extensions, enabling scripts to accomplish more powerful functions. It features an excellent
built-in code editor with intelligent completion and syntax checking, making script development more efficient and
smooth.

**If you find it useful, please give us a Star ⭐ This is the greatest support for us!**

## ✨ Core Features

### 🔄 Cloud Sync

- **Script Cloud Sync**: Sync scripts across devices, easily restore when switching browsers or reinstalling systems
- **Script Subscriptions**: Create and manage script collections, support team collaboration and script combinations

### 🔧 Powerful Functions

- **Full Tampermonkey Compatibility**: Seamlessly migrate existing Tampermonkey scripts with zero learning curve
- **Background Scripts**: Innovative background execution mechanism, keeping scripts running continuously without page
  limitations
- **Scheduled Scripts**: Support timed execution tasks for auto check-ins, scheduled reminders, and more
- **Rich APIs**: Provides more powerful APIs compared to Tampermonkey, unlocking more possibilities

### 🛡️ Security & Reliability

- **Sandbox Mechanism**: Scripts run in isolated environments, preventing malicious code from affecting other scripts
- **Permission Management**: Scripts must explicitly request required permissions, with additional confirmation needed
  for sensitive operations

### 💻 Development Experience

- **Smart Editor**: Built-in code editor with syntax highlighting, intelligent completion, and ESLint
- **Debugging Tools**: Comprehensive debugging features for quick problem identification and resolution
- **Beautiful Interface**: Modern UI design with intuitive and clean operations

> 🚀 More features in continuous development...

## 🚀 Quick Start

### 📦 Install Extension

#### Extension Stores (Recommended)

| Browser | Store Link                                                                                                                                                                                                                       | Status       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Chrome  | [Stable Version](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf) [Beta Version](https://chromewebstore.google.com/detail/scriptcat-beta/jaehimmlecjmebpekkipmpmbpfhdacom)                  | ✅ Available |
| Edge    | [Stable Version](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh) [Beta Version](https://microsoftedge.microsoft.com/addons/detail/scriptcat-beta/nimmbghgpcjmeniofmpdfkofcedcjpfi) | ✅ Available |
| Firefox | [Stable Version](https://addons.mozilla.org/en/firefox/addon/scriptcat/) [Beta Version](https://addons.mozilla.org/en/firefox/addon/scriptcat-pre/)                                                                              | ✅ MV2       |

#### Manual Installation

If you cannot access extension stores, download the latest ZIP package from
[GitHub Releases](https://github.com/scriptscat/scriptcat/releases) for manual installation.

### 📝 Usage Guide

#### Installing Scripts

1. **Get from Script Markets**: Visit [ScriptCat Script Store](https://scriptcat.org/en/search) or other userscript
   markets
2. **Background Scripts Zone**: Experience unique [Background Scripts](https://scriptcat.org/en/search?script_type=3)
3. **Compatibility**: Supports most Tampermonkey scripts, can be installed directly. If you encounter incompatible
   scripts, please report them to us through [issues](https://github.com/scriptscat/scriptcat/issues).

#### Developing Scripts

Check our [Development Documentation](https://docs.scriptcat.org/docs/dev/) and
[Developer Guide](https://learn.scriptcat.org/) to learn how to write scripts. The documentation covers everything from
basics to advanced topics, making script development effortless.

If you find errors in the documentation or want to contribute content, you can click "Edit this page" on the
documentation page to make modifications.

---

## 🤝 Contributing

We welcome all forms of contributions! Please check the [Contributing Guide](./docs/CONTRIBUTING_EN.md) to learn how to
get started.

### 💬 Community

Join our community to communicate with other users and developers:

- [Telegram](https://t.me/scriptscat)
- [Discord](https://discord.gg/JF76nHCCM7)

### 🙏 Acknowledgments

Thanks to the following developers who have contributed to ScriptCat. ScriptCat becomes better with your help!

[![Contributors](https://contrib.rocks/image?repo=scriptscat/scriptcat&max=1000)](https://github.com/scriptscat/scriptcat/graphs/contributors)

---

## 📄 Open Source License

This project is open-sourced under the [GPLv3](./LICENSE) license. Please comply with the relevant license terms.

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat?ref=badge_large)

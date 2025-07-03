<p align="right">
<a href="./README.md">中文</a>  <a href="./README_EN.md">English</a>
</p>

<h1 align="center">
<img src="./src/assets/logo.png"/><br/>
ScriptCat
</h1>

<p align="center">ScriptCat, a browser extension that can execute user scripts, everything can be scripted, allowing your browser to do more things!</p>

<p align="center">
<a href="https://docs.scriptcat.org/">Docs</a> ·
<a href="https://bbs.tampermonkey.net.cn/">Community</a> ·
<a href="https://scriptcat.org/search">Script Hub</a> ·
</p>

![GitHub stars](https://img.shields.io/github/stars/scriptscat/scriptcat.svg)
[![Build Status](https://github.com/scriptscat/scriptcat/actions/workflows/build.yaml/badge.svg?branch=main)](https://github.com/scriptscat/scriptcat)
[![codecov](https://codecov.io/gh/scriptscat/scriptcat/branch/main/graph/badge.svg?token=G1A6ZGDQTY)](https://codecov.io/gh/scriptscat/scriptcat)
![GitHub tag (latest SemVer)](https://img.shields.io/github/tag/scriptscat/scriptcat.svg?label=version)
[![Chrome](https://img.shields.io/badge/chrome-sucess-brightgreen?logo=google%20chrome)](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
[![Edge](https://img.shields.io/badge/edge-sucess-brightgreen?logo=microsoft%20edge)](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)
[![FireFox](https://img.shields.io/badge/firefox-sucess-brightgreen?logo=firefox)](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat/)
![GitHub All Releases](https://img.shields.io/github/downloads/scriptscat/scriptcat/total)

## About

We built a framework for executing background scripts and Greasemonkey/Tampermonkey scripts based on the design ideas of Greasemonkey/Tampermonkey. It also has several unique APIs that enable scripts to do more. Furthermore, we provide a fantastic online editor that makes script code development more pleasant and easy.

**Please Star it if you find it useful. ❤❤❤**

## Features

- Cloud Sync: script recovery is easy when changing or reinstalling browser
- Scripts subscription: creating your own script collections or enabling multiple scripts to work together.
- Compatibility: allowing seamless migration from other userscript managers.
- Background scripts: allowing your scripts to run continuously in the background.
- Scheduled scripts: allowing for daily scheduled tasks. You can use them for automatic check-ins, timed reminders, and more.
- Rich API: more powerful APIs than other managers, which can realize more functions.
- Sandbox mechanism: ensuring user safety, script permissions are granted only with user consent.
- Excellent editor: providing API auto-completion and ESLint.
- Nice UI

...More features are Coming.

## Instructions

### Install script

You can get normal userscripts from [major userscript markets](https://docs.scriptcat.org/docs/use/#%E8%8E%B7%E5%8F%96%E8%84%9A%E6%9C%AC) and background scripts from [Background Scripts](https://scriptcat.org/en/search?script_type=3) which is supported by ScriptCat.

The installation method is the same as Greasemonkey/Tampermonkey, and it is also compatible with the majority of userscripts. If you encounter any incompatible scripts, you can provide feedback to us through [issues](https://github.com/scriptscat/scriptcat/issues).

### Script development documentation

The [Documentation](https://docs.scriptcat.org/docs/dev/) is trying its best to improve. Because it refers to the design of Greasemonkey/Tampermonkey, there are many similarities with their scripts. Even if you use other script managers, You can also refer to the documentation of ScriptCat to develop!

Suppose there are any errors in the development documentation or you would like to make additions. In that case, you can click the "Edit this page" link below to make changes.

### Install extension

We have published our extension in the Chrome or Firefox store. If you cannot access the store, please download the ZIP package manually from the [release](https://github.com/scriptscat/scriptcat/releases) and install it.

#### Extension store

- [Chrome Store](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
- [Edge Store](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)
- [Firefox Store](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat/)

#### Beta Version

Pre-release versions are versions before the official release. They are usually used to test new features. Pre-release versions have a pre-release identifier in their version number, for example:
`1.0.0-beta.1`.

You can get pre-release versions from the [Release](https://github.com/scriptscat/scriptcat/releases) page or from the extension store pages below:

- [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat-pre/)
- [Chrome](https://chromewebstore.google.com/detail/%E8%84%9A%E6%9C%AC%E7%8C%AB-beta/jaehimmlecjmebpekkipmpmbpfhdacom?authuser=0&hl=zh-CN)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/%E8%84%9A%E6%9C%AC%E7%8C%AB-beta/nimmbghgpcjmeniofmpdfkofcedcjpfi)

In addition to pre-releases, ScriptCat also builds the extension on [Github Action](https://github.com/scriptscat/scriptcat/actions/workflows/build.yaml) every time code is committed and merged into the main branch. If you want to experience the latest features or fixes, you can visit the [Github Action](https://github.com/scriptscat/scriptcat/actions/workflows/build.yaml) page to download.

## Contribution

Please refer to [Contribution Guidelines](./docs/CONTRIBUTING_EN.md)

### Discussion

- [Telegram](https://t.me/scriptscat)
- [Discord](https://discord.gg/JF76nHCCM7)
- [油猴中文网](https://bbs.tampermonkey.net.cn/)

### Thanks

Thanks to the following developers for contributing to ScriptCat and making ScriptCat even better!

<a href="https://github.com/scriptscat/scriptcat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=scriptscat/scriptcat&max=1000" />
</a>

## License

This project is open source under the GPLv3 license. Please comply with the terms and conditions of the license.

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat?ref=badge_large)

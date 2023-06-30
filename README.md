<h1 align="center">ScriptCat</h1>

<p align="center">
<img src="./build/assets/logo.png"/>
</p>

<p align="center">脚本猫,一个可以执行用户脚本的浏览器扩展,万物皆可脚本化,让你的浏览器可以做更多的事情!</p>

<p align="center">
<a href="https://docs.scriptcat.org/">文档</a> ·
<a href="https://bbs.tampermonkey.net.cn/">社区</a> ·
<a href="https://scriptcat.org/search">脚本站</a>
</p>

<p align="center">
<a href="./README_EN.md">English README</a>
</p>

![GitHub stars](https://img.shields.io/github/stars/scriptscat/scriptcat.svg)
[![Build Status](https://github.com/scriptscat/scriptcat/workflows/build/badge.svg?branch=main)](https://github.com/scriptscat/scriptcat)
[![codecov](https://codecov.io/gh/scriptscat/scriptcat/branch/main/graph/badge.svg?token=G1A6ZGDQTY)](https://codecov.io/gh/scriptscat/scriptcat)
![GitHub tag (latest SemVer)](https://img.shields.io/github/tag/scriptscat/scriptcat.svg?label=version)
[![Chrome](https://img.shields.io/badge/chrome-sucess-brightgreen?logo=google%20chrome)](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
[![Edge](https://img.shields.io/badge/edge-sucess-brightgreen?logo=microsoft%20edge)](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)
[![FireFox](https://img.shields.io/badge/firefox-sucess-brightgreen?logo=firefox)](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat/)
![GitHub All Releases](https://img.shields.io/github/downloads/scriptscat/scriptcat/total)

## 关于脚本猫

参考了油猴的设计思路并且支持油猴脚本,实现了一个后台脚本运行的框架,提供了一些特殊的
API,让脚本能够做更多的事情.并且提供了一个优秀的编辑器,让脚本代码编写开发更加舒服流畅.

**如果觉得好用，顺手点个 Star 吧 ❤❤❤**

## 特性

- 脚本云同步,更换浏览器/重装,脚本恢复更方便.
- 脚本订阅,创建自己的脚本合集或者让多个脚本配合使用.
- 支持油猴脚本,无缝从其它油猴脚本管理器迁移.
- 后台脚本,可以使你的脚本持续的运行在后台.
- 定时脚本,可以每日定时执行,每天通过脚本定时处理事务.可用于自动签到,定时提醒等功能.
- 丰富的 API,相比于油猴,扩展出了更多强大的 API,可以实现更多的功能.
- 通过沙盒机制确保了用户的安全,用户确定后才会给脚本授予权限.
- 优秀的编辑器,且提供了 API 的自动补全和 ESLint.
- 美观的 UI

...更多丰富功能加入中

## 说明

### 安装脚本

可以从各大用户脚本市场[获取脚本](https://docs.scriptcat.org/docs/use/#%E8%8E%B7%E5%8F%96%E8%84%9A%E6%9C%AC)进行安装,脚本猫所支持的后台脚本专门建立了一个市场:[后台脚本](https://bbs.tampermonkey.net.cn/forum-68-1.html).

安装方式与油猴一样,同时也是兼容绝大部分油猴脚本的,如果遇到未兼容的脚本,你可以通过[issue](https://github.com/scriptscat/scriptcat/issues)反馈给我们.

对于开发者来说,也可以参考这些脚本写出自己的脚本来.

### 开发文档

[开发文档](https://docs.scriptcat.org/docs/dev/)尽力完善中,因为是参考油猴的设计,与油猴脚本相通的地方很多,就算你使用其它油猴管理器,你也可以参考脚本猫的文档来开发!

如果开发文档有什么错误,或者你想进行补全,你可以点击下方的`编辑此页`进行修改.

### 安装扩展

我们已经上架了扩展商店,如果你无法访问商店内容,请在[release](https://github.com/scriptscat/scriptcat/releases)中下载
zip 包手动进行安装

#### 扩展商城

- [Chrome 商店](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
- [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)
- [FireFox 商店](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat/)

### 交流

- [Telegram](https://t.me/scriptscat)
- [油猴中文网](https://bbs.tampermonkey.net.cn/)

## License

本项目使用 GPLv3 协议开源, 请遵守协议规定.

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat?ref=badge_large)

## 贡献

请参考 [贡献指南](./CONTRIBUTING.md)

### 鸣谢

感谢以下开发者对 ScriptCat 作出的贡献，有你们 ScriptCat 才能变得更好！

<a href="https://github.com/scriptscat/scriptcat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=scriptscat/scriptcat&max=1000" />
</a>

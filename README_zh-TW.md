<p align="right">
<a href="./README_zh-CN.md">中文</a> <a href="./README.md">English</a> <a href="./README_zh-TW.md">繁體中文</a> <a href="./README_ja.md">日本語</a> <a href="./README_RU.md">Русский</a>
</p>

<h1 align="center">
<img src="./src/assets/logo.png"/><br/>
ScriptCat
</h1>

<p align="center">ScriptCat，一款能執行使用者腳本的瀏覽器擴充套件，萬物皆可被腳本化，讓你的瀏覽器能做得更多！</p>

<p align="center">
<a href="https://docs.scriptcat.org/">文件</a> ·
<a href="https://discord.gg/JF76nHCCM7">Discord</a> ·
<a href="https://scriptcat.org/zh-TW/search">腳本站</a>
</p>

![GitHub stars](https://img.shields.io/github/stars/scriptscat/scriptcat.svg)
[![Build Status](https://github.com/scriptscat/scriptcat/actions/workflows/build.yaml/badge.svg?branch=main)](https://github.com/scriptscat/scriptcat)
[![codecov](https://codecov.io/gh/scriptscat/scriptcat/branch/main/graph/badge.svg?token=G1A6ZGDQTY)](https://codecov.io/gh/scriptscat/scriptcat)
![GitHub tag (latest SemVer)](https://img.shields.io/github/tag/scriptscat/scriptcat.svg?label=version)
[![Chrome](https://img.shields.io/badge/chrome-success-brightgreen?logo=google%20chrome)](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
[![Edge](https://img.shields.io/badge/edge-success-brightgreen?logo=microsoft%20edge)](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)
[![FireFox](https://img.shields.io/badge/firefox-success-brightgreen?logo=firefox)](https://addons.mozilla.org/zh-TW/firefox/addon/scriptcat/)
[![Crowdin](https://badges.crowdin.net/scriptcat/localized.svg)](https://crowdin.com/project/scriptcat)

## 關於 ScriptCat

ScriptCat 是一款基於 Tampermonkey 設計理念的強大使用者腳本管理器，完全相容 Tampermonkey 腳本。  
它不僅支援傳統使用者腳本，還創新實作了背景腳本執行框架，並擁有豐富的 API 擴充能力，使腳本能完成更強大的功能。  
內建優秀的程式碼編輯器，具備智慧補全與語法檢查，讓腳本開發更加高效與順暢。

**如果你覺得 ScriptCat 很有用，歡迎幫我們點一顆 Star ⭐ 這是對我們最好的支持！**

## ✨ 核心功能

### 🔄 雲端同步

- **腳本雲端同步**：可跨裝置同步腳本，切換瀏覽器或重裝系統時輕鬆還原
- **腳本訂閱**：建立與管理腳本集合，支援團隊協作與腳本組合

### 🔧 強大功能

- **完整 Tampermonkey 相容性**：可無縫遷移現有 Tampermonkey 腳本，零學習成本
- **背景腳本**：創新的背景執行機制，使腳本可持續運作，不受頁面限制
- **排程腳本**：支援定時執行的任務，如自動簽到、定時提醒等
- **豐富 API**：提供比 Tampermonkey 更強大的 API，解鎖更多可能性

### 🛡️ 安全性與可靠性

- **沙盒機制**：腳本在隔離環境中運行，避免惡意腳本互相干擾
- **權限管理**：腳本必須明確請求所需權限，敏感操作需額外確認

### 💻 開發體驗

- **智慧編輯器**：內建程式碼編輯器，提供語法高亮、智慧補全、ESLint
- **除錯工具**：完善的除錯能力，讓你快速定位與解決問題
- **美觀介面**：現代化 UI 設計，清爽直覺的操作體驗

> 🚀 更多功能持續開發中…

## 🚀 快速開始

### 📦 安裝擴充功能

#### 擴充商店（推薦）

| 瀏覽器 | 商店連結 | 狀態 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Chrome  | [正式版](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf) [Beta 版](https://chromewebstore.google.com/detail/scriptcat-beta/jaehimmlecjmebpekkipmpmbpfhdacom) | ✅ 可用 |
| Edge    | [正式版](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh) [Beta 版](https://microsoftedge.microsoft.com/addons/detail/scriptcat-beta/nimmbghgpcjmeniofmpdfkofcedcjpfi) | ✅ 可用 |
| Firefox | [正式版](https://addons.mozilla.org/zh-TW/firefox/addon/scriptcat/) [Beta 版](https://addons.mozilla.org/zh-TW/firefox/addon/scriptcat-pre/) | ✅ MV2 |

#### 手動安裝

如果無法使用瀏覽器擴充商店，可前往  
[GitHub Releases](https://github.com/scriptscat/scriptcat/releases) 下載最新 ZIP 套件進行手動安裝。

### 📝 使用指南

#### 安裝腳本

1. **從腳本市場取得**：前往 [ScriptCat 腳本站](https://scriptcat.org/zh-TW/search) 或其他使用者腳本市場
2. **背景腳本區**：體驗獨特的 [背景腳本](https://scriptcat.org/zh-TW/search?script_type=3)
3. **相容性**：支援多數 Tampermonkey 腳本，可直接安裝。若遇到不相容腳本，歡迎至  
   [issues](https://github.com/scriptscat/scriptcat/issues) 回報給我們。

#### 開發腳本

請參考 [開發文件](https://docs.scriptcat.org/docs/dev/) 與  
[開發者指南](https://learn.scriptcat.org/)，學習如何撰寫腳本。  
文件內容涵蓋從基礎到進階，讓你能輕鬆開始腳本開發。

若你發現文件有錯誤或想貢獻內容，可在文件頁面點擊「Edit this page」進行修改。

---

## 🤝 參與貢獻

我們歡迎各種形式的貢獻！  
請參考 [貢獻指南](./docs/CONTRIBUTING_EN.md) 了解如何開始。

### 💬 社群

加入我們的社群，與其他使用者及開發者交流：

- [Telegram](https://t.me/scriptscat)
- [Discord](https://discord.gg/JF76nHCCM7)

### 🙏 致謝

感謝以下開發者對 ScriptCat 的貢獻。  
因為有你們，ScriptCat 才能變得更好！

[![Contributors](https://contrib.rocks/image?repo=scriptscat/scriptcat&max=1000)](https://github.com/scriptscat/scriptcat/graphs/contributors)

---

## 📄 開源授權

本專案以 [GPLv3](./LICENSE) 授權開源。請遵循相關授權條款。

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat?ref=badge_large)

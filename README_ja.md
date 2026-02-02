<p align="right">
<a href="./README_zh-CN.md">中文</a> <a href="./README.md">English</a> <a href="./README_zh-TW.md">繁體中文</a> <a href="./README_ja.md">日本語</a> <a href="./README_RU.md">Русский</a>
</p>

<h1 align="center">
<img src="./src/assets/logo.png"/><br/>
ScriptCat
</h1>

<p align="center">ScriptCat は、ユーザースクリプトを実行できるブラウザ拡張機能です。すべてをスクリプト化し、ブラウザにもっと多くのことをさせましょう！</p>

<p align="center">
<a href="https://docs.scriptcat.org/">ドキュメント</a> ·
<a href="https://discord.gg/JF76nHCCM7">Discord</a> ·
<a href="https://scriptcat.org/ja/search">ScriptCat スクリプト</a>
</p>

![GitHub stars](https://img.shields.io/github/stars/scriptscat/scriptcat.svg)
[![Build Status](https://github.com/scriptscat/scriptcat/actions/workflows/build.yaml/badge.svg?branch=main)](https://github.com/scriptscat/scriptcat)
[![codecov](https://codecov.io/gh/scriptscat/scriptcat/branch/main/graph/badge.svg?token=G1A6ZGDQTY)](https://codecov.io/gh/scriptscat/scriptcat)
![GitHub tag (latest SemVer)](https://img.shields.io/github/tag/scriptscat/scriptcat.svg?label=version)
[![Chrome](https://img.shields.io/badge/chrome-success-brightgreen?logo=google%20chrome)](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
[![Edge](https://img.shields.io/badge/edge-success-brightgreen?logo=microsoft%20edge)](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)
[![FireFox](https://img.shields.io/badge/firefox-success-brightgreen?logo=firefox)](https://addons.mozilla.org/ja/firefox/addon/scriptcat/)
[![Crowdin](https://badges.crowdin.net/scriptcat/localized.svg)](https://crowdin.com/project/scriptcat)

## ScriptCat について

ScriptCat は、Tampermonkey の設計思想に基づく強力なユーザースクリプトマネージャーで、Tampermonkey のスクリプトと完全な互換性を持ちます。  
従来のユーザースクリプトをサポートするだけでなく、豊富な API 拡張を備えたバックグラウンドスクリプト実行フレームワークを革新的に実装し、スクリプトでより強力な機能を実現できます。  
また、優れた内蔵コードエディタを搭載し、インテリジェント補完や構文チェックに対応しており、スクリプト開発をより効率的かつスムーズに行えます。

**便利だと感じたら、ぜひ Star ⭐ を付けて応援してください！**

## ✨ 主な機能

### 🔄 クラウド同期

- **スクリプトのクラウド同期**：デバイス間でスクリプトを同期し、ブラウザ変更やシステム再インストール時も簡単に復元
- **スクリプトサブスクライブ機能**：スクリプトコレクションを作成・管理し、チーム協力やスクリプトの組み合わせをサポート

### 🔧 強力な機能

- **Tampermonkey と完全互換**：既存の Tampermonkey スクリプトを学習コストなしでそのまま移行可能
- **バックグラウンドスクリプト**：ページに依存せず連続実行できる革新的なバックグラウンド実行機構
- **スケジュールスクリプト**：自動チェックイン、リマインダーなどの定時実行をサポート
- **豊富な API**：Tampermonkey 以上の強力な API 群を提供

### 🛡️ セキュリティと信頼性

- **サンドボックス機構**：スクリプトを隔離環境で実行し、悪意あるコードの影響を防止
- **権限管理**：スクリプトは必要な権限を明確に要求し、機密操作には追加確認が必要

### 💻 開発体験

- **スマートエディタ**：構文ハイライト、インテリジェント補完、ESLint を備えた内蔵エディタ
- **デバッグツール**：問題を迅速に特定して解決できる包括的なデバッグ機能
- **美しい UI**：モダンで直感的なクリーンデザイン

> 🚀 続々と新機能を開発中…

## 🚀 クイックスタート

### 📦 拡張機能のインストール

#### 拡張ストア（推奨）

| ブラウザ | ストアリンク | ステータス |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Chrome   | [安定版](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf) [Beta 版](https://chromewebstore.google.com/detail/scriptcat-beta/jaehimmlecjmebpekkipmpmbpfhdacom) | ✅ 利用可能 |
| Edge     | [安定版](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh) [Beta 版](https://microsoftedge.microsoft.com/addons/detail/scriptcat-beta/nimmbghgpcjmeniofmpdfkofcedcjpfi) | ✅ 利用可能 |
| Firefox  | [安定版](https://addons.mozilla.org/ja/firefox/addon/scriptcat/) [Beta 版](https://addons.mozilla.org/ja/firefox/addon/scriptcat-pre/) | ✅ MV2 |

#### 手動インストール

拡張ストアにアクセスできない場合は、  
[GitHub Releases](https://github.com/scriptscat/scriptcat/releases) から最新の ZIP パッケージをダウンロードして手動インストールできます。

### 📝 使用ガイド

#### スクリプトのインストール

1. **スクリプトセンターから取得**： [ScriptCat スクリプトセンター](https://scriptcat.org/ja/search) またはその他のユーザースクリプトセンターへアクセス
2. **バックグラウンドスクリプトセンター**：ユニークな [バックグラウンドスクリプト](https://scriptcat.org/ja/search?script_type=3) を体験
3. **互換性**：多くの Tampermonkey スクリプトをサポートしており、そのままインストール可能。不具合があれば  
   [issues](https://github.com/scriptscat/scriptcat/issues) にてご報告ください。

#### スクリプト開発

[開発ドキュメント](https://docs.scriptcat.org/docs/dev/) と  
[開発者ガイド](https://learn.scriptcat.org/) を参照して、スクリプトの書き方を学べます。  
基礎から応用まで幅広くカバーし、スムーズに開発を始められます。

ドキュメントの誤りや改善案があれば、ページ上の「Edit this page」から編集できます。

---

## 🤝 コントリビューション

あらゆる形式の貢献を歓迎します！  
まずは [Contributing Guide](./docs/CONTRIBUTING_EN.md) をご覧ください。

### 💬 コミュニティ

ユーザーや開発者と交流するには、以下のコミュニティへ参加してください：

- [Telegram](https://t.me/scriptscat)
- [Discord](https://discord.gg/JF76nHCCM7)

### 🙏 謝辞

ScriptCat に貢献してくださった開発者の皆様に感謝します。  
あなたの協力によって ScriptCat はより良いものになっています！

[![Contributors](https://contrib.rocks/image?repo=scriptscat/scriptcat&max=1000)](https://github.com/scriptscat/scriptcat/graphs/contributors)

---

## 📄 オープンソースライセンス

このプロジェクトは [GPLv3](./LICENSE) ライセンスのもとで公開されています。  
関連するライセンス条項を遵守してください。

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat?ref=badge_large)

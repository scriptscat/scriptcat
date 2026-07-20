# 翻译与本地化指南 / Translation & Localization Guide

> **开始任何翻译之前，先读本文件。**
> 凡是新增或修改本地化内容（`src/locales/<locale>/` 下按命名空间拆分的 `*.json` 文件、对应语言的文档、界面文案、测试快照），都必须先阅读本指南，并遵循对应语言的术语规范文件。

本目录是 ScriptCat 翻译 / 本地化的单一信息源：

- **本文件** —— 通用的术语与本地化修改规则、翻译工作流、提示词。
- **`terminology-<locale>.md`** —— 各语言地区（locale）的术语与界面文案规范，由译者按目标语言的自然表达编写。

## 适用范围

以下要求适用于所有会新增或修改本地化内容的人类贡献者与 AI 任务。

## 术语与本地化修改规则

```md
凡是新增或修改某个语言地区（locale）的内容，必须先检查是否存在对应的术语规范文件 `docs/references/terminology-<locale>.md`；如果存在，必须读取并遵循该文件。例如，修改 Traditional Chinese / 繁体中文（zh-TW）时，必须遵循 `docs/references/terminology-zh-TW.md`。

- 遵循目标语言地区的自然表达和产品界面惯用语，不可仅做文字或字形的机械转换。
- 对应术语规范文件中标注为固定保留的术语，或明确限定在当前同类 UI 场景中的修正规则，必须遵循。
- 不要把某个界面文案的修正扩大成该词在所有上下文中的禁用规则；对于需要结合语境判断的项目，不得机械式全局替换，应根据功能语境与原文含义选择用词。
- 如果目标 locale 尚无术语规范文件，应保持现有翻译风格，并避免擅自引入新的术语标准。
- 保留 i18next placeholder、程序标识符、HTML/React 标记和既有功能行为。
- 完成后检查本次修改的本地化内容，确认符合对应的术语规范文件（如存在）。
```

## 各语言术语规范 / Per-locale terminology

| Locale | 语言 / Language | 规范文件 |
| --- | --- | --- |
| `en-US` | English (US) | [terminology-en-US.md](./references/terminology-en-US.md) |
| `zh-CN` | 简体中文 | [terminology-zh-CN.md](./references/terminology-zh-CN.md) |
| `zh-TW` | 繁體中文 | [terminology-zh-TW.md](./references/terminology-zh-TW.md) |
| `ja-JP` | 日本語 | [terminology-ja-JP.md](./references/terminology-ja-JP.md) |
| `ru-RU` | Русский | [terminology-ru-RU.md](./references/terminology-ru-RU.md) |
| `de-DE` | Deutsch | [terminology-de-DE.md](./references/terminology-de-DE.md) |
| `vi-VN` | Tiếng Việt | [terminology-vi-VN.md](./references/terminology-vi-VN.md) |
| `tr-TR` | Türkçe | [terminology-tr-TR.md](./references/terminology-tr-TR.md) |
| `pt-BR` | Português (Brasil) | [terminology-pt-BR.md](./references/terminology-pt-BR.md) |

> `en-US` 是运行时的回退语言（fallback），也是新翻译的模板。其措辞应被刻意校准而非将含糊或不通顺的英文直接传播到其他 locale。

新增一个语言的术语规范时，复制一份现有文件（建议以 `terminology-en-US.md` 为结构参考），按目标语言重写内容，并在上表中登记。

## 翻译工作流 / Workflow

- 翻译文件位于 `src/locales/<locale>/`，按命名空间（页面）拆分为多个 `*.json` 文件（如 `common.json`、`popup.json`、`script.json`），最终由 `src/locales/locales.ts` 合并导出。
- **改进已有翻译**：直接编辑对应语言目录下相应命名空间的 `*.json` 文件。`defaultNS` 为 `common`，其它命名空间的 key 在代码中需带 `ns:` 前缀（如 `t("script:tags")`）。
- **新增语言**：在 `src/locales/` 下新建语言代码目录（如 `fr-FR`），复制 `en-US/` 下的各命名空间 `*.json` 与 `index.ts` 作为模板翻译，并在 `src/locales/locales.ts` 中注册；如需术语规范，在本目录新增 `terminology-fr-FR.md`。
- **关键字冲突**：同一页面中关键字相同但翻译不同时，使用 `page.key` 的方式区分。
- 为满足部分扩展市场要求，`chrome.i18n` 语言文件位于 `src/assets/_locales`。
- i18n 方案的实现细节见 [`src/locales/README.md`](../src/locales/README.md)。

## 提取翻译提示词 / Extract-translation prompt

将 React 文件中的中文提取为 i18next key 时使用：

```md
你是一个翻译专家，使用 react-i18next 做为翻译框架，我需要你帮助我翻译这个 React 文件中的中文，首先你需要提取文件中的中文部分，生成一个合适的 key，使用蛇形命名，添加到 src/locales/zh-CN/ 下对应命名空间的 json 文件中（如 common.json、script.json），注意非 common 命名空间的 key 在代码中需带 `ns:` 前缀，然后使用 `useTranslation` 替换原有中文，如果有参数你可以使用 i18next 的格式，不需要处理其他语言，不要做多余的事情
```

## 完成前检查清单 / Checklist

1. 确认目标 locale，并已阅读本指南与对应的 `terminology-<locale>.md`（如存在）。
2. 使用目标语言的自然表达；对同一 ScriptCat 概念使用规范中的固定术语，不要基于相近措辞合并不同的脚本类型。
3. 对需结合语境的术语，先核对实际功能、控件类型与上下文文案再决定用词。
4. 保留 i18next 插值、程序标识符、HTML/React 标记、URL 与元数据标识符（`@match`、`@require` 等）。
5. 完成后复查本次修改，确认符合对应术语规范，并检查命名一致性、名词/动词混用等问题。
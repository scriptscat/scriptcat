# ScriptCat 文档索引 / Documentation Index

本目录收录 ScriptCat **贡献者 / 维护者**面向的文档。想*编写*用户脚本的读者请改看 [docs.scriptcat.org](https://docs.scriptcat.org/)。

## 开发文档 / Development

| 文档 | 说明 |
| --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | 工程原则、架构速览、AI/贡献者约定的单一信息源(`CLAUDE.md` 仅导入它)。 |
| [`develop.md`](./develop.md) | 开发规范:命令、目录结构、编码风格、UI/主题、i18n、提交/PR 流程;测试机制(含 Vitest 性能)拆到 [`references/develop-testing.md`](./references/develop-testing.md)。**写代码前先读。** |
| [`design.md`](./design.md) | 设计系统参考:主题机制、shadcn 组件选型、新建页面配方总览;令牌完整值拆到 [`references/design-tokens.md`](./references/design-tokens.md),组件清单拆到 [`references/design-components.md`](./references/design-components.md),布局/响应式/动效/状态/无障碍范式拆到 [`references/design-patterns.md`](./references/design-patterns.md)。**做页面/对话框/区块前先读。** |
| [`verification.md`](./verification.md) | 功能验证指南:用一次性 scratch 脚本驱动真实扩展做端到端验证(不跑全量 E2E、不加永久用例);报告模板拆到 [`references/verification-report-template.md`](./references/verification-report-template.md),调试 FAQ 拆到 [`references/verification-debugging.md`](./references/verification-debugging.md)。**验证改动是否真正跑通时读。** |
| [`architecture.md`](./architecture.md) | 内部原理总览:多进程模型、消息传递;各子系统深入拆到 [`references/architecture-services.md`](./references/architecture-services.md)(服务层)、[`references/architecture-data.md`](./references/architecture-data.md)(数据层)、[`references/architecture-gm-api.md`](./references/architecture-gm-api.md)(GM API)、[`references/architecture-execution.md`](./references/architecture-execution.md)(脚本执行)、[`references/architecture-build.md`](./references/architecture-build.md)(构建管线)。 |
| [`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md) | 文档维护与事实核对指南:组织规则、逐条核对清单、一键校验脚本。**改/审文档前先读。** |

## 翻译 / Translation

| 文档 | 说明 |
| --- | --- |
| [`translation.md`](./translation.md) | 翻译 / 本地化指南(单一信息源):术语与修改规则、工作流、提取翻译提示词。**翻译前先读。** |
| [`translation.md` 术语规范表](./translation.md#各语言术语规范--per-locale-terminology) | 9 个语言地区的术语与界面文案规范 `terminology-<locale>.md`(en-US / zh-CN / zh-TW / ja-JP / ru-RU / de-DE / vi-VN / tr-TR / pt-BR)。 |

## 贡献指南 / Contributing

| 文档 | 语言 / Language |
| --- | --- |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | English(主文档) |
| [`CONTRIBUTING_ZH.md`](./CONTRIBUTING_ZH.md) | 简体中文 |
| [`CONTRIBUTING_RU.md`](./CONTRIBUTING_RU.md) | Русский |

## 各语言 README / Localized README

| 文档 | 语言 / Language |
| --- | --- |
| [`../README.md`](../README.md) | English(主文档) |
| [`README_zh-CN.md`](./README_zh-CN.md) | 简体中文 |
| [`README_zh-TW.md`](./README_zh-TW.md) | 繁體中文 |
| [`README_ja.md`](./README_ja.md) | 日本語 |
| [`README_RU.md`](./README_RU.md) | Русский |
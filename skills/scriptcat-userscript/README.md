# scriptcat-userscript

给 AI 编码代理（Claude Code、Codex 等）用的 Skill：指导编写、修改、调试脚本猫用户脚本——页面脚本（`@match`）、
后台脚本（`@background`）、定时脚本（`@crontab`），并在接入 [sctl](https://github.com/scriptscat/sctl) 时
把脚本装进用户的脚本猫、在真实浏览器里验证。

## 结构

| 文件 | 内容 |
|---|---|
| `SKILL.md` | 入口：选脚本类型、骨架、容易写错的规则、安装与验证的分流 |
| `references/api.md` | 脚本猫实现的全部 GM / CAT API（按 grant 分组），以及与 Tampermonkey 的差异 |
| `references/background.md` | 后台/定时脚本：Promise 生命周期、`CATRetryError` 重试、cron 与 `once` 扩展、日志 |
| `references/userconfig.md` | `==UserConfig==` 用户配置格式 |
| `references/dev-loop.md` | 用 sctl 安装 → 打开页面 → 看控制台 → 重装或 `sctl edit` 迭代的流程 |

API 以 `src/types/scriptcat.d.ts` 和 `src/pkg/utils/script_compat.ts`（支持的指令与 grant 白名单）为准；
修改这两处时同步检查本 Skill。sctl 本身的操作规范在 sctl 仓库的 `skills/sctl`，这里只引用、不重复。

## 安装

```sh
ln -s "$(pwd)/skills/scriptcat-userscript" ~/.claude/skills/scriptcat-userscript
ln -s "$(pwd)/skills/scriptcat-userscript" ~/.codex/skills/scriptcat-userscript
```

## 已知限制

- sctl 无法触发后台/定时脚本运行，也读不到脚本猫的运行日志，这两类脚本只能由用户在脚本列表查看运行状态与
  `GM_log` 输出。
